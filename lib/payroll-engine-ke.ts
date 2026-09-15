// Kenya (KE) payroll rule pack — v1.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Kenyan payroll expertise has checked this against KRA's own PAYE
// guidance, the NSSF Act Year 4 schedule, SHIF regulations, and the AHL/
// NITA rules.
//
// Sourced from a user-supplied "Kenya 2026 Payroll Implementation
// Reference" (verified to 14 Sep 2026, citing KRA, Kenya Law, NSSF Kenya,
// and NITA as primary authorities) — a genuine parameter reference with
// real bands/rates/caps attributed to named government sources, including
// its own worked golden-test figures which this pack's self-tests
// reproduce exactly. Not independently re-fetched from kra.go.ke/nssf
// directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - Monthly PAYE only (Kenya payroll is calendar-month). NSSF is
//     versioned by pay_date: pay periods before 2026-02-01 use the Year 3
//     schedule (Tier I ceiling KES8,000 / overall ceiling KES72,000); pay
//     periods on/after 2026-02-01 use the Year 4 schedule (KES9,000 /
//     KES108,000). No other historical NSSF version is modeled.
//   - Personal relief and insurance relief apply only to resident
//     taxpayers, per the source ("resident personal relief"). Non-resident
//     employees get PAYE computed with no personal or insurance relief —
//     this is a real distinction the source flags but does not fully
//     specify (e.g. whether non-residents use the same bands); treated as
//     the same bands with reliefs zeroed out, which is the ordinary case
//     but not independently confirmed against a nonresident-specific KRA
//     rule.
//   - The "qualifying pension/retirement deduction" cap (KES30,000/month)
//     is applied to the SUM of the employee's computed NSSF contribution
//     plus any additional caller-supplied voluntary pension contribution —
//     a reasonable reading of the source's step 5, not a directly quoted
//     formula for how NSSF specifically interacts with the KES30,000 cap.
//   - NOT IMPLEMENTED AT ALL in v1, rejected outright: non-cash/fringe
//     benefits (housing, motor vehicle, low-interest-loan fringe benefit
//     tax), secondary employment tax treatment, contracted-out NSSF Tier
//     II arrangements, and all statutory filing/export (iTax, SHA, NSSF
//     employer upload). This engine prepares payroll and accounting
//     outputs only — it does not file with KRA/SHA/NSSF.

export type KePayFrequency = 'MONTHLY';
export type KeResidentStatus = 'RESIDENT' | 'NON_RESIDENT';

export type KeEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  resident_status: KeResidentStatus;
  // Optional voluntary pension/retirement contribution ADDITIONAL to the
  // computed NSSF amount, subject to the combined KES30,000/month cap.
  additional_pension_contribution?: number;
  qualifying_mortgage_interest?: number;
  post_retirement_medical_deduction?: number;
  // Insurance premium paid this period, eligible for the 15%-of-premium
  // relief (capped at KES5,000/month = KES60,000/year).
  insurance_premium_paid?: number;
};

export type KePayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: KeEmployeeInput[];
};

export type KeJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_NSSF_AHL_NITA_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_PAYABLE'
    | 'NSSF_PAYABLE'
    | 'SHIF_PAYABLE'
    | 'AHL_PAYABLE'
    | 'NITA_PAYABLE';
  amount: number;
};

export type KeEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  nssf_version: '2026_Y3_JAN' | '2026_Y4_FROM_FEB';
  paye: number;
  employee_nssf: number;
  employer_nssf: number;
  employee_shif: number;
  employee_ahl: number;
  employer_ahl: number;
  employer_nita: number;
  net_pay: number;
  employer_funded_total: number;
};

export type KePayrollRunResult = {
  rule_pack_id: string;
  country_code: 'KE';
  currency: 'KES';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: KeEmployeeResult[];
  totals: {
    gross_pay: number;
    paye: number;
    employee_nssf: number;
    employer_nssf: number;
    employee_shif: number;
    employee_ahl: number;
    employer_ahl: number;
    employer_nita: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: KeJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_KE = {
  id: 'KE-2026-PAYE-NSSF-SHIF-AHL-NITA-DRAFT-V1',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'KES',
  paye: {
    // [atLeast, base, rate] monthly bands.
    brackets: [
      [0, 0, 0.10], [24000, 2400, 0.25], [32333, 4483.25, 0.30],
      [500000, 144783.35, 0.325], [800000, 242283.35, 0.35]
    ] as Array<[number, number, number]>,
    personal_relief_monthly: 2400,
    insurance_relief_rate: 0.15,
    insurance_relief_cap_monthly: 5000, // = KES60,000/year
    pension_deduction_cap_monthly: 30000,
    mortgage_interest_cap_monthly: 30000,
    post_retirement_medical_cap_monthly: 15000
  },
  nssf: {
    year3_jan: { tier1_ceiling: 8000, overall_ceiling: 72000 },
    year4_from_feb: { tier1_ceiling: 9000, overall_ceiling: 108000 },
    rate: 0.06, // employee and employer each, both tiers
    version_effective_date: '2026-02-01'
  },
  shif: { rate: 0.0275, minimum_monthly: 300 },
  ahl: { employee_rate: 0.015, employer_rate: 0.015 },
  nita: { employer_flat_monthly: 50 },
  evidence: [
    { authority: 'Kenya Revenue Authority', instrument: 'Pay As You Earn (PAYE) — monthly bands, personal relief, insurance relief, deductible items', url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye' },
    { authority: 'Kenya Revenue Authority', instrument: 'Affordable Housing Levy — 1.5% employee + 1.5% employer', url: 'https://www.kra.go.ke/business/local-businesses/filing-paying/types-of-taxes/affordable-housing-levy' },
    { authority: 'Kenya Law', instrument: 'Social Health Insurance Regulations — SHIF salaried contribution 2.75%, KES300 minimum', url: 'https://new.kenyalaw.org/' },
    { authority: 'National Social Security Fund (NSSF) Kenya', instrument: 'Year 4 (2026) employer notice — NSSF Act Tier I/Tier II phased contribution schedule, effective 1 Feb 2026', url: 'https://www.nssf.or.ke/' },
    { authority: 'National Industrial Training Authority (NITA)', instrument: 'Industrial Training Levy — KES50/employee/month, employer-only', url: 'https://www.nita.go.ke/' },
    { authority: 'User-supplied reference', instrument: '"Kenya 2026 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from, including its own worked golden-test figures (NSSF transition, SHIF minimum, AHL, NITA) which this pack\'s self-tests reproduce exactly. Not independently re-fetched from kra.go.ke/nssf.or.ke directly this pass.', url: 'file: Kenya_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only. NSSF is versioned strictly by pay_date (before vs on/after 2026-02-01) — no other historical NSSF version is modeled.',
    'Personal relief and insurance relief are applied only for RESIDENT employees; NON_RESIDENT employees get the same PAYE bands with both reliefs zeroed out — a reasonable but not independently KRA-confirmed treatment for non-residents.',
    'The KES30,000/month "qualifying pension/retirement deduction" cap is applied to the SUM of the employee\'s computed NSSF contribution plus any additional caller-supplied voluntary pension contribution — a reading of the source\'s step 5, not a directly quoted formula for exactly how NSSF interacts with that cap.',
    'NOT IMPLEMENTED AT ALL in v1, rejected outright: non-cash/fringe benefits (housing, motor vehicle, low-interest-loan fringe benefit tax) — gross pay is assumed to be cash salary/wages only; secondary employment tax treatment; contracted-out NSSF Tier II employer arrangements; all statutory filing/export (iTax PAYE/AHL schedules, SHA remittance, NSSF employer upload). This engine prepares payroll and accounting outputs only — it does not file with KRA/SHA/NSSF.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing KRA/NSSF/NITA), not independently re-fetched directly this pass. Should be reconfirmed against KRA\'s own PAYE guide and the NSSF Act Year 4 notice before this pack is marked VERIFIED_BASIC_RULES.'
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

export function calculateKePayroll(input: KePayrollRunInput): KePayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_KE;
  const seen = new Set<string>();
  const nssfVersion: '2026_Y3_JAN' | '2026_Y4_FROM_FEB' =
    input.pay_date >= p.nssf.version_effective_date ? '2026_Y4_FROM_FEB' : '2026_Y3_JAN';
  const nssfSchedule = nssfVersion === '2026_Y4_FROM_FEB' ? p.nssf.year4_from_feb : p.nssf.year3_jan;

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

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const additionalPension = requireNonNegativeMoney(employee.additional_pension_contribution ?? 0, `additional_pension_contribution for ${employeeId}`);
    const mortgageInterest = requireNonNegativeMoney(employee.qualifying_mortgage_interest ?? 0, `qualifying_mortgage_interest for ${employeeId}`);
    const postRetirementMedical = requireNonNegativeMoney(employee.post_retirement_medical_deduction ?? 0, `post_retirement_medical_deduction for ${employeeId}`);
    const insurancePremium = requireNonNegativeMoney(employee.insurance_premium_paid ?? 0, `insurance_premium_paid for ${employeeId}`);

    // --- NSSF (Tier I / Tier II) ---
    const tier1Employee = money(p.nssf.rate * Math.min(grossPay, nssfSchedule.tier1_ceiling));
    const tier2Employee = money(p.nssf.rate * Math.max(0, Math.min(grossPay, nssfSchedule.overall_ceiling) - nssfSchedule.tier1_ceiling));
    const employeeNssf = money(tier1Employee + tier2Employee);
    const employerNssf = employeeNssf;

    // --- SHIF ---
    const employeeShif = Math.max(p.shif.minimum_monthly, money(p.shif.rate * grossPay));

    // --- AHL ---
    const employeeAhl = money(p.ahl.employee_rate * grossPay);
    const employerAhl = money(p.ahl.employer_rate * grossPay);

    // --- NITA (employer-only, flat) ---
    const employerNita = p.nita.employer_flat_monthly;

    // --- PAYE taxable pay ---
    const pensionDeductible = Math.min(money(employeeNssf + additionalPension), p.paye.pension_deduction_cap_monthly);
    const mortgageDeductible = Math.min(mortgageInterest, p.paye.mortgage_interest_cap_monthly);
    const medicalDeductible = Math.min(postRetirementMedical, p.paye.post_retirement_medical_cap_monthly);
    const taxablePay = Math.max(0, money(grossPay - employeeAhl - employeeShif - pensionDeductible - mortgageDeductible - medicalDeductible));
    const grossTax = bracketLookup(taxablePay, p.paye.brackets);

    let paye = grossTax;
    if (employee.resident_status === 'RESIDENT') {
      const insuranceRelief = Math.min(money(p.paye.insurance_relief_rate * insurancePremium), p.paye.insurance_relief_cap_monthly);
      paye = Math.max(0, money(grossTax - p.paye.personal_relief_monthly - insuranceRelief));
    }

    const netPay = money(grossPay - paye - employeeNssf - employeeShif - employeeAhl);
    const employerFundedTotal = money(grossPay + employerNssf + employerAhl + employerNita);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      nssf_version: nssfVersion,
      paye,
      employee_nssf: employeeNssf,
      employer_nssf: employerNssf,
      employee_shif: employeeShif,
      employee_ahl: employeeAhl,
      employer_ahl: employerAhl,
      employer_nita: employerNita,
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
    employee_nssf: sum(employees.map(e => e.employee_nssf)),
    employer_nssf: sum(employees.map(e => e.employer_nssf)),
    employee_shif: sum(employees.map(e => e.employee_shif)),
    employee_ahl: sum(employees.map(e => e.employee_ahl)),
    employer_ahl: sum(employees.map(e => e.employer_ahl)),
    employer_nita: sum(employees.map(e => e.employer_nita)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: KeJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_NSSF_AHL_NITA_EXPENSE', amount: money(totals.employer_nssf + totals.employer_ahl + totals.employer_nita) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_PAYABLE', amount: totals.paye },
    { side: 'CREDIT', account_role: 'NSSF_PAYABLE', amount: money(totals.employee_nssf + totals.employer_nssf) },
    { side: 'CREDIT', account_role: 'SHIF_PAYABLE', amount: totals.employee_shif },
    { side: 'CREDIT', account_role: 'AHL_PAYABLE', amount: money(totals.employee_ahl + totals.employer_ahl) },
    { side: 'CREDIT', account_role: 'NITA_PAYABLE', amount: totals.employer_nita }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'KE',
    currency: 'KES',
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

export function payrollEngineSelfTestKE() {
  // Golden test from the source document: NSSF transition. Same
  // KES120,000 salary: Jan 2026 => KES4,320 per side; Feb 2026 => KES6,480
  // per side.
  const jan = calculateKePayroll({
    pay_period_start: '2026-01-01', pay_period_end: '2026-01-31', pay_date: '2026-01-31',
    employees: [{ employee_id: 'K1', gross_pay: 120000, resident_status: 'RESIDENT' }]
  });
  const feb = calculateKePayroll({
    pay_period_start: '2026-02-01', pay_period_end: '2026-02-28', pay_date: '2026-02-28',
    employees: [{ employee_id: 'K1', gross_pay: 120000, resident_status: 'RESIDENT' }]
  });

  // Golden test: NSSF mid band, KES50,000 from Feb => total employee NSSF KES3,000.
  const midBand = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{ employee_id: 'K2', gross_pay: 50000, resident_status: 'RESIDENT' }]
  });

  // Golden test: SHIF minimum, KES5,000 salary => KES300 (2.75% would be 137.50).
  const shifMin = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{ employee_id: 'K3', gross_pay: 5000, resident_status: 'RESIDENT' }]
  });

  // Golden test: AHL, KES100,000 => employee KES1,500, employer KES1,500.
  const ahl = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{ employee_id: 'K4', gross_pay: 100000, resident_status: 'RESIDENT' }]
  });

  // Golden test: NITA, 50 employees => KES2,500 employer levy, net pay unaffected.
  const nitaRun = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: Array.from({ length: 50 }, (_, i) => ({
      employee_id: `N${i + 1}`, gross_pay: 30000, resident_status: 'RESIDENT' as const
    }))
  });

  const ok =
    jan.employees[0].employee_nssf === 4320 && jan.employees[0].employer_nssf === 4320 &&
    jan.employees[0].nssf_version === '2026_Y3_JAN' && jan.controls.journal_balanced &&
    feb.employees[0].employee_nssf === 6480 && feb.employees[0].employer_nssf === 6480 &&
    feb.employees[0].nssf_version === '2026_Y4_FROM_FEB' && feb.controls.journal_balanced &&
    midBand.employees[0].employee_nssf === 3000 && midBand.controls.journal_balanced &&
    shifMin.employees[0].employee_shif === 300 && shifMin.controls.journal_balanced &&
    ahl.employees[0].employee_ahl === 1500 && ahl.employees[0].employer_ahl === 1500 && ahl.controls.journal_balanced &&
    nitaRun.totals.employer_nita === 2500 && nitaRun.controls.journal_balanced;

  return { ok, jan, feb, midBand, shifMin, ahl, nitaRun };
}
