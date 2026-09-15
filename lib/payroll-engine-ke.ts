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
  // Housing benefit-in-kind, v2. All optional — omit housing_benefit_
  // provided (default false) to leave PAYE unaffected, exactly matching
  // v1. When true, housing_benefit_arrangement selects which KRA formula
  // applies (see PAYE Guide Sec. 8): ARMS_LENGTH_LEASE requires
  // housing_benefit_rent_paid_by_employer (compared against 15% of gross
  // pay, higher wins); EMPLOYER_OWNED_OR_NON_ARMS_LENGTH requires
  // housing_benefit_fair_market_rental_value directly (the caller must
  // supply this — this engine cannot determine fair market rent itself).
  // housing_benefit_rent_recovered_from_employee (default 0) is deducted
  // from either result. Only the "Any other Employee" case (c) is
  // implemented — the reduced agricultural-employee rate (b) and the
  // director-specific rule (a) are NOT modeled; see limitations.
  housing_benefit_provided?: boolean;
  housing_benefit_arrangement?: 'ARMS_LENGTH_LEASE' | 'EMPLOYER_OWNED_OR_NON_ARMS_LENGTH';
  housing_benefit_rent_paid_by_employer?: number;
  housing_benefit_fair_market_rental_value?: number;
  housing_benefit_rent_recovered_from_employee?: number;
  // Car benefit-in-kind, v2. All optional — omit car_benefit_provided
  // (default false) to leave PAYE unaffected. When true, EITHER supply
  // car_benefit_lease_or_hire_cost_monthly (vehicle hired/leased from a
  // third party — the benefit equals that cost directly), OR supply BOTH
  // car_benefit_initial_cost and car_benefit_cc_band (employer-owned
  // vehicle — benefit is the higher of 2%/month of initial cost and the
  // Commissioner's prescribed monthly rate for that engine-capacity band).
  car_benefit_provided?: boolean;
  car_benefit_lease_or_hire_cost_monthly?: number;
  car_benefit_initial_cost?: number;
  car_benefit_cc_band?: KeCarCcBand;
};

// Commissioner's prescribed monthly car-benefit rates by engine capacity
// (KRA Employer's Guide to PAYE, Appendix 6, saloon/hatchback/estate
// table only — pick-ups, panel vans, and Land Rovers/Cruisers use
// separate tables not modeled here). See limitations for the staleness
// caveat on these exact figures.
export type KeCarCcBand = 'UP_TO_1200' | 'CC_1201_TO_1500' | 'CC_1501_TO_1750' | 'CC_1751_TO_2000' | 'CC_2001_TO_3000' | 'OVER_3000';

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
  housing_benefit: number;
  car_benefit: number;
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
    housing_benefit: number;
    car_benefit: number;
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
  // v2: adds housing and car benefit-in-kind to the PAYE taxable base,
  // per KRA's own Employer's Guide to PAYE (Sections 8-9). The core
  // formula SHAPE (15%-of-gross-or-rent-paid for housing; 2%-of-cost-or-
  // prescribed-rate for cars, whichever is higher) is a stable statutory
  // mechanic. The car benefit's exact cc-band Kshs table, however, comes
  // from a 2017-dated edition of that guide and its own effective date
  // for those exact figures (2003) predates this — flagged explicitly
  // in limitations as needing reconfirmation, the same staleness-caveat
  // pattern already used elsewhere in this codebase (e.g. DC's 2022
  // dependent allowance in the US engine).
  id: 'KE-2026-PAYE-NSSF-SHIF-AHL-NITA-BIK-DRAFT-V2',
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
  housing_benefit: {
    // "Any other Employee" case (KRA PAYE Guide Sec. 8(c)) only.
    percent_of_gross: 0.15
  },
  car_benefit: {
    owned_rate_of_cost_monthly: 0.02,
    // Commissioner's prescribed monthly rates by cc band (Appendix 6,
    // saloon/hatchback/estate table) — see the v2 change-log staleness
    // caveat above and limitations below.
    prescribed_monthly_by_cc_band: {
      UP_TO_1200: 3600,
      CC_1201_TO_1500: 4200,
      CC_1501_TO_1750: 5800,
      CC_1751_TO_2000: 7200,
      CC_2001_TO_3000: 8600,
      OVER_3000: 14400
    } as Record<KeCarCcBand, number>
  },
  evidence: [
    { authority: 'Kenya Revenue Authority', instrument: 'Pay As You Earn (PAYE) — monthly bands, personal relief, insurance relief, deductible items', url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye' },
    { authority: 'Kenya Revenue Authority', instrument: 'Affordable Housing Levy — 1.5% employee + 1.5% employer', url: 'https://www.kra.go.ke/business/local-businesses/filing-paying/types-of-taxes/affordable-housing-levy' },
    { authority: 'Kenya Law', instrument: 'Social Health Insurance Regulations — SHIF salaried contribution 2.75%, KES300 minimum', url: 'https://new.kenyalaw.org/' },
    { authority: 'National Social Security Fund (NSSF) Kenya', instrument: 'Year 4 (2026) employer notice — NSSF Act Tier I/Tier II phased contribution schedule, effective 1 Feb 2026', url: 'https://www.nssf.or.ke/' },
    { authority: 'National Industrial Training Authority (NITA)', instrument: 'Industrial Training Levy — KES50/employee/month, employer-only', url: 'https://www.nita.go.ke/' },
    { authority: 'User-supplied reference', instrument: '"Kenya 2026 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from, including its own worked golden-test figures (NSSF transition, SHIF minimum, AHL, NITA) which this pack\'s self-tests reproduce exactly. Not independently re-fetched from kra.go.ke/nssf.or.ke directly this pass.', url: 'file: Kenya_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' },
    { authority: 'Kenya Revenue Authority', instrument: 'Employer\'s Guide to PAYE in Kenya (Revised Edition — 2017), Section 8 (Housing) and Section 9 (Car Benefit), including Appendix 6 (Commissioner\'s Prescribed Benefit Rates). Independently fetched directly (not via the implementation-reference document). This edition\'s income-tax bands/reliefs are outdated and NOT used by this engine (the existing 2026-dated paye bracket/relief figures above are unaffected) — only the STRUCTURAL housing/car benefit formulas and the car cc-band rate table are sourced from it; see limitations for the resulting staleness caveat on the exact car-benefit Kshs figures.', url: 'https://www.kra.go.ke/images/publications/PAYE_Guide-2.pdf' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only. NSSF is versioned strictly by pay_date (before vs on/after 2026-02-01) — no other historical NSSF version is modeled.',
    'Personal relief and insurance relief are applied only for RESIDENT employees; NON_RESIDENT employees get the same PAYE bands with both reliefs zeroed out — a reasonable but not independently KRA-confirmed treatment for non-residents.',
    'The KES30,000/month "qualifying pension/retirement deduction" cap is applied to the SUM of the employee\'s computed NSSF contribution plus any additional caller-supplied voluntary pension contribution — a reading of the source\'s step 5, not a directly quoted formula for exactly how NSSF interacts with that cap.',
    'Housing benefit-in-kind, v2: computed ONLY when housing_benefit_provided is true, using ONLY the "Any other Employee" case (KRA PAYE Guide Sec. 8(c)) — the higher of 15% of gross pay or arm\'s-length rent paid by the employer, minus any rent recovered from the employee. The director-specific rule (higher of 15% of TOTAL income, fair market rental, or rent paid) and the reduced 10%-of-gains agricultural-employee rate are NOT implemented; a director or agricultural employee run through this path would get the wrong figure, so the caller must not set housing_benefit_provided for those cases. Added to the PAYE taxable base only — NOT to NSSF, SHIF, or AHL contribution bases, since this engine has no confirmation those bases include non-cash housing value (flagged as unconfirmed, conservatively excluded).',
    'Car benefit-in-kind, v2: computed ONLY when car_benefit_provided is true — either car_benefit_lease_or_hire_cost_monthly directly (third-party-leased vehicle), or the higher of 2%/month of car_benefit_initial_cost and the Commissioner\'s prescribed monthly rate for car_benefit_cc_band (employer-owned vehicle, saloon/hatchback/estate table only — pick-ups, panel vans, and Land Rovers/Cruisers use separate tables this engine does not model). The prescribed cc-band Kshs figures come from a 2017-dated edition of KRA\'s Employer\'s Guide (Appendix 6, itself dated "effective from 12 June 2003" for the adjoining services table) — these exact rates have NOT been reconfirmed against KRA\'s current schedule and may be stale; the 2%-of-cost formula itself is the statutory mechanic and much less likely to have changed. Reconfirm the cc-band table before real payroll use. Also added to the PAYE taxable base only, not NSSF/SHIF/AHL, for the same unconfirmed-base reason as housing.',
    'NOT IMPLEMENTED: low-interest-loan fringe benefit tax (a distinct EMPLOYER-paid tax under Section 12B, not an employee PAYE item); secondary employment tax treatment; contracted-out NSSF Tier II employer arrangements; all statutory filing/export (iTax PAYE/AHL schedules, SHA remittance, NSSF employer upload). This engine prepares payroll and accounting outputs only — it does not file with KRA/SHA/NSSF.',
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

    // --- Housing benefit-in-kind validation (v2; see limitations) ---
    let housingBenefit = 0;
    if (employee.housing_benefit_provided) {
      if (employee.housing_benefit_arrangement !== 'ARMS_LENGTH_LEASE' && employee.housing_benefit_arrangement !== 'EMPLOYER_OWNED_OR_NON_ARMS_LENGTH') {
        const error = new Error(`housing_benefit_arrangement for ${employeeId} must be ARMS_LENGTH_LEASE or EMPLOYER_OWNED_OR_NON_ARMS_LENGTH when housing_benefit_provided is true`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      const rentRecovered = requireNonNegativeMoney(employee.housing_benefit_rent_recovered_from_employee ?? 0, `housing_benefit_rent_recovered_from_employee for ${employeeId}`);
      let rawHousingValue: number;
      if (employee.housing_benefit_arrangement === 'ARMS_LENGTH_LEASE') {
        const rentPaid = requireNonNegativeMoney(employee.housing_benefit_rent_paid_by_employer, `housing_benefit_rent_paid_by_employer for ${employeeId}`);
        rawHousingValue = Math.max(money(p.housing_benefit.percent_of_gross * grossPay), rentPaid);
      } else {
        rawHousingValue = requireNonNegativeMoney(employee.housing_benefit_fair_market_rental_value, `housing_benefit_fair_market_rental_value for ${employeeId}`);
      }
      housingBenefit = Math.max(0, money(rawHousingValue - rentRecovered));
    }

    // --- Car benefit-in-kind validation (v2; see limitations) ---
    let carBenefit = 0;
    if (employee.car_benefit_provided) {
      if (employee.car_benefit_lease_or_hire_cost_monthly !== undefined) {
        carBenefit = requireNonNegativeMoney(employee.car_benefit_lease_or_hire_cost_monthly, `car_benefit_lease_or_hire_cost_monthly for ${employeeId}`);
      } else {
        const initialCost = requireNonNegativeMoney(employee.car_benefit_initial_cost, `car_benefit_initial_cost for ${employeeId} (or supply car_benefit_lease_or_hire_cost_monthly instead)`);
        const ccBand = employee.car_benefit_cc_band;
        if (!ccBand || !(ccBand in p.car_benefit.prescribed_monthly_by_cc_band)) {
          const error = new Error(`car_benefit_cc_band for ${employeeId} must be a valid engine-capacity band when car_benefit_initial_cost is supplied`);
          (error as Error & { status?: number }).status = 400;
          throw error;
        }
        const prescribedRate = p.car_benefit.prescribed_monthly_by_cc_band[ccBand];
        carBenefit = Math.max(money(p.car_benefit.owned_rate_of_cost_monthly * initialCost), prescribedRate);
      }
    }
    const benefitInKind = money(housingBenefit + carBenefit);

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
    const taxablePay = Math.max(0, money(grossPay + benefitInKind - employeeAhl - employeeShif - pensionDeductible - mortgageDeductible - medicalDeductible));
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
      housing_benefit: housingBenefit,
      car_benefit: carBenefit,
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
    housing_benefit: sum(employees.map(e => e.housing_benefit)),
    car_benefit: sum(employees.map(e => e.car_benefit)),
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

  // v2 test: housing benefit, arm's-length lease. Gross 45,000, rent paid
  // by employer 20,000 (> 15% of gross = 6,750, so rent paid wins).
  // taxablePay = 45000+20000-AHL(675)-SHIF(1237.5)-NSSF(2700)=60387.5 ->
  // bracket [32333,4483.25,0.30]: 4483.25+0.30*(60387.5-32333)=12899.6 ->
  // minus personal relief 2400 = 10499.6.
  const housingArmsLength = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{
      employee_id: 'H1', gross_pay: 45000, resident_status: 'RESIDENT',
      housing_benefit_provided: true, housing_benefit_arrangement: 'ARMS_LENGTH_LEASE',
      housing_benefit_rent_paid_by_employer: 20000
    }]
  });
  // v2 test: housing benefit, employer-owned/FMV path with rent recovered.
  // FMV 25,000 - rent recovered 5,000 = 20,000 (same value as above, for a
  // clean cross-check of the alternative code path).
  const housingOwned = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{
      employee_id: 'H2', gross_pay: 45000, resident_status: 'RESIDENT',
      housing_benefit_provided: true, housing_benefit_arrangement: 'EMPLOYER_OWNED_OR_NON_ARMS_LENGTH',
      housing_benefit_fair_market_rental_value: 25000, housing_benefit_rent_recovered_from_employee: 5000
    }]
  });
  // v2 test: car benefit, employer-owned. Initial cost 600,000 -> 2%/mo =
  // 12,000; prescribed rate for 1501-1750cc = 5,800. Higher (12,000) wins.
  const carOwned = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{
      employee_id: 'C1', gross_pay: 45000, resident_status: 'RESIDENT',
      car_benefit_provided: true, car_benefit_initial_cost: 600000, car_benefit_cc_band: 'CC_1501_TO_1750'
    }]
  });
  // v2 test: car benefit, third-party-leased -> the lease cost directly.
  const carLeased = calculateKePayroll({
    pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', pay_date: '2026-03-31',
    employees: [{
      employee_id: 'C2', gross_pay: 45000, resident_status: 'RESIDENT',
      car_benefit_provided: true, car_benefit_lease_or_hire_cost_monthly: 9000
    }]
  });

  const ok =
    jan.employees[0].employee_nssf === 4320 && jan.employees[0].employer_nssf === 4320 &&
    jan.employees[0].nssf_version === '2026_Y3_JAN' && jan.controls.journal_balanced &&
    jan.employees[0].housing_benefit === 0 && jan.employees[0].car_benefit === 0 &&
    feb.employees[0].employee_nssf === 6480 && feb.employees[0].employer_nssf === 6480 &&
    feb.employees[0].nssf_version === '2026_Y4_FROM_FEB' && feb.controls.journal_balanced &&
    midBand.employees[0].employee_nssf === 3000 && midBand.controls.journal_balanced &&
    shifMin.employees[0].employee_shif === 300 && shifMin.controls.journal_balanced &&
    ahl.employees[0].employee_ahl === 1500 && ahl.employees[0].employer_ahl === 1500 && ahl.controls.journal_balanced &&
    nitaRun.totals.employer_nita === 2500 && nitaRun.controls.journal_balanced &&
    housingArmsLength.employees[0].housing_benefit === 20000 && housingArmsLength.employees[0].paye === 10499.6 &&
    housingArmsLength.controls.journal_balanced &&
    housingOwned.employees[0].housing_benefit === 20000 && housingOwned.controls.journal_balanced &&
    carOwned.employees[0].car_benefit === 12000 && carOwned.controls.journal_balanced &&
    carLeased.employees[0].car_benefit === 9000 && carLeased.controls.journal_balanced;

  return { ok, jan, feb, midBand, shifMin, ahl, nitaRun, housingArmsLength, housingOwned, carOwned, carLeased };
}
