import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import { calculateBookkeepingBatch, prepareBookkeepingBatch } from './bookkeeping-engine';
import type { BankTransactionInput, JournalEntryInput, JournalLineInput, LedgerCashItemInput } from './bookkeeping-engine';
import { getPayrollRun, preparePayrollRun } from './payroll-engine';
import type { PayrollJournalLine, PayrollRunInput } from './payroll-engine';
import { getServiceDeployment } from './service-deployments';
import { assertDateRangeOpenForCompany } from './close-governance-engine';

export type AccountRef = {
  account_code: string;
  account_name?: string;
};

export type PayrollAccountMapping = Record<PayrollJournalLine['account_role'], AccountRef> & {
  BANK_CASH: AccountRef;
};

export type SettlementCategory = 'NET_PAYROLL' | 'INCOME_TAX' | 'PENSION';

export type PayrollSettlementInput = {
  settlement_id: string;
  category: SettlementCategory;
  date: string;
  amount: number;
  reference?: string;
  description?: string;
};

export type BankBalanceControlInput = {
  statement_closing_balance: number;
  ledger_closing_balance: number;
};

export type FinanceCycleInput = {
  payroll_run_id?: string;
  payroll_input?: PayrollRunInput;
  period_start: string;
  period_end: string;
  account_mapping: PayrollAccountMapping;
  bank_transactions?: BankTransactionInput[];
  settlements?: PayrollSettlementInput[];
  additional_journals?: JournalEntryInput[];
  additional_ledger_cash_items?: LedgerCashItemInput[];
  bank_control?: BankBalanceControlInput;
  period_scope_complete?: boolean;
};

export const FINANCE_CYCLE_CAPABILITIES = {
  version: 'FINANCE-CYCLE-V1',
  monthly_close_version: 'MONTHLY-CLOSE-CONTROL-V2',
  implemented: [
    'prepare or reuse a payroll run under the combined bookkeeping-and-payroll service',
    'translate payroll journal account roles into explicit customer/company account codes',
    'translate payroll-liability settlements into payable-to-bank journals',
    'derive settlement cash-ledger items for bank reconciliation',
    'merge payroll journals with caller-supplied bookkeeping journals for the close period',
    'run deterministic bookkeeping validation and bank-to-ledger reconciliation',
    'prepare a monthly-close control package with explicit blockers and approval boundary',
    'persist finance-cycle and monthly-close lineage to payroll and bookkeeping records'
  ],
  safeguards: [
    'FinClose never guesses chart-of-accounts codes; account-role mapping is mandatory.',
    'Final monthly-close approval requires Layer A source completeness and material balance-sheet reconciliation.',
    'A monthly close can pass controls only when a bank closing-balance control is supplied and balances agree.',
    'Ambiguous or unmatched bank reconciliation items remain close blockers.',
    'Prepared monthly close does not lock the period, post externally, submit payroll filings or initiate payments.',
    'Payroll recognition journals are dated at pay_period_end in V1; alternative recognition-date policies are not yet configurable.'
  ],
  execution_boundary: 'PREPARED_PENDING_LAYER_A'
} as const;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function cents(value: unknown, field: string, allowNegative = true) {
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) {
    throw httpError(`${field} must be ${allowNegative ? 'a number' : 'a non-negative number'}`, 400);
  }
  return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
}

function isoDate(value: unknown, field: string) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw httpError(`${field} must be YYYY-MM-DD`, 400);
  }
  return text;
}

function cleanAccount(ref: AccountRef | undefined, role: string): AccountRef {
  const code = String(ref?.account_code || '').trim();
  if (!code) throw httpError(`account_mapping.${role}.account_code is required`, 400);
  const name = String(ref?.account_name || '').trim();
  return name ? { account_code: code, account_name: name } : { account_code: code };
}

function lineFor(account: AccountRef, side: 'DEBIT' | 'CREDIT', amount: number): JournalLineInput {
  const line: JournalLineInput = {
    account_code: account.account_code,
    ...(account.account_name ? { account_name: account.account_name } : {})
  };
  if (side === 'DEBIT') line.debit = amount;
  else line.credit = amount;
  return line;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((out, key) => {
      const item = record[key];
      if (item !== undefined) out[key] = stable(item);
      return out;
    }, {});
  }
  return value;
}

function stableFingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normalizedMapping(mapping: PayrollAccountMapping) {
  return {
    SALARY_EXPENSE: cleanAccount(mapping?.SALARY_EXPENSE, 'SALARY_EXPENSE'),
    EMPLOYER_PENSION_EXPENSE: cleanAccount(mapping?.EMPLOYER_PENSION_EXPENSE, 'EMPLOYER_PENSION_EXPENSE'),
    NET_PAYROLL_PAYABLE: cleanAccount(mapping?.NET_PAYROLL_PAYABLE, 'NET_PAYROLL_PAYABLE'),
    INCOME_TAX_PAYABLE: cleanAccount(mapping?.INCOME_TAX_PAYABLE, 'INCOME_TAX_PAYABLE'),
    PENSION_PAYABLE: cleanAccount(mapping?.PENSION_PAYABLE, 'PENSION_PAYABLE'),
    BANK_CASH: cleanAccount(mapping?.BANK_CASH, 'BANK_CASH')
  };
}

export function payrollRunToJournal(run: Record<string, any>, mappingInput: PayrollAccountMapping): JournalEntryInput {
  if (!run?.payroll_run_id) throw httpError('payroll run id is missing', 409);
  if (!run?.controls?.journal_balanced) throw httpError('payroll journal is not balanced', 409);
  const mapping = normalizedMapping(mappingInput);
  const currency = String(run.currency || '').trim().toUpperCase();
  if (!currency) throw httpError('payroll currency is missing', 409);
  const date = isoDate(run.pay_period_end, 'payroll pay_period_end');
  const payrollLines = Array.isArray(run.journal) ? run.journal as PayrollJournalLine[] : [];
  if (!payrollLines.length) throw httpError('payroll journal is missing', 409);

  const lines = payrollLines.map(line => {
    const role = line.account_role;
    const account = mapping[role];
    if (!account) throw httpError(`account mapping is missing for payroll role ${role}`, 400);
    const amount = cents(line.amount, `payroll journal amount for ${role}`, false);
    if (amount <= 0) throw httpError(`payroll journal amount for ${role} must be positive`, 409);
    return lineFor(account, line.side, amount);
  });

  return {
    external_id: `PAYROLL-${run.payroll_run_id}`,
    date,
    description: `Payroll ${run.pay_period_start} to ${run.pay_period_end}`,
    currency,
    lines
  };
}

function payableRoleFor(category: SettlementCategory): PayrollJournalLine['account_role'] {
  if (category === 'NET_PAYROLL') return 'NET_PAYROLL_PAYABLE';
  if (category === 'INCOME_TAX') return 'INCOME_TAX_PAYABLE';
  return 'PENSION_PAYABLE';
}

export function settlementArtifacts(
  run: Record<string, any>,
  settlementsInput: PayrollSettlementInput[],
  mappingInput: PayrollAccountMapping
) {
  const mapping = normalizedMapping(mappingInput);
  const currency = String(run.currency || '').trim().toUpperCase();
  const seen = new Set<string>();
  const journals: JournalEntryInput[] = [];
  const ledgerCashItems: LedgerCashItemInput[] = [];
  const totals: Record<SettlementCategory, number> = { NET_PAYROLL: 0, INCOME_TAX: 0, PENSION: 0 };

  for (const raw of settlementsInput || []) {
    const settlementId = String(raw.settlement_id || '').trim();
    if (!settlementId) throw httpError('settlement_id is required', 400);
    if (seen.has(settlementId)) throw httpError(`duplicate settlement_id: ${settlementId}`, 400);
    seen.add(settlementId);
    const category = String(raw.category || '').trim().toUpperCase() as SettlementCategory;
    if (!['NET_PAYROLL', 'INCOME_TAX', 'PENSION'].includes(category)) {
      throw httpError(`unsupported settlement category for ${settlementId}`, 400);
    }
    const date = isoDate(raw.date, `settlement date for ${settlementId}`);
    const amount = cents(raw.amount, `settlement amount for ${settlementId}`, false);
    if (amount <= 0) throw httpError(`settlement amount for ${settlementId} must be positive`, 400);
    const payableRole = payableRoleFor(category);
    const payable = mapping[payableRole];
    const reference = String(raw.reference || '').trim();
    const description = String(raw.description || '').trim() || `${category.replaceAll('_', ' ')} settlement`;

    journals.push({
      external_id: `SETTLEMENT-${run.payroll_run_id}-${settlementId}`,
      date,
      description,
      currency,
      lines: [
        lineFor(payable, 'DEBIT', amount),
        lineFor(mapping.BANK_CASH, 'CREDIT', amount)
      ]
    });
    ledgerCashItems.push({
      ledger_item_id: `SETTLEMENT-CASH-${run.payroll_run_id}-${settlementId}`,
      date,
      amount: -amount,
      reference,
      description
    });
    totals[category] = cents(totals[category] + amount, `settlement total for ${category}`);
  }

  return { journals, ledger_cash_items: ledgerCashItems, totals };
}

function expectedPayrollLiabilities(run: Record<string, any>) {
  const totals = run.totals || {};
  return {
    NET_PAYROLL: cents(totals.net_pay || 0, 'payroll net pay', false),
    INCOME_TAX: cents(totals.income_tax || 0, 'payroll income tax', false),
    PENSION: cents(Number(totals.employee_pension || 0) + Number(totals.employer_pension || 0), 'payroll pension payable', false)
  } as Record<SettlementCategory, number>;
}

export function evaluateMonthlyClose(input: {
  payrollRun: Record<string, any>;
  bookkeepingBatch: Record<string, any>;
  settlementTotals: Record<SettlementCategory, number>;
  bankControl?: BankBalanceControlInput;
  periodScopeComplete: boolean;
}) {
  const payrollRun = input.payrollRun;
  const bookkeeping = input.bookkeepingBatch;
  const reconciliation = bookkeeping.reconciliation || {};
  const controls = bookkeeping.controls || {};
  const exceptions: string[] = [];

  if (!payrollRun?.controls?.journal_balanced) exceptions.push('PAYROLL_JOURNAL_NOT_BALANCED');
  if (!controls.all_journals_balanced) exceptions.push('BOOKKEEPING_JOURNAL_NOT_BALANCED');
  if (Number(reconciliation?.controls?.ambiguous_count || 0) > 0) exceptions.push('BANK_RECONCILIATION_AMBIGUOUS_ITEMS');
  if (Number(reconciliation?.controls?.unmatched_bank_count || 0) > 0) exceptions.push('BANK_RECONCILIATION_UNMATCHED_BANK_ITEMS');
  if (Number(reconciliation?.controls?.unmatched_ledger_count || 0) > 0) exceptions.push('BANK_RECONCILIATION_UNMATCHED_LEDGER_ITEMS');

  let bankBalanceDifference: number | null = null;
  if (!input.bankControl) {
    exceptions.push('BANK_CLOSING_BALANCE_CONTROL_NOT_PROVIDED');
  } else {
    const statement = cents(input.bankControl.statement_closing_balance, 'statement_closing_balance');
    const ledger = cents(input.bankControl.ledger_closing_balance, 'ledger_closing_balance');
    bankBalanceDifference = cents(statement - ledger, 'bank closing balance difference');
    if (bankBalanceDifference !== 0) exceptions.push('BANK_CLOSING_BALANCE_DIFFERENCE');
  }

  const expected = expectedPayrollLiabilities(payrollRun);
  const outstanding = {
    NET_PAYROLL: cents(expected.NET_PAYROLL - Number(input.settlementTotals.NET_PAYROLL || 0), 'net payroll outstanding'),
    INCOME_TAX: cents(expected.INCOME_TAX - Number(input.settlementTotals.INCOME_TAX || 0), 'income tax outstanding'),
    PENSION: cents(expected.PENSION - Number(input.settlementTotals.PENSION || 0), 'pension outstanding')
  };
  if (outstanding.NET_PAYROLL < 0) exceptions.push('NET_PAYROLL_OVERSETTLED');
  if (outstanding.INCOME_TAX < 0) exceptions.push('INCOME_TAX_OVERSETTLED');
  if (outstanding.PENSION < 0) exceptions.push('PENSION_OVERSETTLED');

  const controlStatus = exceptions.length ? 'EXCEPTIONS_OPEN' : 'PASS';
  return {
    close_engine_version: FINANCE_CYCLE_CAPABILITIES.monthly_close_version,
    status: controlStatus === 'PASS' ? 'CORE_CONTROLS_PASS_LAYER_A_REQUIRED' : 'EXCEPTIONS_OPEN',
    control_status: controlStatus,
    close_status: 'PREPARED_NOT_CLOSED',
    approval_status: 'BLOCKED_PENDING_LAYER_A',
    controls: {
      payroll_journal_balanced: Boolean(payrollRun?.controls?.journal_balanced),
      bookkeeping_journals_balanced: Boolean(controls.all_journals_balanced),
      bank_reconciliation_matched_count: Number(reconciliation?.controls?.matched_count || 0),
      bank_reconciliation_ambiguous_count: Number(reconciliation?.controls?.ambiguous_count || 0),
      bank_reconciliation_unmatched_bank_count: Number(reconciliation?.controls?.unmatched_bank_count || 0),
      bank_reconciliation_unmatched_ledger_count: Number(reconciliation?.controls?.unmatched_ledger_count || 0),
      bank_closing_balance_difference: bankBalanceDifference,
      legacy_period_scope_attestation: input.periodScopeComplete === true
    },
    payroll_liabilities: {
      expected,
      settled_in_period: input.settlementTotals,
      outstanding_at_period_end: outstanding,
      note: 'Outstanding payroll liabilities are informational unless over-settled; a valid month-end close may contain liabilities payable after period end.'
    },
    exceptions,
    limitations: [
      'This core close package requires Layer A source-completeness and balance-sheet controls before approval.',
      'Internal FinClose approval and period locking are handled by CLOSE-GOVERNANCE-LAYER-A-V1.',
      'No external accounting-system posting, external-provider period lock, filing or payment is performed.',
      'period_scope_complete is retained only as a deprecated compatibility attestation and is not an approval control.'
    ]
  };
}

async function resolvePayrollRun(deploymentId: string, input: FinanceCycleInput) {
  const runId = String(input.payroll_run_id || '').trim();
  const hasPayrollInput = Boolean(input.payroll_input);
  if (Boolean(runId) === hasPayrollInput) {
    throw httpError('provide exactly one of payroll_run_id or payroll_input', 400);
  }
  if (runId) return getPayrollRun(deploymentId, runId) as Promise<Record<string, any>>;
  return preparePayrollRun(deploymentId, input.payroll_input!) as Promise<Record<string, any>>;
}

export async function prepareFinanceCycle(deploymentId: string, input: FinanceCycleInput) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  if (String(deployment.service) !== 'bookkeeping-payroll') {
    throw httpError('the automated payroll-to-close cycle requires the Bookkeeping & Payroll service', 409);
  }
  if (!deployment.company_id) throw httpError('link or initialize the company before preparing the finance cycle', 409);
  if (!['RECEIVED', 'NOT_APPLICABLE_NEW_COMPANY'].includes(String(deployment.history_status || ''))) {
    throw httpError('complete historical context before preparing the finance cycle', 409);
  }

  const periodStart = isoDate(input.period_start, 'period_start');
  const periodEnd = isoDate(input.period_end, 'period_end');
  if (periodStart > periodEnd) throw httpError('period_start must not be after period_end', 400);
  await assertDateRangeOpenForCompany(String(deployment.company_id), periodStart, periodEnd, 'finance cycle');

  const mapping = normalizedMapping(input.account_mapping);
  const payrollRun = await resolvePayrollRun(deploymentId, input);
  const payrollPeriodEnd = isoDate(payrollRun.pay_period_end, 'payroll pay_period_end');
  if (payrollPeriodEnd < periodStart || payrollPeriodEnd > periodEnd) {
    throw httpError('payroll pay-period end must fall inside the finance-cycle period', 409);
  }

  const settlements = settlementArtifacts(payrollRun, input.settlements || [], mapping as PayrollAccountMapping);
  for (const journal of settlements.journals) {
    if (journal.date < periodStart || journal.date > periodEnd) {
      throw httpError(`settlement journal ${journal.external_id} is outside the finance-cycle period`, 409);
    }
  }

  const payrollJournal = payrollRunToJournal(payrollRun, mapping as PayrollAccountMapping);
  const bookkeepingInput = {
    period_start: periodStart,
    period_end: periodEnd,
    currency: String(payrollRun.currency || '').toUpperCase(),
    journals: [payrollJournal, ...settlements.journals, ...(input.additional_journals || [])],
    bank_transactions: input.bank_transactions || [],
    ledger_cash_items: [...settlements.ledger_cash_items, ...(input.additional_ledger_cash_items || [])]
  };

  const fingerprint = stableFingerprint({
    payroll_run_id: payrollRun.payroll_run_id,
    period_start: periodStart,
    period_end: periodEnd,
    account_mapping: mapping,
    settlements: input.settlements || [],
    bank_transactions: input.bank_transactions || [],
    additional_journals: input.additional_journals || [],
    additional_ledger_cash_items: input.additional_ledger_cash_items || [],
    bank_control: input.bank_control || null,
    period_scope_complete: input.period_scope_complete ?? null
  });
  const cycleId = `${deploymentId}__${periodEnd}__${fingerprint.slice(0, 16)}`;
  const closeId = `${deploymentId}__close__${periodEnd}__${fingerprint.slice(0, 16)}`;
  const db = realtimeDatabase();
  const existing = await db.ref(`finclose_finance_cycles/${cycleId}`).once('value');
  if (existing.exists()) return { ...existing.val(), duplicate: true };

  const bookkeepingBatch = await prepareBookkeepingBatch(deploymentId, bookkeepingInput) as Record<string, any>;
  const close = evaluateMonthlyClose({
    payrollRun,
    bookkeepingBatch,
    settlementTotals: settlements.totals,
    bankControl: input.bank_control,
    periodScopeComplete: input.period_scope_complete
  });

  const now = Date.now();
  const closeRecord = {
    ...close,
    monthly_close_id: closeId,
    finance_cycle_id: cycleId,
    deployment_id: deploymentId,
    company_id: deployment.company_id,
    company_name: deployment.company_name || null,
    period_start: periodStart,
    period_end: periodEnd,
    payroll_run_id: payrollRun.payroll_run_id,
    bookkeeping_batch_id: bookkeepingBatch.bookkeeping_batch_id,
    created_at: now,
    updated_at: now
  };
  const cycleRecord = {
    finance_cycle_id: cycleId,
    engine_version: FINANCE_CYCLE_CAPABILITIES.version,
    deployment_id: deploymentId,
    company_id: deployment.company_id,
    company_name: deployment.company_name || null,
    service: deployment.service,
    period_start: periodStart,
    period_end: periodEnd,
    input_fingerprint: fingerprint,
    payroll_run_id: payrollRun.payroll_run_id,
    payroll_rule_pack_id: payrollRun.rule_pack_id,
    payroll_journal_external_id: payrollJournal.external_id,
    bookkeeping_batch_id: bookkeepingBatch.bookkeeping_batch_id,
    monthly_close_id: closeId,
    stage_status: {
      payroll: payrollRun.status || 'PREPARED',
      payroll_journal_handoff: 'HANDED_OFF_TO_BOOKKEEPING',
      bookkeeping: bookkeepingBatch.status || 'PREPARED',
      bank_reconciliation: close.controls.bank_reconciliation_ambiguous_count === 0 && close.controls.bank_reconciliation_unmatched_bank_count === 0 && close.controls.bank_reconciliation_unmatched_ledger_count === 0 ? 'PASS' : 'EXCEPTIONS_OPEN',
      monthly_close: close.status
    },
    execution_boundary: 'NO_PAYMENT_NO_FILING_NO_EXTERNAL_POSTING_NO_PERIOD_LOCK',
    monthly_close: closeRecord,
    created_at: now,
    updated_at: now
  };

  const auditCycleKey = db.ref('finclose_audit_events').push().key!;
  const auditCloseKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_finance_cycles/${cycleId}`]: cycleRecord,
    [`finclose_monthly_closes/${closeId}`]: closeRecord,
    [`finclose_payroll_runs/${payrollRun.payroll_run_id}/latest_finance_cycle_id`]: cycleId,
    [`finclose_payroll_runs/${payrollRun.payroll_run_id}/latest_bookkeeping_batch_id`]: bookkeepingBatch.bookkeeping_batch_id,
    [`finclose_payroll_runs/${payrollRun.payroll_run_id}/handoff_status`]: 'HANDED_OFF_TO_BOOKKEEPING',
    [`finclose_bookkeeping_batches/${bookkeepingBatch.bookkeeping_batch_id}/finance_cycle_id`]: cycleId,
    [`finclose_bookkeeping_batches/${bookkeepingBatch.bookkeeping_batch_id}/source_payroll_run_id`]: payrollRun.payroll_run_id,
    [`finclose_bookkeeping_batches/${bookkeepingBatch.bookkeeping_batch_id}/monthly_close_id`]: closeId,
    [`finclose_service_deployments/${deploymentId}/latest_finance_cycle_id`]: cycleId,
    [`finclose_service_deployments/${deploymentId}/latest_monthly_close_id`]: closeId,
    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,
    [`finclose_audit_events/${auditCycleKey}`]: {
      event: 'FINANCE_CYCLE_PREPARED',
      finance_cycle_id: cycleId,
      deployment_id: deploymentId,
      company_id: deployment.company_id,
      payroll_run_id: payrollRun.payroll_run_id,
      bookkeeping_batch_id: bookkeepingBatch.bookkeeping_batch_id,
      input_fingerprint: fingerprint,
      created_at: now
    },
    [`finclose_audit_events/${auditCloseKey}`]: {
      event: 'MONTHLY_CLOSE_CONTROL_PREPARED',
      monthly_close_id: closeId,
      finance_cycle_id: cycleId,
      deployment_id: deploymentId,
      company_id: deployment.company_id,
      control_status: close.control_status,
      exception_count: close.exceptions.length,
      created_at: now
    }
  });

  return cycleRecord;
}

export async function getFinanceCycle(deploymentId: string, cycleId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const snap = await realtimeDatabase().ref(`finclose_finance_cycles/${cycleId}`).once('value');
  if (!snap.exists()) throw httpError('finance cycle not found', 404);
  const record = snap.val() as Record<string, any>;
  if (String(record.deployment_id) !== deploymentId || String(record.company_id) !== String(deployment.company_id)) {
    throw httpError('finance cycle does not belong to this service deployment', 403);
  }
  return record;
}

export async function getMonthlyClose(deploymentId: string, closeId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const snap = await realtimeDatabase().ref(`finclose_monthly_closes/${closeId}`).once('value');
  if (!snap.exists()) throw httpError('monthly close not found', 404);
  const record = snap.val() as Record<string, any>;
  if (String(record.deployment_id) !== deploymentId || String(record.company_id) !== String(deployment.company_id)) {
    throw httpError('monthly close does not belong to this service deployment', 403);
  }
  return record;
}

export function financeCycleSelfTest() {
  const payrollRun = {
    payroll_run_id: 'SYNTH-PAYROLL-001',
    rule_pack_id: 'GE-2026-BASIC-EMPLOYMENT-V1',
    currency: 'GEL',
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    totals: { net_pay: 780, income_tax: 200, employee_pension: 20, employer_pension: 20 },
    controls: { journal_balanced: true },
    journal: [
      { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: 1000 },
      { side: 'DEBIT', account_role: 'EMPLOYER_PENSION_EXPENSE', amount: 20 },
      { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: 780 },
      { side: 'CREDIT', account_role: 'INCOME_TAX_PAYABLE', amount: 200 },
      { side: 'CREDIT', account_role: 'PENSION_PAYABLE', amount: 40 }
    ]
  };
  const mapping: PayrollAccountMapping = {
    SALARY_EXPENSE: { account_code: '6000' },
    EMPLOYER_PENSION_EXPENSE: { account_code: '6010' },
    NET_PAYROLL_PAYABLE: { account_code: '2200' },
    INCOME_TAX_PAYABLE: { account_code: '2210' },
    PENSION_PAYABLE: { account_code: '2220' },
    BANK_CASH: { account_code: '1000' }
  };
  const payrollJournal = payrollRunToJournal(payrollRun, mapping);
  const settlements = settlementArtifacts(payrollRun, [
    { settlement_id: 'NET', category: 'NET_PAYROLL', date: '2026-08-31', amount: 780, reference: 'PAYROLL-AUG' }
  ], mapping);
  const bookkeeping = calculateBookkeepingBatch({
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    currency: 'GEL',
    journals: [payrollJournal, ...settlements.journals],
    bank_transactions: [{ transaction_id: 'BANK-NET', date: '2026-08-31', amount: -780, reference: 'PAYROLL-AUG' }],
    ledger_cash_items: settlements.ledger_cash_items
  });
  const closePass = evaluateMonthlyClose({
    payrollRun,
    bookkeepingBatch: bookkeeping,
    settlementTotals: settlements.totals,
    bankControl: { statement_closing_balance: 5000, ledger_closing_balance: 5000 },
    periodScopeComplete: true
  });
  const closeBlocked = evaluateMonthlyClose({
    payrollRun,
    bookkeepingBatch: bookkeeping,
    settlementTotals: settlements.totals,
    periodScopeComplete: false
  });

  return {
    ok:
      payrollJournal.lines.length === 5 &&
      bookkeeping.controls.all_journals_balanced &&
      bookkeeping.reconciliation.matches.length === 1 &&
      bookkeeping.reconciliation.matches[0].bank_transaction_id === 'BANK-NET' &&
      closePass.control_status === 'PASS' &&
      closePass.close_status === 'PREPARED_NOT_CLOSED' &&
      closePass.status === 'CORE_CONTROLS_PASS_LAYER_A_REQUIRED' &&
      closePass.payroll_liabilities.outstanding_at_period_end.INCOME_TAX === 200 &&
      closeBlocked.control_status === 'EXCEPTIONS_OPEN' &&
      !closeBlocked.exceptions.includes('PERIOD_SCOPE_NOT_CONFIRMED_COMPLETE') &&
      closeBlocked.exceptions.includes('BANK_CLOSING_BALANCE_CONTROL_NOT_PROVIDED'),
    sample: {
      payroll_journal: payrollJournal,
      bookkeeping_controls: bookkeeping.controls,
      close: closePass
    }
  };
}
