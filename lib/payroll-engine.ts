import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import { getServiceDeployment } from './service-deployments';
import { assertDateRangeOpenForCompany } from './close-governance-engine';

export type PayrollEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pension_participant: boolean;
  ytd_taxable_salary_before: number;
};

export type PayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: PayrollEmployeeInput[];
};

export type PayrollJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role: 'SALARY_EXPENSE' | 'EMPLOYER_PENSION_EXPENSE' | 'NET_PAYROLL_PAYABLE' | 'INCOME_TAX_PAYABLE' | 'PENSION_PAYABLE';
  amount: number;
};

export type PayrollEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  taxable_salary: number;
  income_tax: number;
  employee_pension: number;
  employer_pension: number;
  state_pension: number;
  net_pay: number;
  employer_funded_total: number;
  ytd_taxable_salary_after: number;
};

export type PayrollRunResult = {
  rule_pack_id: string;
  country_code: 'GE';
  currency: 'GEL';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: PayrollEmployeeResult[];
  totals: {
    gross_pay: number;
    income_tax: number;
    employee_pension: number;
    employer_pension: number;
    state_pension: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: PayrollJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACKS = {
  GE: {
    id: 'GE-2026-BASIC-EMPLOYMENT-V1',
    status: 'VERIFIED_BASIC_RULES',
    currency: 'GEL',
    income_tax_rate: 0.20,
    employee_pension_rate: 0.02,
    employer_pension_rate: 0.02,
    state_pension_bands: [
      { annual_limit: 24000, rate: 0.02 },
      { annual_limit: 60000, rate: 0.01 },
      { annual_limit: null, rate: 0 }
    ],
    evidence: [
      {
        authority: 'Legislative Herald of Georgia (Matsne)',
        instrument: 'Tax Code of Georgia, Article 81 and Article 101',
        url: 'https://www.matsne.gov.ge/en/document/view/1043717'
      },
      {
        authority: 'Legislative Herald of Georgia (Matsne)',
        instrument: 'Law of Georgia on Funded Pension, Article 3',
        url: 'https://www.matsne.gov.ge/en/document/view/4280127'
      }
    ],
    limitations: [
      'Basic regular cash salary only.',
      'The caller must explicitly state whether each employee participates in the funded pension scheme; FinClose does not infer pension eligibility from age or historic opt-out status.',
      'Special income-tax exemptions, non-cash benefits, expense reimbursements, foreign/diplomatic cases, garnishments and voluntary deductions are not calculated by this rule pack.',
      'Year-to-date taxable salary is caller-supplied until historical payroll ingestion is normalized into the payroll engine.',
      'This engine prepares payroll and accounting outputs only. It does not submit tax or pension declarations and does not initiate payments.'
    ]
  },
  US: { id: 'US-NOT-IMPLEMENTED', status: 'NOT_IMPLEMENTED' },
  DE: { id: 'DE-NOT-IMPLEMENTED', status: 'NOT_IMPLEMENTED' },
  GB: { id: 'GB-NOT-IMPLEMENTED', status: 'NOT_IMPLEMENTED' },
  EE: { id: 'EE-NOT-IMPLEMENTED', status: 'NOT_IMPLEMENTED' },
  CM: { id: 'CM-NOT-IMPLEMENTED', status: 'NOT_IMPLEMENTED' }
} as const;

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    const error = new Error(`${field} must be YYYY-MM-DD`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

function requireNonNegativeMoney(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${field} must be a non-negative number`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return money(number);
}

function statePensionForPeriod(ytdBefore: number, currentTaxable: number) {
  let remaining = currentTaxable;
  let cursor = ytdBefore;
  let contribution = 0;

  if (remaining > 0 && cursor < 24000) {
    const band = Math.min(remaining, 24000 - cursor);
    contribution += band * 0.02;
    remaining -= band;
    cursor += band;
  }
  if (remaining > 0 && cursor < 60000) {
    const band = Math.min(remaining, 60000 - cursor);
    contribution += band * 0.01;
    remaining -= band;
  }
  return money(contribution);
}

function sum(values: number[]) {
  return money(values.reduce((total, value) => total + value, 0));
}

export function calculateGeorgiaPayroll(input: PayrollRunInput): PayrollRunResult {
  requireIsoDate(input.pay_period_start, 'pay_period_start');
  requireIsoDate(input.pay_period_end, 'pay_period_end');
  requireIsoDate(input.pay_date, 'pay_date');
  if (input.pay_period_start > input.pay_period_end) {
    const error = new Error('pay_period_start must not be after pay_period_end');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  if (!Array.isArray(input.employees) || input.employees.length === 0) {
    const error = new Error('at least one employee is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const seen = new Set<string>();
  const employees = input.employees.map(employee => {
    const employeeId = String(employee.employee_id || '').trim();
    if (!employeeId) {
      const error = new Error('employee_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (seen.has(employeeId)) {
      const error = new Error(`duplicate employee_id: ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    seen.add(employeeId);

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const ytdBefore = requireNonNegativeMoney(employee.ytd_taxable_salary_before, `ytd_taxable_salary_before for ${employeeId}`);
    if (typeof employee.pension_participant !== 'boolean') {
      const error = new Error(`pension_participant must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const incomeTax = money(grossPay * 0.20);
    const employeePension = employee.pension_participant ? money(grossPay * 0.02) : 0;
    const employerPension = employee.pension_participant ? money(grossPay * 0.02) : 0;
    const statePension = employee.pension_participant ? statePensionForPeriod(ytdBefore, grossPay) : 0;
    const netPay = money(grossPay - incomeTax - employeePension);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      taxable_salary: grossPay,
      income_tax: incomeTax,
      employee_pension: employeePension,
      employer_pension: employerPension,
      state_pension: statePension,
      net_pay: netPay,
      employer_funded_total: money(grossPay + employerPension),
      ytd_taxable_salary_after: money(ytdBefore + grossPay)
    };
  });

  const totals = {
    gross_pay: sum(employees.map(employee => employee.gross_pay)),
    income_tax: sum(employees.map(employee => employee.income_tax)),
    employee_pension: sum(employees.map(employee => employee.employee_pension)),
    employer_pension: sum(employees.map(employee => employee.employer_pension)),
    state_pension: sum(employees.map(employee => employee.state_pension)),
    net_pay: sum(employees.map(employee => employee.net_pay)),
    employer_funded_total: sum(employees.map(employee => employee.employer_funded_total))
  };

  const journal: PayrollJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_PENSION_EXPENSE', amount: totals.employer_pension },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'INCOME_TAX_PAYABLE', amount: totals.income_tax },
    { side: 'CREDIT', account_role: 'PENSION_PAYABLE', amount: money(totals.employee_pension + totals.employer_pension) }
  ].filter(line => line.amount !== 0) as PayrollJournalLine[];

  const journalDebits = sum(journal.filter(line => line.side === 'DEBIT').map(line => line.amount));
  const journalCredits = sum(journal.filter(line => line.side === 'CREDIT').map(line => line.amount));

  return {
    rule_pack_id: PAYROLL_RULE_PACKS.GE.id,
    country_code: 'GE',
    currency: 'GEL',
    status: 'PREPARED',
    pay_period_start: input.pay_period_start,
    pay_period_end: input.pay_period_end,
    pay_date: input.pay_date,
    employees,
    totals,
    journal,
    controls: {
      journal_balanced: journalDebits === journalCredits,
      journal_debits: journalDebits,
      journal_credits: journalCredits,
      employee_count: employees.length
    },
    limitations: [...PAYROLL_RULE_PACKS.GE.limitations]
  };
}

function stablePayrollInput(input: PayrollRunInput) {
  return JSON.stringify({
    pay_period_start: input.pay_period_start,
    pay_period_end: input.pay_period_end,
    pay_date: input.pay_date,
    employees: input.employees.map(employee => ({
      employee_id: String(employee.employee_id || '').trim(),
      name: employee.name ? String(employee.name).trim() : '',
      gross_pay: Number(employee.gross_pay),
      pension_participant: employee.pension_participant,
      ytd_taxable_salary_before: Number(employee.ytd_taxable_salary_before)
    })).sort((a, b) => a.employee_id.localeCompare(b.employee_id))
  });
}

export async function preparePayrollRun(deploymentId: string, input: PayrollRunInput) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  if (!['payroll', 'bookkeeping-payroll'].includes(String(deployment.service))) {
    const error = new Error('payroll engine is not enabled for this service');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  if (!deployment.company_id) {
    const error = new Error('link or initialize the company before preparing payroll');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  if (!['RECEIVED', 'NOT_APPLICABLE_NEW_COMPANY'].includes(String(deployment.history_status || ''))) {
    const error = new Error('complete payroll history before preparing payroll');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  await assertDateRangeOpenForCompany(String(deployment.company_id), String(input.pay_period_start), String(input.pay_period_end), 'payroll run');

  const countryCode = String(deployment.country_code || deployment.configuration?.country_code || '').toUpperCase();
  if (countryCode !== 'GE') {
    const error = new Error(`payroll calculation rule pack is not implemented for ${countryCode || 'this country'}`);
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const result = calculateGeorgiaPayroll(input);
  if (!result.controls.journal_balanced) {
    const error = new Error('payroll journal failed balance control');
    (error as Error & { status?: number }).status = 500;
    throw error;
  }

  const fingerprint = crypto.createHash('sha256').update(stablePayrollInput(input)).digest('hex');
  const runId = `${deploymentId}__${input.pay_date}__${fingerprint.slice(0, 16)}`;
  const db = realtimeDatabase();
  const existing = await db.ref(`finclose_payroll_runs/${runId}`).once('value');
  if (existing.exists()) return { ...existing.val(), duplicate: true };

  const now = Date.now();
  const record = {
    ...result,
    payroll_run_id: runId,
    deployment_id: deploymentId,
    company_id: deployment.company_id,
    company_name: deployment.company_name || null,
    service: deployment.service,
    input_fingerprint: fingerprint,
    approval_status: 'PREPARED_NOT_APPROVED',
    execution_status: 'NO_PAYMENT_NO_FILING',
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_payroll_runs/${runId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'PAYROLL_RUN_PREPARED',
      payroll_run_id: runId,
      deployment_id: deploymentId,
      company_id: deployment.company_id,
      country_code: 'GE',
      rule_pack_id: result.rule_pack_id,
      input_fingerprint: fingerprint,
      created_at: now
    }
  });
  return record;
}

export async function getPayrollRun(deploymentId: string, runId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const snap = await realtimeDatabase().ref(`finclose_payroll_runs/${runId}`).once('value');
  if (!snap.exists()) {
    const error = new Error('payroll run not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const run = snap.val() as Record<string, any>;
  if (String(run.deployment_id) !== deploymentId || String(run.company_id) !== String(deployment.company_id)) {
    const error = new Error('payroll run does not belong to this service deployment');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return run;
}

export function payrollEngineSelfTest() {
  const sample = calculateGeorgiaPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E001', gross_pay: 5000, pension_participant: true, ytd_taxable_salary_before: 23000 },
      { employee_id: 'E002', gross_pay: 3000, pension_participant: false, ytd_taxable_salary_before: 21000 },
      { employee_id: 'E003', gross_pay: 3000, pension_participant: true, ytd_taxable_salary_before: 59000 }
    ]
  });
  const first = sample.employees[0];
  const second = sample.employees[1];
  const third = sample.employees[2];
  return {
    ok:
      first.income_tax === 1000 &&
      first.employee_pension === 100 &&
      first.employer_pension === 100 &&
      first.state_pension === 60 &&
      first.net_pay === 3900 &&
      second.income_tax === 600 &&
      second.net_pay === 2400 &&
      third.state_pension === 10 &&
      third.employee_pension === 60 &&
      third.net_pay === 2340 &&
      sample.controls.journal_balanced,
    sample
  };
}
