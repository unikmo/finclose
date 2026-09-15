// Cameroon (CM) payroll rule pack — v1, 2026 General Tax Code.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Cameroonian payroll/tax expertise has checked this against the
// DGI's current operative statutes (NOT the DGI's own stale indicative
// IRPP table, which the source explicitly warns still shows the obsolete
// 2.8%/300,000 CNPS parameters this engine correctly does NOT use).
//
// Sourced from a user-supplied "Cameroon 2026 Payroll Implementation
// Reference" (verified to 14 Sep 2026, citing the DGI General Tax Code and
// CNPS decree as primary authorities) — a genuine parameter reference with
// real rates/tables/caps attributed to named statute articles, explicitly
// flagging a real gap between the DGI's own indicative table and current
// operative law. Not independently re-fetched from impots.cm/cnps.cm
// directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - IRPP uses the source's own recommended "annualised statutory method"
//     for stable monthly salaries: annualize current gross pay, apply the
//     annual deductions/allowance/bands, divide by 12. This is NOT the
//     obsolete DGI lookup table (which this pack correctly avoids), but it
//     is also not a true cumulative YTD-aware routine — the professional-
//     expense annual cap (4,800,000 FCFA) and the 500,000 annual salary
//     allowance are applied on the ANNUALIZED figure each period, not
//     tracked as real YTD running totals across actual periods. A payroll
//     with genuinely irregular period-to-period pay will not correctly
//     enforce the true annual caps this way.
//   - Article 65 bis (exceptional/delayed income smoothing) is NOT
//     implemented — any bonus, retroactive, or non-ordinary payment run
//     through this engine as ordinary gross pay will be taxed WRONG. This
//     engine has no exceptional-income path.
//   - Taxable benefits in kind (housing 15%, vehicle 10%, food 10%, etc.)
//     are NOT computed — gross_pay is assumed to be cash remuneration
//     only. The employer/CNPS-risk profile (sector_regime, cnps_risk_group,
//     employer_cfc_fne_exempt) is caller-supplied per employee for v1,
//     not modeled as a separate employer-level entity.
//   - CFC/FNE salary-distribution base and TDL basic-salary base both
//     default to gross_pay when a separate basic_salary is not supplied —
//     the real system may define "salary-distribution base" and "basic
//     salary" differently from total gross cash pay.
//   - NOT IMPLEMENTED AT ALL in v1, rejected outright: benefits-in-kind
//     valuation, Article 31 exemption classification, CNPS professional-
//     expense exclusions (travel/milk/bicycle/representation/meal/
//     transport/dirty-work/tool/safety allowances — all treated as
//     ordinary contributable remuneration for v1), the SMIG contribution
//     floor, and all statutory filing (DGI monthly remittance, CNPS
//     teledeclaration, CFC/FNE, CRTV reporting). This engine prepares
//     payroll and accounting outputs only — it does not file with the DGI
//     or CNPS.

export type CmSectorRegime = 'GENERAL_OR_DOMESTIC' | 'AGRICULTURE' | 'PRIVATE_EDUCATION';
export type CmRiskGroup = 'A' | 'B' | 'C';

export type CmEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  sector_regime: CmSectorRegime;
  cnps_risk_group: CmRiskGroup;
  employer_cfc_fne_exempt: boolean;
  // Optional separate bases; default to gross_pay when omitted.
  cnps_contributable_base?: number;
  basic_salary?: number;
  crtv_exempt: boolean;
  // Benefit-in-kind flags, v2. All optional/default false — omitting all
  // four leaves IRPP computed on gross_pay alone, unchanged from v1. Per
  // the source document's own stated percentages of gross taxable salary:
  // housing 15%, vehicle 10%, food 10%, telephone 5%. Affects the IRPP
  // taxable base ONLY — CNPS/CFC/FNE/TDL/CRTV stay on their existing cash
  // bases, since the source did not specify a BIK treatment for those.
  housing_benefit?: boolean;
  vehicle_benefit?: boolean;
  food_benefit?: boolean;
  telephone_benefit?: boolean;
};

export type CmPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: CmEmployeeInput[];
};

export type CmJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_CNPS_CFC_FNE_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'IRPP_PAYABLE'
    | 'CAC_PAYABLE'
    | 'CNPS_PENSION_PAYABLE'
    | 'CNPS_FAMILY_ALLOWANCE_PAYABLE'
    | 'CNPS_OCCUPATIONAL_RISK_PAYABLE'
    | 'CFC_PAYABLE'
    | 'FNE_PAYABLE'
    | 'TDL_PAYABLE'
    | 'CRTV_PAYABLE';
  amount: number;
};

export type CmEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  benefit_in_kind: number;
  irpp: number;
  cac: number;
  employee_cnps_pension: number;
  employer_cnps_pension: number;
  employer_cnps_family_allowance: number;
  employer_cnps_occupational_risk: number;
  employee_cfc: number;
  employer_cfc: number;
  employer_fne: number;
  tdl: number;
  crtv: number;
  net_pay: number;
  employer_funded_total: number;
};

export type CmPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'CM';
  currency: 'XAF';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: CmEmployeeResult[];
  totals: {
    gross_pay: number;
    benefit_in_kind: number;
    irpp: number;
    cac: number;
    employee_cnps_pension: number;
    employer_cnps_pension: number;
    employer_cnps_family_allowance: number;
    employer_cnps_occupational_risk: number;
    employee_cfc: number;
    employer_cfc: number;
    employer_fne: number;
    tdl: number;
    crtv: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: CmJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_CM = {
  // v2: adds housing (15%)/vehicle (10%)/food (10%)/telephone (5%)
  // benefit-in-kind additions to the IRPP taxable base, per the source
  // document's own stated percentages (already cited in the v1
  // limitations, just not implemented until now).
  id: 'CM-2026-IRPP-CNPS-CFC-FNE-TDL-CRTV-BIK-DRAFT-V2',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'XAF',
  irpp: {
    brackets: [[0, 0, 0.10], [2000000, 200000, 0.15], [3000000, 350000, 0.25], [5000000, 850000, 0.35]] as Array<[number, number, number]>,
    low_wage_threshold_monthly: 62000, // dispensed from IRPP below this
    professional_deduction_rate: 0.30,
    professional_deduction_annual_cap: 4800000,
    annual_salary_allowance: 500000,
    cac_rate_of_irpp: 0.10
  },
  cnps: {
    pension_rate: 0.042, // employee and employer each
    pension_monthly_cap: 750000,
    family_allowance_rate: { GENERAL_OR_DOMESTIC: 0.070, AGRICULTURE: 0.0565, PRIVATE_EDUCATION: 0.0370 } as Record<CmSectorRegime, number>,
    family_allowance_monthly_cap: 750000,
    occupational_risk_rate: { A: 0.0175, B: 0.0250, C: 0.0500 } as Record<CmRiskGroup, number> // uncapped
  },
  cfc: { employee_rate: 0.01, employer_rate: 0.015 }, // salary-distribution base, rounded down to lower 1,000
  fne: { employer_rate: 0.01 },
  tdl: {
    // [atLeast basic monthly salary, monthly deduction]
    table: [[0, 0], [62000, 250], [75001, 500], [100001, 750], [125001, 1000], [150001, 1250], [200001, 1500], [250001, 2000], [300001, 2250], [500001, 2500]] as Array<[number, number]>
  },
  crtv: {
    // [atLeast gross monthly salary, monthly fee]
    table: [[0, 0], [50001, 750], [100001, 1950], [200001, 3250], [300001, 4550], [400001, 5850], [500001, 7150], [600001, 8450], [700001, 9750], [800001, 11050], [900001, 12350], [1000001, 13000]] as Array<[number, number]>
  },
  evidence: [
    { authority: 'Cameroon DGI (Direction Générale des Impôts)', instrument: 'General Tax Code, updated 1 Jan 2026 — IRPP Articles 24-34 (500,000 annual allowance, 30%/4,800,000 professional deduction, mandatory retirement contribution deduction), Article 69 (progressive rates), CAC Articles C82-C83, TDL Articles C86-C88', url: 'https://www.impots.cm/sites/default/files/documents/CODE%20GENERAL%20DES%20IMPOTS%202026%20%20VERSION%20FRANCAISE.pdf' },
    { authority: 'CNPS (Caisse Nationale de Prévoyance Sociale)', instrument: 'Contribution rate decree — PVID (pension) 4.2% employee + 4.2% employer, 750,000 FCFA/month cap; family allowance and occupational risk branch rates by regime/risk group', url: 'https://www.cnps.cm/images/documentutile/decret%20fixant%20taux%20de%20cotisations%20sociales%20et%20plafonds%20des%20rmunrations_baremes.pdf' },
    { authority: 'Cameroon DGI', instrument: 'TDL (Local Development Tax) indicative table — boundary verification', url: 'https://www.impots.cm/sites/default/files/documents/BAREME%20TDL_DSSI%20final.pdf' },
    { authority: 'User-supplied reference', instrument: '"Cameroon 2026 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from, including its own explicit warning that the DGI\'s indicative IRPP table is stale (2.8%/300,000 CNPS parameters) versus the current 4.2%/750,000 operative law this pack uses. Not independently re-fetched from impots.cm/cnps.cm directly this pass.', url: 'file: Cameroon_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only. IRPP uses the source\'s own recommended "annualised statutory method" (annualize current gross pay, apply annual deductions/allowance/bands, divide by 12) rather than the obsolete DGI lookup table — but this is still NOT a true cumulative YTD-aware routine. The professional-expense annual cap (4,800,000 FCFA) and the 500,000 annual salary allowance are recomputed fresh each period from the annualized figure, not tracked as real running YTD totals — a genuinely irregular-pay employee will not have the true annual caps correctly enforced.',
    'Article 65 bis (exceptional/delayed income smoothing) is NOT implemented at all. Any bonus, retroactive payment, or other non-ordinary-salary amount run through this engine as ordinary gross pay will be taxed WRONG — this engine has no exceptional-income path and must not be used for such payments.',
    'Taxable benefits in kind, v2: computed ONLY when the caller sets housing_benefit / vehicle_benefit / food_benefit / telephone_benefit to true, adding 15% / 10% / 10% / 5% of gross_pay respectively to the IRPP taxable base only, per the source\'s own stated percentages. CNPS/CFC/FNE/TDL/CRTV stay on their existing cash bases — the source did not specify a BIK treatment for those, and this engine does not guess. All four flags default to false/omitted, exactly matching v1 behavior for every existing caller. Other benefit types the source did not enumerate a percentage for are still not modeled.',
    'CNPS professional-expense exclusions (travel, milk, bicycle/moped, representation, meal/basket, transport, dirty-work, tool, and safety-promoter allowances, all specifically deductible from the CNPS contribution base per the source) are NOT modeled — the full cnps_contributable_base (default: gross_pay) is treated as fully contributable.',
    'CFC/FNE "salary-distribution base" and TDL "basic salary" both default to gross_pay when a separate basic_salary is not supplied. The real system may define these bases differently from total gross cash pay.',
    'NOT IMPLEMENTED AT ALL in v1, rejected outright: Article 31 IRPP exemption classification (family-character allowances, workplace-accident compensation, scholarships, etc.), the SMIG (minimum wage) CNPS contribution floor, and all statutory filing (DGI monthly IRPP/CAC/TDL remittance, CNPS teledeclaration, CFC/FNE/CRTV reporting). This engine prepares payroll and accounting outputs only — it does not file with the DGI or CNPS.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing the DGI General Tax Code and CNPS decree), not independently re-fetched from impots.cm/cnps.cm directly this pass. Per the source\'s own pre-production acceptance gate, this pack must be validated with a Cameroon payroll/tax professional or DGI-confirmed current calculation examples — specifically ordinary monthly withholding after the 4.2%/750,000 CNPS change, the 4,800,000 annual professional-expense cap, and exceptional income — before being marked VERIFIED_BASIC_RULES.'
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

function stepLookup(amount: number, rows: Array<[number, number]>) {
  let value = rows[0][1];
  for (const [atLeast, rowValue] of rows) {
    if (amount >= atLeast) value = rowValue;
    else break;
  }
  return value;
}

export function calculateCmPayroll(input: CmPayrollRunInput): CmPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_CM;
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

    if (!['GENERAL_OR_DOMESTIC', 'AGRICULTURE', 'PRIVATE_EDUCATION'].includes(employee.sector_regime)) {
      const error = new Error(`sector_regime for ${employeeId} must be GENERAL_OR_DOMESTIC, AGRICULTURE, or PRIVATE_EDUCATION`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.cnps_risk_group !== 'A' && employee.cnps_risk_group !== 'B' && employee.cnps_risk_group !== 'C') {
      const error = new Error(`cnps_risk_group for ${employeeId} must be A, B, or C`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.employer_cfc_fne_exempt !== 'boolean') {
      const error = new Error(`employer_cfc_fne_exempt must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.crtv_exempt !== 'boolean') {
      const error = new Error(`crtv_exempt must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const cnpsBase = requireNonNegativeMoney(employee.cnps_contributable_base ?? grossPay, `cnps_contributable_base for ${employeeId}`);
    const basicSalary = requireNonNegativeMoney(employee.basic_salary ?? grossPay, `basic_salary for ${employeeId}`);

    // --- CNPS pension (PVID) ---
    const pensionBase = Math.min(cnpsBase, p.cnps.pension_monthly_cap);
    const employeeCnpsPension = money(pensionBase * p.cnps.pension_rate);
    const employerCnpsPension = employeeCnpsPension;

    // --- CNPS family allowances (employer-only, capped) ---
    const familyBase = Math.min(cnpsBase, p.cnps.family_allowance_monthly_cap);
    const employerFamilyAllowance = money(familyBase * p.cnps.family_allowance_rate[employee.sector_regime]);

    // --- CNPS occupational risk (employer-only, uncapped) ---
    const employerOccupationalRisk = money(cnpsBase * p.cnps.occupational_risk_rate[employee.cnps_risk_group]);

    // --- Benefit in kind (v2; IRPP base only — see limitations) ---
    const benefitInKind = money(
      (employee.housing_benefit ? 0.15 : 0) * grossPay +
      (employee.vehicle_benefit ? 0.10 : 0) * grossPay +
      (employee.food_benefit ? 0.10 : 0) * grossPay +
      (employee.telephone_benefit ? 0.05 : 0) * grossPay
    );
    const irppTaxableGrossPay = money(grossPay + benefitInKind);

    // --- IRPP (annualized statutory method; see limitations) ---
    let irpp = 0;
    if (irppTaxableGrossPay >= p.irpp.low_wage_threshold_monthly) {
      const annualGrossTaxable = money(irppTaxableGrossPay * 12);
      const professionalDeductionAnnual = Math.min(money(annualGrossTaxable * p.irpp.professional_deduction_rate), p.irpp.professional_deduction_annual_cap);
      const employeeCnpsPensionAnnual = money(employeeCnpsPension * 12);
      const netSalaryCategoryAnnual = money(annualGrossTaxable - professionalDeductionAnnual - employeeCnpsPensionAnnual);
      const annualTaxableSalary = Math.max(0, money(netSalaryCategoryAnnual - p.irpp.annual_salary_allowance));
      const irppAnnual = bracketLookup(annualTaxableSalary, p.irpp.brackets);
      irpp = money(irppAnnual / 12);
    }
    const cac = money(irpp * p.irpp.cac_rate_of_irpp);

    // --- CFC / FNE (salary-distribution base rounded down to lower 1,000) ---
    const roundedBase = Math.floor(basicSalary / 1000) * 1000;
    const employeeCfc = money(roundedBase * p.cfc.employee_rate);
    const employerCfc = employee.employer_cfc_fne_exempt ? 0 : money(roundedBase * p.cfc.employer_rate);
    const employerFne = employee.employer_cfc_fne_exempt ? 0 : money(roundedBase * p.fne.employer_rate);

    // --- TDL (based on basic salary) ---
    const tdl = stepLookup(basicSalary, p.tdl.table);

    // --- CRTV (based on gross salary) ---
    const crtv = employee.crtv_exempt ? 0 : stepLookup(grossPay, p.crtv.table);

    const netPay = money(grossPay - irpp - cac - employeeCnpsPension - employeeCfc - tdl - crtv);
    const employerFundedTotal = money(grossPay + employerCnpsPension + employerFamilyAllowance + employerOccupationalRisk + employerCfc + employerFne);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      benefit_in_kind: benefitInKind,
      irpp,
      cac,
      employee_cnps_pension: employeeCnpsPension,
      employer_cnps_pension: employerCnpsPension,
      employer_cnps_family_allowance: employerFamilyAllowance,
      employer_cnps_occupational_risk: employerOccupationalRisk,
      employee_cfc: employeeCfc,
      employer_cfc: employerCfc,
      employer_fne: employerFne,
      tdl,
      crtv,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    benefit_in_kind: sum(employees.map(e => e.benefit_in_kind)),
    irpp: sum(employees.map(e => e.irpp)),
    cac: sum(employees.map(e => e.cac)),
    employee_cnps_pension: sum(employees.map(e => e.employee_cnps_pension)),
    employer_cnps_pension: sum(employees.map(e => e.employer_cnps_pension)),
    employer_cnps_family_allowance: sum(employees.map(e => e.employer_cnps_family_allowance)),
    employer_cnps_occupational_risk: sum(employees.map(e => e.employer_cnps_occupational_risk)),
    employee_cfc: sum(employees.map(e => e.employee_cfc)),
    employer_cfc: sum(employees.map(e => e.employer_cfc)),
    employer_fne: sum(employees.map(e => e.employer_fne)),
    tdl: sum(employees.map(e => e.tdl)),
    crtv: sum(employees.map(e => e.crtv)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: CmJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_CNPS_CFC_FNE_EXPENSE', amount: money(totals.employer_cnps_pension + totals.employer_cnps_family_allowance + totals.employer_cnps_occupational_risk + totals.employer_cfc + totals.employer_fne) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'IRPP_PAYABLE', amount: totals.irpp },
    { side: 'CREDIT', account_role: 'CAC_PAYABLE', amount: totals.cac },
    { side: 'CREDIT', account_role: 'CNPS_PENSION_PAYABLE', amount: money(totals.employee_cnps_pension + totals.employer_cnps_pension) },
    { side: 'CREDIT', account_role: 'CNPS_FAMILY_ALLOWANCE_PAYABLE', amount: totals.employer_cnps_family_allowance },
    { side: 'CREDIT', account_role: 'CNPS_OCCUPATIONAL_RISK_PAYABLE', amount: totals.employer_cnps_occupational_risk },
    { side: 'CREDIT', account_role: 'CFC_PAYABLE', amount: money(totals.employee_cfc + totals.employer_cfc) },
    { side: 'CREDIT', account_role: 'FNE_PAYABLE', amount: totals.employer_fne },
    { side: 'CREDIT', account_role: 'TDL_PAYABLE', amount: totals.tdl },
    { side: 'CREDIT', account_role: 'CRTV_PAYABLE', amount: totals.crtv }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'CM',
    currency: 'XAF',
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

export function payrollEngineSelfTestCM() {
  // Full worked example, hand-verified: gross 1,000,000 FCFA/month, general
  // regime, risk group A, not exempt.
  // Pension base = min(1,000,000, 750,000) = 750,000.
  // employeeCnpsPension = 750,000 * 4.2% = 31,500 (matches the source's own
  // stated "maximum regular monthly employee deduction 31,500").
  // annualGrossTaxable = 12,000,000. professionalDeduction =
  // min(3,600,000, 4,800,000) = 3,600,000. employeeCnpsPensionAnnual =
  // 31,500*12 = 378,000. netSalaryCategoryAnnual = 12,000,000-3,600,000-
  // 378,000 = 8,022,000. annualTaxableSalary = 8,022,000-500,000=7,522,000.
  // IRPP annual = 850,000+(7,522,000-5,000,000)*0.35 = 850,000+882,700
  // = 1,732,700. IRPP monthly = 1,732,700/12 = 144,391.67.
  // CAC = 10% * 144,391.67 = 14,439.17.
  // CFC/FNE base (basic=gross=1,000,000, already a multiple of 1,000).
  // employeeCfc=1%*1,000,000=10,000. employerCfc=1.5%*1,000,000=15,000.
  // employerFne=1%*1,000,000=10,000.
  // TDL (basic 1,000,000, "Above 500,000" row) = 2,500.
  // CRTV (gross 1,000,000, "900,001-1,000,000" row) = 12,350.
  // Family allowance (general, capped base 750,000) = 750,000*7%=52,500.
  // Occupational risk A (uncapped, full gross) = 1,000,000*1.75%=17,500.
  const r1 = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'W1', gross_pay: 1000000, sector_regime: 'GENERAL_OR_DOMESTIC',
      cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false
    }]
  });
  const e1 = r1.employees[0];

  // Golden test: IRPP below threshold. Gross 61,999 -> IRPP must be zero.
  const belowThreshold = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'B1', gross_pay: 61999, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false }]
  });

  // Golden test: CFC rounding. 99,999 -> floor to 99,000; 100,000 -> 100,000; 100,001 -> 100,000.
  const cfc99999 = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'F1', gross_pay: 99999, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: 99999 }]
  });
  const cfc100001 = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'F2', gross_pay: 100001, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: 100001 }]
  });

  // Golden test: employer CFC/FNE exemption suppresses employer share only.
  const exempt = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'X1', gross_pay: 1000000, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: true, crtv_exempt: false }]
  });

  // v2 test: housing benefit pushes a below-threshold employee over the
  // IRPP dispensation line, and correctly enters the IRPP base. Gross
  // 60,000 (alone, below the 62,000 threshold) + 15% housing BIK (9,000)
  // -> taxable 69,000, above threshold. CNPS pension stays on cash
  // gross_pay only (60,000): 60,000*4.2%=2,520 (unaffected by BIK).
  // annualGrossTaxable=828,000; professionalDeduction=min(248,400,4.8M)=
  // 248,400; CNPS annual=30,240; netSalaryCategoryAnnual=549,360;
  // annualTaxableSalary=49,360 (10% bracket) -> annual IRPP=4,936 ->
  // monthly=411.33. CAC=41.13.
  const housingBik = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'H1', gross_pay: 60000, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, housing_benefit: true }]
  });
  const eHousing = housingBik.employees[0];

  const ok =
    e1.employee_cnps_pension === 31500 && e1.employer_cnps_pension === 31500 &&
    e1.irpp === 144391.67 && e1.cac === 14439.17 &&
    e1.employee_cfc === 10000 && e1.employer_cfc === 15000 && e1.employer_fne === 10000 &&
    e1.tdl === 2500 && e1.crtv === 12350 &&
    e1.employer_cnps_family_allowance === 52500 && e1.employer_cnps_occupational_risk === 17500 &&
    r1.controls.journal_balanced &&
    belowThreshold.employees[0].irpp === 0 && belowThreshold.controls.journal_balanced &&
    cfc99999.employees[0].employee_cfc === 990 && cfc100001.employees[0].employee_cfc === 1000 &&
    exempt.employees[0].employer_cfc === 0 && exempt.employees[0].employer_fne === 0 && exempt.employees[0].employee_cfc === 10000 &&
    exempt.controls.journal_balanced &&
    eHousing.benefit_in_kind === 9000 && eHousing.irpp === 411.33 && eHousing.cac === 41.13 &&
    eHousing.employee_cnps_pension === 2520 && housingBik.controls.journal_balanced;

  return { ok, r1, belowThreshold, cfc99999, cfc100001, exempt, housingBik };
}
