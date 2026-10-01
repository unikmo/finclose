// Mauritius (MU) payroll rule pack — v1, income year 1 July 2026 to 30
// June 2027.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Mauritian payroll expertise has checked this against the MRA's
// own EDF notes for 2026/27 and PAYE cumulative guidance.
//
// Sourced from a user-supplied "Mauritius 2026/27 Payroll Implementation
// Reference" (verified to 14 Sep 2026, citing the MRA as the primary
// authority) — a genuine parameter reference with real bands/rates
// attributed to named MRA publications, and an explicit warning that some
// generic MRA pages still show a stale 0%/10%/20% table superseded by the
// 2026/27 EDF notes (0%/10%/20%/35%), which this pack uses. Not
// independently re-fetched from mra.mu directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - Implements the CUMULATIVE PAYE algorithm exactly as the source
//     describes it (13 periods for relief allocation, the statutory
//     end-of-year bonus counted as a 13th period when paid): cumulative
//     emoluments minus cumulative EDF relief (1/13 of the annual total per
//     elapsed period), annual bands applied to the cumulative chargeable
//     income, current-period PAYE = cumulative tax minus PAYE already
//     withheld since July. The caller supplies cumulative_emoluments_before
//     and paye_withheld_ytd_before directly — this engine does not persist
//     YTD state itself.
//   - EDF reliefs are accepted as ONE caller-supplied annual total
//     (annual_edf_reliefs_total), not itemized by claim type (dependents,
//     medical insurance, pension, donations, school fees, housing-loan
//     interest, etc.). The caller is responsible for computing that total
//     correctly under the current EDF rules — this engine only applies the
//     1/13 cumulative allocation and the bracket lookup.
//   - CSG, NSF, and PRGF all treat gross_pay as the "basic wage/salary"
//     base for v1 — no separate basic-salary-vs-total-emoluments
//     classification, which the real system requires (e.g. NSF explicitly
//     excludes bonus/allowances from its base, and PRGF uses its own
//     "monthly remuneration" definition distinct from NSF/CSG basic wage).
//   - NSF contribution-base min/max limits are implemented only for
//     MONTHLY pay frequency (the source also gives daily/weekly/fortnightly/
//     half-monthly tables, not implemented here).
//   - Director/board fees (flat 15%/20%), nonresident-employee treatment,
//     daily-paid-worker exclusion, low-monthly-emoluments PAYE exclusion,
//     and the individual Fair Share Contribution (15% above Rs12m/13 per
//     period) are NOT implemented at all in v1 — rejected outright, not
//     approximated. This engine prepares payroll and accounting outputs
//     only — it does not file with the MRA.

export type MuPayFrequency = 'MONTHLY';
export type MuResidentStatus = 'RESIDENT' | 'NON_RESIDENT';
export type MuNsfWorkerCategory = 'PRIVATE_HOUSEHOLD' | 'OTHER';

export type MuEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  resident_status: MuResidentStatus;
  // PAYE period sequence within the income year: 1-12 for the ordinary
  // monthly periods (July = 1), 13 reserved for the statutory end-of-year
  // bonus payment.
  pay_period_sequence: number;
  cumulative_emoluments_before: number;
  paye_withheld_ytd_before: number;
  // Required when resident_status is RESIDENT: the employee's TOTAL annual
  // EDF relief entitlement (all claim types combined). Ignored for
  // NON_RESIDENT employees (no resident reliefs apply).
  annual_edf_reliefs_total?: number;
  nsf_worker_category: MuNsfWorkerCategory;
  prgf_private_pension_exempt: boolean;
  // Director/board fees, v2. Optional, defaults to false (ordinary
  // employee PAYE, unchanged from v1). When true, PAYE is a FINAL flat
  // rate on gross_pay per MRA's own PAYE Guide — 15% by default, or 20%
  // if the director has elected the higher rate (director_paye_20pct_
  // election: true). No allowable deductions/EDF relief apply to
  // director fees, and the cumulative 13-period algorithm does not apply
  // — each period's flat tax is final and independent.
  is_director?: boolean;
  director_paye_20pct_election?: boolean;
};

export type MuPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: MuEmployeeInput[];
};

export type MuJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_CSG_NSF_LEVY_PRGF_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_PAYABLE'
    | 'CSG_PAYABLE'
    | 'NSF_PAYABLE'
    | 'TRAINING_LEVY_PAYABLE'
    | 'PRGF_PAYABLE';
  amount: number;
};

export type MuEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  paye: number;
  cumulative_emoluments_after: number;
  paye_withheld_ytd_after: number;
  employee_csg: number;
  employer_csg: number;
  employee_nsf: number;
  employer_nsf: number;
  employer_training_levy: number;
  employer_prgf: number;
  net_pay: number;
  employer_funded_total: number;
};

export type MuPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'MU';
  currency: 'MUR';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: MuEmployeeResult[];
  totals: {
    gross_pay: number;
    paye: number;
    employee_csg: number;
    employer_csg: number;
    employee_nsf: number;
    employer_nsf: number;
    employer_training_levy: number;
    employer_prgf: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: MuJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_MU = {
  // v2: adds director/board fees (flat 15%/20% final withholding,
  // independently confirmed directly against the MRA's own PAYE guidance
  // — see evidence) and the low-monthly-emoluments PAYE exclusion
  // (Rs38,462; figure already cited in the v1 limitations from the
  // source document, just not implemented until now).
  id: 'MU-2026-27-CUMULATIVE-PAYE-CSG-NSF-PRGF-DIRECTOR-DRAFT-V2',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'MUR',
  paye: {
    // [atLeast, base, rate] on annual chargeable income.
    brackets: [[0, 0, 0], [500000, 0, 0.10], [1000000, 50000, 0.20], [12000000, 2250000, 0.35]] as Array<[number, number, number]>,
    relief_periods: 13,
    low_emoluments_monthly_threshold: 38462
  },
  director: {
    // MRA PAYE Guide: 15% flat by default; the director may elect 20%
    // instead. Final tax — no further reliefs/deductions apply.
    default_rate: 0.15,
    elected_rate: 0.20
  },
  csg: {
    low_threshold: 50000,
    employee_rate_low: 0.015, employer_rate_low: 0.03,
    employee_rate_high: 0.03, employer_rate_high: 0.06
  },
  nsf: {
    employee_rate: 0.01, employer_rate: 0.025,
    monthly_min: { PRIVATE_HOUSEHOLD: 2910, OTHER: 4580 } as Record<MuNsfWorkerCategory, number>,
    monthly_max: 29710
  },
  training_levy: { employer_rate: 0.015 },
  prgf: { employer_rate: 0.045 },
  evidence: [
    { authority: 'Mauritius Revenue Authority (MRA)', instrument: 'EDF notes for the income year ending 30 June 2027 — 0%/10%/20%/35% bands, superseding the stale 0%/10%/20% table still shown on some generic MRA pages', url: 'https://www.mra.mu/index.php/individuals/paye' },
    { authority: 'MRA', instrument: 'PAYE cumulative mechanics — 13-period relief allocation including the statutory end-of-year bonus as a 13th period', url: 'https://www.mra.mu/index.php/employers/paye' },
    { authority: 'MRA', instrument: 'NPF/NSF Contributions — 1% employee + 2.5% employer, 1 July 2026 min/max contribution-base tables by pay frequency', url: 'https://www.mra.mu/index.php/employers/npf-nsf' },
    { authority: 'MRA', instrument: 'CSG — Contribution Sociale Généralisée rates by basic wage/salary band', url: 'https://www.mra.mu/index.php/employers/csg' },
    { authority: 'MRA', instrument: 'PRGF — 4.5% employer standard rate, approved-private-pension-scheme exemption', url: 'https://www.mra.mu/index.php/employers/prgf' },
    { authority: 'User-supplied reference', instrument: '"Mauritius 2026/27 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from. Not independently re-fetched from mra.mu directly this pass.', url: 'file: Mauritius_2026_27_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' },
    { authority: 'Mauritius Revenue Authority (MRA)', instrument: 'PAYE Guide — director/board fees: 15% flat rate by default, 20% at the director\'s own election; final tax, no allowable deductions. Independently re-fetched directly (not via the implementation-reference document).', url: 'https://www.mra.mu/download/PAYEGuide.pdf' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only. The cumulative PAYE algorithm is implemented as the source describes it (13-period relief allocation, EOY bonus as 13th period), but this engine does NOT persist YTD state itself — cumulative_emoluments_before and paye_withheld_ytd_before are caller-supplied each run.',
    'EDF reliefs are accepted as ONE caller-supplied annual total, not itemized by claim type (dependents, medical insurance, approved pension, donations, school fees, housing-loan interest, solar/rainwater/EV/carer claims). The caller must compute that total correctly under the current EDF rules.',
    'CSG, NSF, and PRGF all treat gross_pay as the contribution "basic wage/salary" base for v1 — no separate basic-salary-vs-total-emoluments classification, which the real system requires (NSF specifically excludes bonus/allowances from its base; PRGF uses its own distinct "monthly remuneration" definition).',
    'NSF contribution-base min/max limits are implemented only for MONTHLY pay frequency.',
    'Director/board fees, v2: computed as a FINAL flat-rate tax (15% default, 20% if the caller sets director_paye_20pct_election: true) on the ENTIRE gross_pay, with no EDF relief, no cumulative algorithm, and no allowable deductions — per the MRA\'s own PAYE Guide, independently re-confirmed directly against mra.mu (not just the implementation-reference document). Gated on a new is_director flag; every existing (non-director) caller is unaffected. This engine does NOT independently verify whether CSG/NSF/PRGF should still apply to a director\'s fees (those social-contribution schemes may treat director fees differently from ordinary employment income) — they are computed unchanged on gross_pay, which may overstate them for a pure non-executive director; flagged as an open question rather than guessed at. CORROBORATED (2026-09-16) but not resolved by the "Mauritius 2026/27 Payroll Golden Fixtures" QA pack\'s MU-DIR-100K case: it labels itself "GOLDEN tax-only special-payment fixture", asserts only PAYE (Rs15,000 on a Rs100,000 board fee, which this engine reproduces exactly), and explicitly declines to assert CSG/NSF/Training Levy/PRGF ("social_contribution_worker_status": "not asserted" — "Social contribution treatment depends on actual worker/status facts and is intentionally not inferred in this fixture"). Its own gross/net pair (100,000 -> 85,000) implies a tax-only net with no social contributions, but is NOT an authoritative MRA citation resolving whether CSG/NSF/Training Levy/PRGF apply to board fees, so this engine still computes them on gross_pay unchanged (net_pay 81,702.90 for that same case, not 85,000) rather than silently zeroing them out on the strength of one QA fixture\'s silence. Get a primary MRA confirmation before changing this behavior either way.',
    'Low-monthly-emoluments PAYE exclusion, v2: when a (non-director) employee\'s CURRENT-period gross_pay is below Rs38,462 (the figure the source document itself cites), this engine withholds NO PAYE for that period regardless of what the cumulative 13-period calculation would otherwise produce — cumulative YTD state (paye_withheld_ytd_after) is left unchanged. This is a reasonable reading of the source\'s own description, not independently re-confirmed against the MRA\'s primary text this pass.',
    'NOT IMPLEMENTED: nonresident-employee-specific PAYE treatment beyond zeroing EDF relief, daily-paid-worker exclusion, and the individual Fair Share Contribution (15% above Rs12m/13 per period — a high-income levy unlikely to matter for this pack\'s ~50-employee target segment, but not modeled). This engine prepares payroll and accounting outputs only — it does not file with the MRA.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing the MRA), not independently re-fetched from mra.mu directly this pass. Should be reconfirmed against the MRA\'s own 2026/27 EDF notes before this pack is marked VERIFIED_BASIC_RULES.'
  ]
};

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

function bracketLookup(amount: number, brackets: Array<[number, number, number]>) {
  let row = brackets[0];
  for (const candidate of brackets) {
    if (amount >= candidate[0]) row = candidate;
    else break;
  }
  const [atLeast, base, rate] = row;
  return money(base + (amount - atLeast) * rate);
}

export function calculateMuPayroll(input: MuPayrollRunInput): MuPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_MU;
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

    if (employee.resident_status !== 'RESIDENT' && employee.resident_status !== 'NON_RESIDENT') {
      const error = new Error(`resident_status for ${employeeId} must be RESIDENT or NON_RESIDENT`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!Number.isInteger(employee.pay_period_sequence) || employee.pay_period_sequence < 1 || employee.pay_period_sequence > p.paye.relief_periods) {
      const error = new Error(`pay_period_sequence for ${employeeId} must be an integer 1-${p.paye.relief_periods}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.nsf_worker_category !== 'PRIVATE_HOUSEHOLD' && employee.nsf_worker_category !== 'OTHER') {
      const error = new Error(`nsf_worker_category for ${employeeId} must be PRIVATE_HOUSEHOLD or OTHER`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.prgf_private_pension_exempt !== 'boolean') {
      const error = new Error(`prgf_private_pension_exempt must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!employee.is_director && employee.resident_status === 'RESIDENT' && (typeof employee.annual_edf_reliefs_total !== 'number' || employee.annual_edf_reliefs_total < 0)) {
      const error = new Error(`annual_edf_reliefs_total is required and must be non-negative for RESIDENT employee ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const cumulativeEmolumentsBefore = requireNonNegativeMoney(employee.cumulative_emoluments_before, `cumulative_emoluments_before for ${employeeId}`);
    const payeWithheldYtdBefore = requireNonNegativeMoney(employee.paye_withheld_ytd_before, `paye_withheld_ytd_before for ${employeeId}`);

    // --- PAYE ---
    const cumulativeEmoluments = money(cumulativeEmolumentsBefore + grossPay);
    let paye: number;
    let payeWithheldYtdAfter: number;
    if (employee.is_director) {
      // Director/board fees: FINAL flat-rate withholding, no cumulative
      // algorithm, no EDF relief, no allowable deductions (v2; see
      // limitations).
      const directorRate = employee.director_paye_20pct_election ? p.director.elected_rate : p.director.default_rate;
      paye = money(grossPay * directorRate);
      payeWithheldYtdAfter = money(payeWithheldYtdBefore + paye);
    } else if (grossPay < p.paye.low_emoluments_monthly_threshold) {
      // Low-monthly-emoluments PAYE exclusion (v2; see limitations): below
      // the threshold, no PAYE is withheld for THIS period regardless of
      // what the cumulative calculation would otherwise produce.
      paye = 0;
      payeWithheldYtdAfter = payeWithheldYtdBefore;
    } else {
      const cumulativeRelief = employee.resident_status === 'RESIDENT'
        ? money((employee.annual_edf_reliefs_total as number) / p.paye.relief_periods * employee.pay_period_sequence)
        : 0;
      const cumulativeChargeableIncome = Math.max(0, money(cumulativeEmoluments - cumulativeRelief));
      const cumulativeTax = bracketLookup(cumulativeChargeableIncome, p.paye.brackets);
      paye = Math.max(0, money(cumulativeTax - payeWithheldYtdBefore));
      payeWithheldYtdAfter = money(payeWithheldYtdBefore + paye);
    }

    // --- CSG ---
    const csgLow = grossPay <= p.csg.low_threshold;
    const employeeCsg = money(grossPay * (csgLow ? p.csg.employee_rate_low : p.csg.employee_rate_high));
    const employerCsg = money(grossPay * (csgLow ? p.csg.employer_rate_low : p.csg.employer_rate_high));

    // --- NSF ---
    const nsfMin = p.nsf.monthly_min[employee.nsf_worker_category];
    const nsfBase = Math.min(Math.max(grossPay, nsfMin), p.nsf.monthly_max);
    const employeeNsf = money(nsfBase * p.nsf.employee_rate);
    const employerNsf = money(nsfBase * p.nsf.employer_rate);

    // --- HRDC Training Levy (employer-only) ---
    const employerTrainingLevy = money(grossPay * p.training_levy.employer_rate);

    // --- PRGF (employer-only) ---
    const employerPrgf = employee.prgf_private_pension_exempt ? 0 : money(grossPay * p.prgf.employer_rate);

    const netPay = money(grossPay - paye - employeeCsg - employeeNsf);
    const employerFundedTotal = money(grossPay + employerCsg + employerNsf + employerTrainingLevy + employerPrgf);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      paye,
      cumulative_emoluments_after: cumulativeEmoluments,
      paye_withheld_ytd_after: payeWithheldYtdAfter,
      employee_csg: employeeCsg,
      employer_csg: employerCsg,
      employee_nsf: employeeNsf,
      employer_nsf: employerNsf,
      employer_training_levy: employerTrainingLevy,
      employer_prgf: employerPrgf,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    paye: sum(employees.map(e => e.paye)),
    employee_csg: sum(employees.map(e => e.employee_csg)),
    employer_csg: sum(employees.map(e => e.employer_csg)),
    employee_nsf: sum(employees.map(e => e.employee_nsf)),
    employer_nsf: sum(employees.map(e => e.employer_nsf)),
    employer_training_levy: sum(employees.map(e => e.employer_training_levy)),
    employer_prgf: sum(employees.map(e => e.employer_prgf)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: MuJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_CSG_NSF_LEVY_PRGF_EXPENSE', amount: money(totals.employer_csg + totals.employer_nsf + totals.employer_training_levy + totals.employer_prgf) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_PAYABLE', amount: totals.paye },
    { side: 'CREDIT', account_role: 'CSG_PAYABLE', amount: money(totals.employee_csg + totals.employer_csg) },
    { side: 'CREDIT', account_role: 'NSF_PAYABLE', amount: money(totals.employee_nsf + totals.employer_nsf) },
    { side: 'CREDIT', account_role: 'TRAINING_LEVY_PAYABLE', amount: totals.employer_training_levy },
    { side: 'CREDIT', account_role: 'PRGF_PAYABLE', amount: totals.employer_prgf }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'MU',
    currency: 'MUR',
    status: 'PREPARED',
    pay_period_start: input.pay_period_start,
    pay_period_end: input.pay_period_end,
    pay_date: input.pay_date,
    employees,
    totals,
    journal,
    controls: {
      journal_balanced: Math.abs(journalDebits - journalCredits) < 0.005,
      journal_debits: journalDebits,
      journal_credits: journalCredits,
      employee_count: employees.length
    },
    limitations: [...p.limitations]
  };
}

export function payrollEngineSelfTestMU() {
  // Golden test: income-tax band boundaries via period 1, no relief, no
  // prior YTD — cumulativeChargeableIncome equals gross_pay directly.
  const b500000 = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'B1', gross_pay: 500000, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });
  const b500001 = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'B2', gross_pay: 500001, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });
  const b12m = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'B3', gross_pay: 12000001, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });

  // Cumulative mechanics: two-period example. Period 1: gross 700,000, no
  // relief -> cumulativeChargeable=700,000 -> tax=0+(700000-500000)*0.10=20,000
  // -> PAYE period 1 = 20,000. Period 2: another 700,000 ->
  // cumulative=1,400,000 -> tax=50000+(1400000-1000000)*0.20=50000+80000=130000
  // -> PAYE period 2 = 130000-20000=110,000.
  const period1 = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'C1', gross_pay: 700000, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });
  const period2 = calculateMuPayroll({
    pay_period_start: '2026-08-01', pay_period_end: '2026-08-31', pay_date: '2026-08-31',
    employees: [{ employee_id: 'C1', gross_pay: 700000, resident_status: 'RESIDENT', pay_period_sequence: 2, cumulative_emoluments_before: 700000, paye_withheld_ytd_before: 20000, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });

  // Golden test: CSG boundary. Basic 50,000 -> low rate; 50,001 -> high rate.
  const csgLow = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'D1', gross_pay: 50000, resident_status: 'NON_RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });
  const csgHigh = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'D2', gross_pay: 50001, resident_status: 'NON_RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });

  // Golden test: PRGF standard vs exempt.
  const prgfStandard = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'E1', gross_pay: 40000, resident_status: 'NON_RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });
  const prgfExempt = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'E2', gross_pay: 40000, resident_status: 'NON_RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: true }]
  });

  // v2 test: director fees, default 15% and elected 20%, on gross 100,000.
  const directorDefault = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'DIR1', gross_pay: 100000, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: true, is_director: true }]
  });
  const directorElected = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'DIR2', gross_pay: 100000, resident_status: 'RESIDENT', pay_period_sequence: 1, cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: true, is_director: true, director_paye_20pct_election: true }]
  });

  // v2 test: low-monthly-emoluments exclusion. Continuing the period1/
  // period2 employee's cumulative trail (cumulative_emoluments_before
  // 700,000, paye_withheld_ytd_before 20,000) but with only 30,000 gross
  // this period (< Rs38,462) -- without the exclusion, cumulative income
  // 730,000 would produce a nonzero period tax; WITH it, paye must be
  // exactly 0 and the YTD-withheld figure must stay unchanged at 20,000.
  const lowEmoluments = calculateMuPayroll({
    pay_period_start: '2026-08-01', pay_period_end: '2026-08-31', pay_date: '2026-08-31',
    employees: [{ employee_id: 'C1', gross_pay: 30000, resident_status: 'RESIDENT', pay_period_sequence: 2, cumulative_emoluments_before: 700000, paye_withheld_ytd_before: 20000, annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: false }]
  });

  const ok =
    b500000.employees[0].paye === 0 && b500001.employees[0].paye === 0.10 &&
    b12m.employees[0].paye === 2250000.35 &&
    period1.employees[0].paye === 20000 && period2.employees[0].paye === 110000 &&
    period1.controls.journal_balanced && period2.controls.journal_balanced &&
    csgLow.employees[0].employee_csg === 750 && csgLow.employees[0].employer_csg === 1500 &&
    csgHigh.employees[0].employee_csg === 1500.03 && csgHigh.employees[0].employer_csg === 3000.06 &&
    prgfStandard.employees[0].employer_prgf === 1800 && prgfExempt.employees[0].employer_prgf === 0 &&
    directorDefault.employees[0].paye === 15000 && directorDefault.controls.journal_balanced &&
    directorElected.employees[0].paye === 20000 && directorElected.controls.journal_balanced &&
    lowEmoluments.employees[0].paye === 0 && lowEmoluments.employees[0].paye_withheld_ytd_after === 20000 &&
    lowEmoluments.controls.journal_balanced;

  return { ok, b500000, b500001, b12m, period1, period2, csgLow, csgHigh, prgfStandard, prgfExempt, directorDefault, directorElected, lowEmoluments };
}
