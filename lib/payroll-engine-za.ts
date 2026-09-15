// South Africa (ZA) payroll rule pack — v1, tax year 2027 (1 Mar 2026 -
// 28 Feb 2027).
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current South African payroll expertise has checked this against SARS's
// own Guide for Employers in Respect of Employees Tax (2027) and Tax
// Deduction Tables (this engine uses a simplified annualize-and-divide
// approximation, NOT SARS's official period/annual-equivalent tables,
// which the source document explicitly warns against substituting).
//
// Sourced from a user-supplied "South Africa 2026/27 Payroll
// Implementation Reference" (verified to 14 Sep 2026, citing SARS as the
// primary authority) — a genuine parameter reference with real
// brackets/rebates/thresholds attributed to named SARS publications. Not
// independently re-fetched from sars.gov.za directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - PAYE uses a simplified ANNUALIZE-CURRENT-PERIOD-AND-DIVIDE
//     approximation, explicitly flagged by the source as insufficient
//     ("Do not calculate monthly PAYE by merely applying 1/12 of annual
//     brackets to current cash pay. SARS payroll tables contain period,
//     annual-equivalent, remuneration, tax-status and directive logic.").
//     This engine does exactly what the source warns against, for v1, and
//     discloses it rather than hiding it. Monthly pay frequency only.
//   - Age rebates use a caller-supplied employee_age (a plain integer), not
//     date of birth with an age-as-of-date calculation.
//   - Medical scheme fees tax credit is computed from a caller-supplied
//     member/dependant count, applied as a flat monthly credit against the
//     annualized-and-divided tax figure.
//   - Employment Tax Incentive (ETI) is NOT implemented — the source's own
//     hours gross-up/gross-down routine and multi-band qualifying-month
//     logic were judged too complex for a first pass; SDL is implemented
//     only as a flat 1% of gross pay gated on a caller-supplied
//     employer-level eligibility flag (the real R500,000 12-month
//     projected-payroll threshold test is NOT computed by this engine —
//     the caller must already know and supply whether the employer is
//     SDL-liable).
//   - NOT IMPLEMENTED AT ALL in v1, rejected outright: taxable fringe
//     benefits (vehicle, travel allowance, etc.), bonus/irregular-payment
//     annual-equivalent method, severance/lump-sum tax directives (a
//     directive-required payment run through ordinary PAYE brackets would
//     be WRONG — this engine has no directive path and must not be used
//     for such payments), COIDA (explicitly marked DYNAMIC/employer-
//     classification-specific in the source), and all statutory filing/
//     export (EMP201, EMP501, IRP5/IT3(a), SARS BRS). This engine prepares
//     payroll and accounting outputs only — it does not file with SARS.

export type ZaPayFrequency = 'MONTHLY';

export type ZaEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  employee_age: number;
  medical_scheme_main_member: boolean;
  medical_scheme_dependants?: number;
  employer_sdl_liable: boolean;
  // Employment Tax Incentive (ETI) — v2. All three optional; omit all to
  // leave ETI uncomputed (default, backward compatible with every v1
  // caller). If eti_eligible is true, the other two become required.
  // The employer (caller), not this engine, is responsible for verifying
  // the full SARS eligibility test: valid ID/asylum document, the
  // employer not being disqualified, the employee not being a domestic
  // worker or a "connected person" to the employer, and remuneration
  // meeting the applicable minimum wage. This engine only enforces the
  // ONE eligibility fact it can check for itself: age 18-29 inclusive
  // (SEZ employees, where the age limit is waived, are not supported —
  // see limitations).
  eti_eligible?: boolean;
  // Cumulative number of months (1-24) this employee has already been
  // claimed as ETI-qualifying with this employer, INCLUDING the current
  // month — determines the months-1-12 vs months-13-24 rate table.
  eti_employment_months?: number;
  // Hours employed and paid for in this month. Required whenever
  // eti_eligible is true (drives the sub-160-hour gross-up/gross-down
  // proration SARS's own formula requires — see calculation below).
  eti_hours_worked?: number;
};

export type ZaPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: ZaEmployeeInput[];
};

export type ZaJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_UIF_SDL_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_PAYABLE'
    | 'UIF_PAYABLE'
    | 'SDL_PAYABLE'
    | 'ETI_GOVERNMENT_INCENTIVE_INCOME';
  amount: number;
};

export type ZaEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  paye: number;
  employee_uif: number;
  employer_uif: number;
  employer_sdl: number;
  // Employment Tax Incentive — an employer-side PAYE reduction, not a
  // change to this employee's own tax or net_pay (paye/net_pay above are
  // the employee's actual withholding/take-home, unaffected by ETI).
  eti: number;
  net_pay: number;
  employer_funded_total: number;
};

export type ZaPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'ZA';
  currency: 'ZAR';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: ZaEmployeeResult[];
  totals: {
    gross_pay: number;
    paye: number;
    employee_uif: number;
    employer_uif: number;
    employer_sdl: number;
    eti: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: ZaJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_ZA = {
  // v2: adds the Employment Tax Incentive (ETI), directly sourced from
  // SARS's own current ETI page (effective 1 April 2025 changes) rather
  // than approximated — see the eti table and evidence entry below.
  id: 'ZA-2027-PAYE-UIF-SDL-ETI-DRAFT-V2',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'ZAR',
  paye: {
    // [atLeast, base, rate] annual taxable-income brackets, 2027 tax year.
    brackets: [
      [0, 0, 0.18], [245100, 44118, 0.26], [383100, 79998, 0.31], [530200, 125599, 0.36],
      [695800, 185215, 0.39], [887000, 259783, 0.41], [1878600, 666339, 0.45]
    ] as Array<[number, number, number]>,
    primary_rebate_annual: 17820,
    secondary_rebate_annual: 9765, // additional, age 65+
    tertiary_rebate_annual: 3249, // additional, age 75+ (on top of secondary)
    medical_credit_main_monthly: 376,
    medical_credit_first_dependant_monthly: 376,
    medical_credit_additional_dependant_monthly: 254
  },
  uif: {
    rate: 0.01, // employee and employer each
    max_remuneration_monthly: 17712 // -> max R177.12 each
  },
  sdl: { rate: 0.01 },
  eti: {
    // Effective 1 April 2025 (SARS's own current ETI page). Bands are
    // [monthlyRemunerationLessThan, ...] handled directly in code below
    // rather than a generic bracket table, because the middle band is a
    // flat amount (not a rate) and the top band phases down — a shape
    // bracketLookup (built for base+rate-from-a-floor tables) doesn't fit.
    ineligible_at_or_above_monthly: 7500,
    months_1_to_12: { low_band_ceiling: 2500, low_band_rate: 0.60, mid_band_ceiling: 5500, mid_band_flat: 1500, top_band_taper_rate: 0.75 },
    months_13_to_24: { low_band_ceiling: 2500, low_band_rate: 0.30, mid_band_ceiling: 5500, mid_band_flat: 750, top_band_taper_rate: 0.375 },
    full_month_hours: 160,
    qualifying_age_min: 18,
    qualifying_age_max: 29
  },
  evidence: [
    { authority: 'South African Revenue Service (SARS)', instrument: 'Guide for Employers in Respect of Employees Tax (2027) — PAYE annual tax table, rebates, thresholds, medical scheme fees tax credit', url: 'https://www.sars.gov.za/businesses-and-employers/employers/tax-tables/' },
    { authority: 'South African Revenue Service (SARS)', instrument: 'Unemployment Insurance Fund (UIF) — 1% employee + 1% employer, R17,712/month remuneration ceiling', url: 'https://www.sars.gov.za/businesses-and-employers/employers/uif/' },
    { authority: 'South African Revenue Service (SARS)', instrument: 'Skills Development Levy (SDL) — 1% of leviable remuneration, R500,000 12-month exemption threshold', url: 'https://www.sars.gov.za/businesses-and-employers/employers/skills-development-levy/' },
    { authority: 'South African Revenue Service (SARS)', instrument: 'Employment Tax Incentive (ETI) — own current page, changes effective 1 April 2025: months 1-12 (60% / R1,500 flat / R1,500 minus 75% taper), months 13-24 (30% / R750 flat / R750 minus 37.5% taper), R7,500/month ineligibility threshold, 160-hour gross-up/gross-down proration, 18-29 qualifying age', url: 'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/employment-tax-incentive-eti/' },
    { authority: 'User-supplied reference', instrument: '"South Africa 2026/27 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from. Not independently re-fetched from sars.gov.za directly this pass.', url: 'file: South_Africa_2026_27_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only, tax year 2027 (1 Mar 2026 - 28 Feb 2027). PAYE uses a simplified ANNUALIZE-CURRENT-PERIOD-AND-DIVIDE approximation — the source document explicitly warns against this exact shortcut ("Do not calculate monthly PAYE by merely applying 1/12 of annual brackets to current cash pay"), since real SARS payroll tables use period/annual-equivalent/remuneration/tax-status/directive logic this engine does not implement. This will diverge from the correct SARS figure whenever pay varies period to period.',
    'employee_age is a plain caller-supplied integer, not derived from date of birth as of the pay date.',
    'Employment Tax Incentive (ETI), v2: computed ONLY when the caller supplies eti_eligible: true plus eti_employment_months and eti_hours_worked, straight off SARS\'s own current formula (effective 1 April 2025) — including the 160-hour gross-up/gross-down proration the v1 scope note explicitly deferred. This is an EMPLOYER-side PAYE reduction only: it never changes the employee\'s own paye or net_pay figures, and is posted as its own ETI_GOVERNMENT_INCENTIVE_INCOME journal line plus an offsetting debit against PAYE_PAYABLE (so the two PAYE_PAYABLE lines together net to the actual amount remitted to SARS). This engine independently checks only ONE SARS eligibility rule — employee_age between 18 and 29 inclusive — and rejects eti_eligible: true outside that range. Every OTHER SARS eligibility test remains the caller\'s responsibility and is NOT verified by this engine: valid ID/asylum documentation, the employer itself not being disqualified (e.g. for underpaying minimum wage generally, or for a prior dismissal-and-rehire to claim ETI), the employee not being a domestic worker or a "connected person" to the employer, and the minimum-wage remuneration floor. Special Economic Zone (SEZ) employment, where the 18-29 age limit is waived entirely, is NOT supported — an SEZ employee outside 18-29 must be claimed outside this engine. The 24-month cumulative claim limit is enforced via eti_employment_months (rejected if >24), but this engine has no memory of its own between calls — the caller must track and pass the correct cumulative count each month. SDL is a flat 1% of gross pay gated on a caller-supplied employer_sdl_liable flag; the real R500,000 12-month projected-leviable-payroll exemption test is NOT computed by this engine.',
    'NOT IMPLEMENTED AT ALL in v1, rejected outright: taxable fringe benefits (vehicle, low-interest loans, etc. — gross_pay is assumed to be cash remuneration only); travel allowances; the bonus/irregular-payment annual-equivalent method (a bonus run through this engine as ordinary gross pay will be taxed incorrectly); severance/lump-sum SARS tax directives (payments requiring a directive MUST NOT be run through this engine\'s ordinary PAYE calculation — it has no directive path); COIDA (Compensation Fund assessment, explicitly marked DYNAMIC/employer-classification-specific in the source); all statutory filing/export (EMP201, EMP501, IRP5/IT3(a), SARS BRS validation). This engine prepares payroll and accounting outputs only — it does not file with SARS.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing SARS), not independently re-fetched from sars.gov.za directly this pass. Should be reconfirmed against SARS\'s own 2027 Guide for Employers and Tax Deduction Tables before this pack is marked VERIFIED_BASIC_RULES.'
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

export function calculateZaPayroll(input: ZaPayrollRunInput): ZaPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_ZA;
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

    if (!Number.isInteger(employee.employee_age) || employee.employee_age < 0) {
      const error = new Error(`employee_age for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.medical_scheme_main_member !== 'boolean') {
      const error = new Error(`medical_scheme_main_member must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.employer_sdl_liable !== 'boolean') {
      const error = new Error(`employer_sdl_liable must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const dependants = employee.medical_scheme_dependants ?? 0;
    if (!Number.isInteger(dependants) || dependants < 0) {
      const error = new Error(`medical_scheme_dependants for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    // --- PAYE (simplified annualize-and-divide; see limitations) ---
    const annualGross = money(grossPay * 12);
    const grossAnnualTax = bracketLookup(annualGross, p.paye.brackets);
    let rebate = p.paye.primary_rebate_annual;
    if (employee.employee_age >= 65) rebate += p.paye.secondary_rebate_annual;
    if (employee.employee_age >= 75) rebate += p.paye.tertiary_rebate_annual;
    const annualTaxAfterRebate = Math.max(0, money(grossAnnualTax - rebate));
    const monthlyTax = money(annualTaxAfterRebate / 12);

    let medicalCredit = 0;
    if (employee.medical_scheme_main_member) {
      medicalCredit += p.paye.medical_credit_main_monthly;
      if (dependants >= 1) medicalCredit += p.paye.medical_credit_first_dependant_monthly;
      if (dependants >= 2) medicalCredit += p.paye.medical_credit_additional_dependant_monthly * (dependants - 1);
    }
    const paye = Math.max(0, money(monthlyTax - medicalCredit));

    // --- UIF ---
    const uifBase = Math.min(grossPay, p.uif.max_remuneration_monthly);
    const employeeUif = money(p.uif.rate * uifBase);
    const employerUif = employeeUif;

    // --- SDL ---
    const employerSdl = employee.employer_sdl_liable ? money(p.sdl.rate * grossPay) : 0;

    // --- ETI (Employment Tax Incentive, employer-side only; see limitations) ---
    let eti = 0;
    if (employee.eti_eligible) {
      if (employee.employee_age < p.eti.qualifying_age_min || employee.employee_age > p.eti.qualifying_age_max) {
        const error = new Error(`${employeeId}: eti_eligible requires employee_age between ${p.eti.qualifying_age_min} and ${p.eti.qualifying_age_max} (SEZ age-waiver is not supported)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.eti_employment_months) || (employee.eti_employment_months as number) < 1 || (employee.eti_employment_months as number) > 24) {
        const error = new Error(`eti_employment_months for ${employeeId} must be an integer from 1 to 24`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isFinite(employee.eti_hours_worked) || (employee.eti_hours_worked as number) <= 0) {
        const error = new Error(`eti_hours_worked for ${employeeId} must be a positive number`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      const hoursWorked = employee.eti_hours_worked as number;
      const fullMonthHours = p.eti.full_month_hours;
      // Gross-up: for a part-month employee, the BAND is determined on a
      // full-month-equivalent remuneration, per SARS's own formula.
      const grossedUpRemuneration = hoursWorked < fullMonthHours
        ? money(grossPay * (fullMonthHours / hoursWorked))
        : grossPay;
      const table = (employee.eti_employment_months as number) <= 12 ? p.eti.months_1_to_12 : p.eti.months_13_to_24;
      let rawIncentive = 0;
      if (grossedUpRemuneration < p.eti.ineligible_at_or_above_monthly) {
        if (grossedUpRemuneration < table.low_band_ceiling) {
          rawIncentive = money(grossedUpRemuneration * table.low_band_rate);
        } else if (grossedUpRemuneration < table.mid_band_ceiling) {
          rawIncentive = table.mid_band_flat;
        } else {
          rawIncentive = Math.max(0, money(table.mid_band_flat - table.top_band_taper_rate * (grossedUpRemuneration - table.mid_band_ceiling)));
        }
      }
      // Gross-down: scale the full-month incentive back to actual hours worked.
      eti = hoursWorked < fullMonthHours ? money(rawIncentive * (hoursWorked / fullMonthHours)) : rawIncentive;
    }

    const netPay = money(grossPay - paye - employeeUif);
    const employerFundedTotal = money(grossPay + employerUif + employerSdl);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      paye,
      employee_uif: employeeUif,
      employer_uif: employerUif,
      employer_sdl: employerSdl,
      eti,
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
    employee_uif: sum(employees.map(e => e.employee_uif)),
    employer_uif: sum(employees.map(e => e.employer_uif)),
    employer_sdl: sum(employees.map(e => e.employer_sdl)),
    eti: sum(employees.map(e => e.eti)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: ZaJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_UIF_SDL_EXPENSE', amount: money(totals.employer_uif + totals.employer_sdl) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_PAYABLE', amount: totals.paye },
    { side: 'CREDIT', account_role: 'UIF_PAYABLE', amount: money(totals.employee_uif + totals.employer_uif) },
    { side: 'CREDIT', account_role: 'SDL_PAYABLE', amount: totals.employer_sdl },
    // ETI: reduces the PAYE actually remitted to SARS (a DEBIT against the
    // liability recognized above) with the offsetting entry recognizing
    // the incentive as income. The two PAYE_PAYABLE lines net to
    // (totals.paye - totals.eti), the real amount owed.
    ...(totals.eti > 0
      ? [
          { side: 'DEBIT' as const, account_role: 'PAYE_PAYABLE' as const, amount: totals.eti },
          { side: 'CREDIT' as const, account_role: 'ETI_GOVERNMENT_INCENTIVE_INCOME' as const, amount: totals.eti }
        ]
      : [])
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'ZA',
    currency: 'ZAR',
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

export function payrollEngineSelfTestZA() {
  // Case 1: monthly gross R20,425 (annual = R245,100, exactly the first
  // bracket boundary), age 40, no medical scheme.
  // Tax before rebate = R44,118 (either bracket formula gives the same
  // value at this exact boundary). Rebate (under 65) = R17,820.
  // Annual after rebate = 26,298 -> monthly = 2,191.50.
  const r1 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z1', gross_pay: 20425, employee_age: 40,
      medical_scheme_main_member: false, employer_sdl_liable: false
    }]
  });
  const e1 = r1.employees[0];

  // Case 2: same gross/age, but with medical scheme (self + 2 dependants):
  // credit = 376 (self) + 376 (first dependant) + 254*(2-1) = 1,006.
  // paye = max(0, 2191.50 - 1006) = 1,185.50.
  const r2 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z2', gross_pay: 20425, employee_age: 40,
      medical_scheme_main_member: true, medical_scheme_dependants: 2, employer_sdl_liable: true
    }]
  });
  const e2 = r2.employees[0];

  // Case 3: UIF cap golden test from the source — R30,000 gross => UIF
  // capped at R17,712 base -> R177.12 each side (the source's own stated max).
  const r3 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z3', gross_pay: 30000, employee_age: 40,
      medical_scheme_main_member: false, employer_sdl_liable: false
    }]
  });
  const e3 = r3.employees[0];

  // Case 4: ETI, months 1-12, full month (160 hrs), remuneration in the
  // mid flat band (R2,500-R5,499.99) -> flat R1,500. Age 25 (qualifies).
  const r4 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z4', gross_pay: 4000, employee_age: 25,
      medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: 1, eti_hours_worked: 160
    }]
  });
  const e4 = r4.employees[0];

  // Case 5: ETI, months 13-24 (half rates), top taper band. Full month.
  // Remuneration 6000 -> table.mid_band_flat(750) - 37.5%*(6000-5500) = 750-187.5 = 562.50.
  const r5 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z5', gross_pay: 6000, employee_age: 28,
      medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: 13, eti_hours_worked: 160
    }]
  });
  const e5 = r5.employees[0];

  // Case 6: ETI, part month (80 of 160 hours), low band, months 1-12.
  // Grossed-up remuneration = 1000 * (160/80) = 2000 -> low band (60%): 2000*0.6=1200.
  // Grossed-down back to actual hours: 1200 * (80/160) = 600.00.
  const r6 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z6', gross_pay: 1000, employee_age: 19,
      medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: 1, eti_hours_worked: 80
    }]
  });
  const e6 = r6.employees[0];

  // Case 7: ineligible remuneration (>= R7,500) -> eti must be 0 despite eti_eligible: true.
  const r7 = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'Z7', gross_pay: 8000, employee_age: 25,
      medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: 1, eti_hours_worked: 160
    }]
  });
  const e7 = r7.employees[0];

  const ok =
    e1.paye === 2191.50 && r1.controls.journal_balanced &&
    e2.paye === 1185.50 && e2.employer_sdl === 204.25 && r2.controls.journal_balanced &&
    e3.employee_uif === 177.12 && e3.employer_uif === 177.12 && r3.controls.journal_balanced &&
    e4.eti === 1500 && r4.controls.journal_balanced &&
    e5.eti === 562.50 && r5.controls.journal_balanced &&
    e6.eti === 600 && r6.controls.journal_balanced &&
    e7.eti === 0 && r7.controls.journal_balanced;

  return { ok, r1, r2, r3, r4, r5, r6, r7 };
}
