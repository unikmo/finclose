import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import { getServiceDeployment } from './service-deployments';
import { assertDateRangeOpenForCompany } from './close-governance-engine';

export type JournalLineInput = {
  account_code: string;
  account_name?: string;
  debit?: number;
  credit?: number;
};

export type JournalEntryInput = {
  external_id: string;
  date: string;
  description: string;
  currency: string;
  lines: JournalLineInput[];
};

export type BankTransactionInput = {
  transaction_id: string;
  date: string;
  amount: number;
  reference?: string;
  description?: string;
};

export type LedgerCashItemInput = {
  ledger_item_id: string;
  date: string;
  amount: number;
  reference?: string;
  description?: string;
};

export type BookkeepingBatchInput = {
  period_start: string;
  period_end: string;
  currency: string;
  journals?: JournalEntryInput[];
  bank_transactions?: BankTransactionInput[];
  ledger_cash_items?: LedgerCashItemInput[];
};

type ValidatedJournal = JournalEntryInput & {
  debit_total: number;
  credit_total: number;
  balanced: true;
};

type ReconciliationMatch = {
  bank_transaction_id: string;
  ledger_item_id: string;
  amount: number;
  bank_date: string;
  ledger_date: string;
  score: number;
  reason: 'AMOUNT_REFERENCE_DATE' | 'AMOUNT_REFERENCE' | 'AMOUNT_DATE';
};

type ReconciliationAmbiguity = {
  bank_transaction_id: string;
  candidate_ledger_item_ids: string[];
  score: number;
  reason: 'MULTIPLE_TOP_CANDIDATES' | 'LEDGER_CONTENTION';
};

export const BOOKKEEPING_CORE_CAPABILITIES = {
  version: 'BOOKKEEPING-CORE-V1',
  implemented: [
    'balanced journal validation',
    'duplicate external journal-id detection inside a batch',
    'linked-company base-currency enforcement',
    'order-independent deterministic bank-to-ledger cash reconciliation',
    'ambiguous-match and ledger-contention isolation',
    'prepared bookkeeping batch persistence with SHA-256 fingerprinting',
    'service-scope enforcement for bookkeeping-only and bookkeeping-plus-payroll'
  ],
  not_implemented: [
    'automatic chart-of-accounts classification',
    'VAT or sales-tax coding',
    'invoice/receipt extraction and matching',
    'automatic journal posting to external accounting systems',
    'external accounting-provider period locking',
    'accounts-receivable or accounts-payable subledger automation',
    'country-specific bookkeeping/tax rule packs'
  ],
  reconciliation_sign_convention: 'Bank and ledger cash items must use the same signed cash-flow convention for matching.',
  execution_boundary: 'PREPARED_NOT_POSTED'
} as const;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function money(value: unknown, field: string) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw httpError(`${field} must be a non-negative number`, 400);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function signedMoney(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw httpError(`${field} must be a number`, 400);
  return Math.round((number + Math.sign(number) * Number.EPSILON) * 100) / 100;
}

function isoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw httpError(`${field} must be YYYY-MM-DD`, 400);
  }
  return value;
}

function currency(value: string) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw httpError('currency must be a three-letter code', 400);
  return normalized;
}

function sum(values: number[]) {
  return Math.round((values.reduce((total, value) => total + value, 0) + Number.EPSILON) * 100) / 100;
}

function normalizeReference(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function daysApart(a: string, b: string) {
  return Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export function validateJournalEntry(entry: JournalEntryInput): ValidatedJournal {
  const externalId = String(entry.external_id || '').trim();
  const description = String(entry.description || '').trim();
  if (!externalId) throw httpError('journal external_id is required', 400);
  if (!description) throw httpError(`journal description is required for ${externalId}`, 400);
  const date = isoDate(String(entry.date || ''), `journal date for ${externalId}`);
  const journalCurrency = currency(entry.currency);
  if (!Array.isArray(entry.lines) || entry.lines.length < 2) {
    throw httpError(`journal ${externalId} must contain at least two lines`, 400);
  }

  const lines = entry.lines.map((line, index) => {
    const accountCode = String(line.account_code || '').trim();
    if (!accountCode) throw httpError(`account_code is required on journal ${externalId} line ${index + 1}`, 400);
    const debit = money(line.debit, `debit on journal ${externalId} line ${index + 1}`);
    const credit = money(line.credit, `credit on journal ${externalId} line ${index + 1}`);
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw httpError(`journal ${externalId} line ${index + 1} must have either debit or credit, not both/neither`, 400);
    }
    return {
      account_code: accountCode,
      account_name: line.account_name ? String(line.account_name).trim() : undefined,
      debit,
      credit
    };
  });

  const debitTotal = sum(lines.map(line => line.debit));
  const creditTotal = sum(lines.map(line => line.credit));
  if (debitTotal !== creditTotal) {
    throw httpError(`journal ${externalId} is not balanced: debits ${debitTotal} != credits ${creditTotal}`, 409);
  }

  return {
    external_id: externalId,
    date,
    description,
    currency: journalCurrency,
    lines,
    debit_total: debitTotal,
    credit_total: creditTotal,
    balanced: true
  };
}

function normalizeBankTransactions(items: BankTransactionInput[]) {
  const seen = new Set<string>();
  return items.map(item => {
    const id = String(item.transaction_id || '').trim();
    if (!id || seen.has(id)) throw httpError(!id ? 'bank transaction_id is required' : `duplicate bank transaction_id: ${id}`, 400);
    seen.add(id);
    return {
      transaction_id: id,
      date: isoDate(String(item.date || ''), `bank transaction date for ${id}`),
      amount: signedMoney(item.amount, `bank transaction amount for ${id}`),
      reference: String(item.reference || '').trim(),
      description: String(item.description || '').trim()
    };
  }).sort((a, b) => a.transaction_id.localeCompare(b.transaction_id));
}

function normalizeLedgerItems(items: LedgerCashItemInput[]) {
  const seen = new Set<string>();
  return items.map(item => {
    const id = String(item.ledger_item_id || '').trim();
    if (!id || seen.has(id)) throw httpError(!id ? 'ledger_item_id is required' : `duplicate ledger_item_id: ${id}`, 400);
    seen.add(id);
    return {
      ledger_item_id: id,
      date: isoDate(String(item.date || ''), `ledger cash date for ${id}`),
      amount: signedMoney(item.amount, `ledger cash amount for ${id}`),
      reference: String(item.reference || '').trim(),
      description: String(item.description || '').trim()
    };
  }).sort((a, b) => a.ledger_item_id.localeCompare(b.ledger_item_id));
}

function candidateScore(bank: ReturnType<typeof normalizeBankTransactions>[number], ledger: ReturnType<typeof normalizeLedgerItems>[number]) {
  if (bank.amount !== ledger.amount) return null;
  const distance = daysApart(bank.date, ledger.date);
  if (distance > 3) return null;
  const bankRef = normalizeReference(bank.reference);
  const ledgerRef = normalizeReference(ledger.reference);
  const sameReference = Boolean(bankRef && ledgerRef && bankRef === ledgerRef);
  if (sameReference && distance === 0) return { score: 100, reason: 'AMOUNT_REFERENCE_DATE' as const };
  if (sameReference) return { score: 90, reason: 'AMOUNT_REFERENCE' as const };
  if (distance === 0) return { score: 80, reason: 'AMOUNT_DATE' as const };
  return null;
}

export function reconcileBankToLedger(bankInput: BankTransactionInput[], ledgerInput: LedgerCashItemInput[]) {
  const bank = normalizeBankTransactions(bankInput || []);
  const ledger = normalizeLedgerItems(ledgerInput || []);
  const matches: ReconciliationMatch[] = [];
  const ambiguous: ReconciliationAmbiguity[] = [];

  type Proposal = {
    bank: typeof bank[number];
    ledger: typeof ledger[number];
    score: number;
    reason: ReconciliationMatch['reason'];
  };

  const proposals: Proposal[] = [];
  for (const bankItem of bank) {
    const candidates = ledger
      .map(item => ({ item, candidate: candidateScore(bankItem, item) }))
      .filter(row => row.candidate)
      .map(row => ({ item: row.item, score: row.candidate!.score, reason: row.candidate!.reason }))
      .sort((a, b) => b.score - a.score || a.item.ledger_item_id.localeCompare(b.item.ledger_item_id));

    if (!candidates.length) continue;
    const topScore = candidates[0].score;
    const top = candidates.filter(candidate => candidate.score === topScore);
    if (top.length !== 1) {
      ambiguous.push({
        bank_transaction_id: bankItem.transaction_id,
        candidate_ledger_item_ids: top.map(candidate => candidate.item.ledger_item_id),
        score: topScore,
        reason: 'MULTIPLE_TOP_CANDIDATES'
      });
      continue;
    }
    proposals.push({ bank: bankItem, ledger: top[0].item, score: top[0].score, reason: top[0].reason });
  }

  const proposalsByLedger = new Map<string, Proposal[]>();
  for (const proposal of proposals) {
    const list = proposalsByLedger.get(proposal.ledger.ledger_item_id) || [];
    list.push(proposal);
    proposalsByLedger.set(proposal.ledger.ledger_item_id, list);
  }

  for (const [ledgerId, contendersRaw] of Array.from(proposalsByLedger.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const contenders = contendersRaw.sort((a, b) => b.score - a.score || a.bank.transaction_id.localeCompare(b.bank.transaction_id));
    const highestScore = contenders[0].score;
    const highest = contenders.filter(contender => contender.score === highestScore);

    if (highest.length === 1) {
      const winner = highest[0];
      matches.push({
        bank_transaction_id: winner.bank.transaction_id,
        ledger_item_id: winner.ledger.ledger_item_id,
        amount: winner.bank.amount,
        bank_date: winner.bank.date,
        ledger_date: winner.ledger.date,
        score: winner.score,
        reason: winner.reason
      });
      for (const loser of contenders.slice(1)) {
        ambiguous.push({
          bank_transaction_id: loser.bank.transaction_id,
          candidate_ledger_item_ids: [ledgerId],
          score: loser.score,
          reason: 'LEDGER_CONTENTION'
        });
      }
    } else {
      for (const contender of contenders) {
        ambiguous.push({
          bank_transaction_id: contender.bank.transaction_id,
          candidate_ledger_item_ids: [ledgerId],
          score: contender.score,
          reason: 'LEDGER_CONTENTION'
        });
      }
    }
  }

  matches.sort((a, b) => a.bank_transaction_id.localeCompare(b.bank_transaction_id));
  ambiguous.sort((a, b) => a.bank_transaction_id.localeCompare(b.bank_transaction_id) || a.reason.localeCompare(b.reason));

  const matchedBank = new Set(matches.map(match => match.bank_transaction_id));
  const matchedLedger = new Set(matches.map(match => match.ledger_item_id));
  const unmatchedBank = bank.filter(item => !matchedBank.has(item.transaction_id)).map(item => item.transaction_id);
  const unmatchedLedger = ledger.filter(item => !matchedLedger.has(item.ledger_item_id)).map(item => item.ledger_item_id);
  return {
    matches,
    ambiguous,
    unmatched_bank: unmatchedBank,
    unmatched_ledger: unmatchedLedger,
    controls: {
      bank_count: bank.length,
      ledger_count: ledger.length,
      matched_count: matches.length,
      ambiguous_count: ambiguous.length,
      unmatched_bank_count: unmatchedBank.length,
      unmatched_ledger_count: unmatchedLedger.length
    }
  };
}

function stableBatchInput(input: BookkeepingBatchInput) {
  return JSON.stringify({
    period_start: input.period_start,
    period_end: input.period_end,
    currency: String(input.currency || '').toUpperCase(),
    journals: (input.journals || []).map(journal => ({ ...journal, lines: journal.lines || [] })).sort((a, b) => String(a.external_id).localeCompare(String(b.external_id))),
    bank_transactions: (input.bank_transactions || []).slice().sort((a, b) => String(a.transaction_id).localeCompare(String(b.transaction_id))),
    ledger_cash_items: (input.ledger_cash_items || []).slice().sort((a, b) => String(a.ledger_item_id).localeCompare(String(b.ledger_item_id)))
  });
}

export function calculateBookkeepingBatch(input: BookkeepingBatchInput) {
  const periodStart = isoDate(String(input.period_start || ''), 'period_start');
  const periodEnd = isoDate(String(input.period_end || ''), 'period_end');
  if (periodStart > periodEnd) throw httpError('period_start must not be after period_end', 400);
  const batchCurrency = currency(input.currency);
  const journalsInput = Array.isArray(input.journals) ? input.journals : [];
  const seenJournalIds = new Set<string>();
  const journals = journalsInput.map(journal => {
    const validated = validateJournalEntry(journal);
    if (seenJournalIds.has(validated.external_id)) throw httpError(`duplicate journal external_id: ${validated.external_id}`, 400);
    seenJournalIds.add(validated.external_id);
    if (validated.currency !== batchCurrency) {
      throw httpError(`journal ${validated.external_id} currency ${validated.currency} does not match batch currency ${batchCurrency}`, 409);
    }
    if (validated.date < periodStart || validated.date > periodEnd) {
      throw httpError(`journal ${validated.external_id} date is outside the batch period`, 409);
    }
    return validated;
  });

  const reconciliation = reconcileBankToLedger(
    Array.isArray(input.bank_transactions) ? input.bank_transactions : [],
    Array.isArray(input.ledger_cash_items) ? input.ledger_cash_items : []
  );

  return {
    engine_version: BOOKKEEPING_CORE_CAPABILITIES.version,
    status: 'PREPARED',
    execution_status: BOOKKEEPING_CORE_CAPABILITIES.execution_boundary,
    period_start: periodStart,
    period_end: periodEnd,
    currency: batchCurrency,
    journals,
    reconciliation,
    controls: {
      journal_count: journals.length,
      all_journals_balanced: journals.every(journal => journal.balanced),
      total_journal_debits: sum(journals.map(journal => journal.debit_total)),
      total_journal_credits: sum(journals.map(journal => journal.credit_total)),
      ...reconciliation.controls
    },
    limitations: [...BOOKKEEPING_CORE_CAPABILITIES.not_implemented]
  };
}

export async function prepareBookkeepingBatch(deploymentId: string, input: BookkeepingBatchInput) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  if (!['do-bookkeeping', 'bookkeeping-payroll'].includes(String(deployment.service))) {
    throw httpError('bookkeeping engine is not enabled for this service', 409);
  }
  if (!deployment.company_id) throw httpError('link or initialize the company before preparing bookkeeping', 409);
  if (!['RECEIVED', 'NOT_APPLICABLE_NEW_COMPANY'].includes(String(deployment.history_status || ''))) {
    throw httpError('complete bookkeeping history before preparing bookkeeping', 409);
  }

  await assertDateRangeOpenForCompany(String(deployment.company_id), String(input.period_start), String(input.period_end), 'bookkeeping batch');

  const db = realtimeDatabase();
  const companySnap = await db.ref(`finclose_companies/${deployment.company_id}`).once('value');
  if (!companySnap.exists()) throw httpError('linked company not found', 404);
  const company = companySnap.val() as Record<string, any>;
  const companyCurrency = String(company.base_currency || '').trim().toUpperCase();
  if (!companyCurrency) throw httpError('linked company base currency is missing', 409);

  const result = calculateBookkeepingBatch(input);
  if (companyCurrency !== result.currency) {
    throw httpError(`batch currency ${result.currency} does not match company base currency ${companyCurrency}`, 409);
  }

  const fingerprint = crypto.createHash('sha256').update(stableBatchInput(input)).digest('hex');
  const batchId = `${deploymentId}__${input.period_end}__${fingerprint.slice(0, 16)}`;
  const existing = await db.ref(`finclose_bookkeeping_batches/${batchId}`).once('value');
  if (existing.exists()) return { ...existing.val(), duplicate: true };

  const now = Date.now();
  const record = {
    ...result,
    bookkeeping_batch_id: batchId,
    deployment_id: deploymentId,
    company_id: deployment.company_id,
    company_name: deployment.company_name || company.legal_name || null,
    service: deployment.service,
    input_fingerprint: fingerprint,
    approval_status: 'PREPARED_NOT_APPROVED',
    posting_status: 'NO_EXTERNAL_POSTING',
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_bookkeeping_batches/${batchId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'BOOKKEEPING_BATCH_PREPARED',
      bookkeeping_batch_id: batchId,
      deployment_id: deploymentId,
      company_id: deployment.company_id,
      input_fingerprint: fingerprint,
      created_at: now
    }
  });
  return record;
}

export async function getBookkeepingBatch(deploymentId: string, batchId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const snap = await realtimeDatabase().ref(`finclose_bookkeeping_batches/${batchId}`).once('value');
  if (!snap.exists()) throw httpError('bookkeeping batch not found', 404);
  const batch = snap.val() as Record<string, any>;
  if (String(batch.deployment_id) !== deploymentId || String(batch.company_id) !== String(deployment.company_id)) {
    throw httpError('bookkeeping batch does not belong to this service deployment', 403);
  }
  return batch;
}

export function bookkeepingEngineSelfTest() {
  const valid = calculateBookkeepingBatch({
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    currency: 'GEL',
    journals: [{
      external_id: 'J001',
      date: '2026-08-31',
      description: 'Synthetic payroll journal',
      currency: 'GEL',
      lines: [
        { account_code: '6000', debit: 1000 },
        { account_code: '2200', credit: 1000 }
      ]
    }],
    bank_transactions: [
      { transaction_id: 'B001', date: '2026-08-31', amount: -800, reference: 'SAL-001' },
      { transaction_id: 'B002', date: '2026-08-31', amount: -100, reference: '' },
      { transaction_id: 'B003', date: '2026-08-31', amount: -50, reference: 'STRONG' },
      { transaction_id: 'B004', date: '2026-08-31', amount: -50, reference: '' }
    ],
    ledger_cash_items: [
      { ledger_item_id: 'L001', date: '2026-08-31', amount: -800, reference: 'SAL-001' },
      { ledger_item_id: 'L002', date: '2026-08-31', amount: -100, reference: '' },
      { ledger_item_id: 'L003', date: '2026-08-31', amount: -100, reference: '' },
      { ledger_item_id: 'L004', date: '2026-08-31', amount: -50, reference: 'STRONG' }
    ]
  });

  const permuted = reconcileBankToLedger(
    [
      { transaction_id: 'B004', date: '2026-08-31', amount: -50, reference: '' },
      { transaction_id: 'B003', date: '2026-08-31', amount: -50, reference: 'STRONG' }
    ],
    [{ ledger_item_id: 'L004', date: '2026-08-31', amount: -50, reference: 'STRONG' }]
  );

  let unbalancedRejected = false;
  try {
    validateJournalEntry({
      external_id: 'BAD',
      date: '2026-08-31',
      description: 'Unbalanced',
      currency: 'GEL',
      lines: [
        { account_code: '1000', debit: 100 },
        { account_code: '2000', credit: 90 }
      ]
    });
  } catch {
    unbalancedRejected = true;
  }

  const b003Match = valid.reconciliation.matches.find(match => match.bank_transaction_id === 'B003');
  const b004Ambiguity = valid.reconciliation.ambiguous.find(item => item.bank_transaction_id === 'B004');
  return {
    ok:
      valid.controls.all_journals_balanced &&
      valid.reconciliation.matches.some(match => match.bank_transaction_id === 'B001' && match.ledger_item_id === 'L001') &&
      valid.reconciliation.ambiguous.some(item => item.bank_transaction_id === 'B002' && item.reason === 'MULTIPLE_TOP_CANDIDATES') &&
      b003Match?.ledger_item_id === 'L004' &&
      b003Match.score === 100 &&
      b004Ambiguity?.reason === 'LEDGER_CONTENTION' &&
      valid.reconciliation.unmatched_bank.includes('B002') &&
      valid.reconciliation.unmatched_bank.includes('B004') &&
      permuted.matches.length === 1 &&
      permuted.matches[0].bank_transaction_id === 'B003' &&
      unbalancedRejected &&
      valid.execution_status === 'PREPARED_NOT_POSTED',
    sample: valid
  };
}
