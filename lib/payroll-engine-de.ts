// Germany (DE) payroll rule pack.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current German payroll/tax expertise has checked:
//   1. the income-tax bracket coefficients against the current-year BMF
//      Programmablaufplan (PAP) / official Lohnsteuertabelle, and
//   2. the social-insurance rates and contribution ceilings against the
//      current-year Sozialversicherungs-Rechengrößenverordnung.
// These figures change most years (some, like the Grundfreibetrag and the
// contribution ceilings, every year). This file uses 2025 published values
// as the most recent figures available; they are NOT guaranteed correct for
// the year in which a real payroll run would execute.
//
// Scope is deliberately narrow, mirroring the Georgia rule pack's approach:
// unsupported cases are rejected with an explicit error rather than
// silently approximated.

export type DeEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  tax_class: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  church_tax_liable: boolean;
  childless_surcharge_applicable: boolean;
  ytd_gross_before: number;
};

export type DePayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: DeEmployeeInput[];
};

export type DeJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_SOCIAL_INSURANCE_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'INCOME_TAX_PAYABLE'
    | 'SOCIAL_INSURANCE_PAYABLE';
  amount: number;
};

export type DeEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  income_tax: number;
  employee_pension_insurance: number;
  employee_unemployment_insurance: number;
  employee_health_insurance: number;
  employee_care_insurance: number;
  employee_social_insurance_total: number;
  employer_pension_insurance: number;
  employer_unemployment_insurance: number;
  employer_health_insurance: number;
  employer_care_insurance: number;
  employer_social_insurance_total: number;
  net_pay: number;
  employer_funded_total: number;
  ytd_gross_after: number;
};

export type DePayrollRunResult = {
  rule_pack_id: string;
  country_code: 'DE';
  currency: 'EUR';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: DeEmployeeResult[];
  totals: {
    gross_pay: number;
    income_tax: number;
    employee_social_insurance: number;
    employer_social_insurance: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: DeJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_DE = {
  id: 'DE-2025-GRUNDTARIF-KLASSE-I-DRAFT-V1',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'EUR',
  // Income tax (Lohnsteuer), Grundtarif, no church tax, no solidarity surcharge.
  income_tax: {
    grundfreibetrag: 12096,
    // §32a EStG zone 2 (12,097–17,443)
    zone2_upper: 17443,
    zone2_a: 932.3,
    zone2_b: 1400,
    // §32a EStG zone 3 (17,444–68,480)
    zone3_upper: 68480,
    zone3_a: 176.64,
    zone3_b: 2397,
    zone3_c: 1015.13,
    // §32a EStG zone 4 (68,481–277,825)
    zone4_upper: 277825,
    zone4_rate: 0.42,
    zone4_subtract: 10911.92,
    // §32a EStG zone 5 (277,826+)
    zone5_rate: 0.45,
    zone5_subtract: 19246.67
  },
  social_insurance: {
    pension_rate_total: 0.186, // §168 SGB VI
    pension_ceiling_annual: 96600, // Beitragsbemessungsgrenze RV/ALV, 2025
    unemployment_rate_total: 0.026, // §341 SGB III
    health_general_rate_total: 0.146, // §241 SGB V
    health_avg_zusatzbeitrag_total: 0.025, // published 2025 average additional contribution rate
    health_ceiling_annual: 66150, // Beitragsbemessungsgrenze KV/PV, 2025
    care_rate_total: 0.036, // §55 SGB XI (standard, non-Sachsen)
    care_childless_surcharge_employee: 0.006 // §55(3) SGB XI, employees >23 without children
  },
  evidence: [
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Einkommensteuergesetz (EStG) §32a', url: 'https://www.gesetze-im-internet.de/estg/__32a.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch VI (SGB VI) §168', url: 'https://www.gesetze-im-internet.de/sgb_6/__168.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch III (SGB III) §341', url: 'https://www.gesetze-im-internet.de/sgb_3/__341.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch V (SGB V) §241', url: 'https://www.gesetze-im-internet.de/sgb_5/__241.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch XI (SGB XI) §55', url: 'https://www.gesetze-im-internet.de/sgb_11/__55.html' }
  ],
  limitations: [
    'Tax class I (single, no children, standard case) only. Tax classes II–VI are rejected, not approximated.',
    'Church tax (Kirchensteuer) is not calculated. Employees flagged church_tax_liable are rejected rather than under-withheld.',
    'Solidarity surcharge (Solidaritätszuschlag) is not calculated; this is a simplification, not a legal determination that none is owed.',
    'Uses a simplified annualize-and-divide approximation of Lohnsteuer (monthly gross × 12, minus this period’s employee social-insurance withholding, through the §32a Grundtarif formula, ÷ 12). This does not reproduce the official monthly Lohnsteuertabelle/ELStAM withholding procedure exactly and will diverge from it, particularly near bracket boundaries.',
    'Long-term care insurance uses the standard (non-Sachsen) employer/employee split. Sachsen’s different split is not implemented; Sachsen employees are rejected.',
    'The health-insurance additional contribution (Zusatzbeitrag) uses a published national average, not the employee’s actual fund rate.',
    'Figures are 2025 published values and must be reverified against the current-year BMF Programmablaufplan and Sozialversicherungs-Rechengrößenverordnung before this pack is marked VERIFIED_BASIC_RULES.',
    'This engine prepares payroll and accounting outputs only. It does not submit tax or social-insurance filings and does not initiate payments.'
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

function sum(values: number[]) {
  return money(values.reduce((total, value) => total + value, 0));
}

// Contribution up to an annual ceiling, given YTD-before and this period's gross.
function ceilingContribution(ytdBefore: number, grossPay: number, ceilingAnnual: number, rate: number) {
  const remainingRoom = Math.max(0, ceilingAnnual - ytdBefore);
  const contributable = Math.min(grossPay, remainingRoom);
  return money(contributable * rate);
}

// §32a EStG Grundtarif, annual tax on annual taxable income (zvE).
function annualIncomeTax(zve: number): number {
  const p = PAYROLL_RULE_PACK_DE.income_tax;
  if (zve <= p.grundfreibetrag) return 0;
  if (zve <= p.zone2_upper) {
    const y = (zve - p.grundfreibetrag) / 10000;
    return (p.zone2_a * y + p.zone2_b) * y;
  }
  if (zve <= p.zone3_upper) {
    const z = (zve - p.zone2_upper) / 10000;
    return (p.zone3_a * z + p.zone3_b) * z + p.zone3_c;
  }
  if (zve <= p.zone4_upper) {
    return p.zone4_rate * zve - p.zone4_subtract;
  }
  return p.zone5_rate * zve - p.zone5_subtract;
}

export function calculateGermanyPayroll(input: DePayrollRunInput): DePayrollRunResult {
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

  const sv = PAYROLL_RULE_PACK_DE.social_insurance;
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

    if (employee.tax_class !== 'I') {
      const error = new Error(`tax_class ${employee.tax_class} is not implemented for ${employeeId} (Steuerklasse I only)`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (employee.church_tax_liable) {
      const error = new Error(`church tax is not implemented; ${employeeId} is flagged church_tax_liable`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (typeof employee.childless_surcharge_applicable !== 'boolean') {
      const error = new Error(`childless_surcharge_applicable must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const ytdBefore = requireNonNegativeMoney(employee.ytd_gross_before, `ytd_gross_before for ${employeeId}`);

    const employeePension = ceilingContribution(ytdBefore, grossPay, sv.pension_ceiling_annual, sv.pension_rate_total / 2);
    const employerPension = employeePension;

    const employeeUnemployment = ceilingContribution(ytdBefore, grossPay, sv.pension_ceiling_annual, sv.unemployment_rate_total / 2);
    const employerUnemployment = employeeUnemployment;

    const healthRate = (sv.health_general_rate_total + sv.health_avg_zusatzbeitrag_total) / 2;
    const employeeHealth = ceilingContribution(ytdBefore, grossPay, sv.health_ceiling_annual, healthRate);
    const employerHealth = employeeHealth;

    const careRateHalf = sv.care_rate_total / 2;
    const employeeCareBase = ceilingContribution(ytdBefore, grossPay, sv.health_ceiling_annual, careRateHalf);
    const employeeCareSurcharge = employee.childless_surcharge_applicable
      ? ceilingContribution(ytdBefore, grossPay, sv.health_ceiling_annual, sv.care_childless_surcharge_employee)
      : 0;
    const employeeCare = money(employeeCareBase + employeeCareSurcharge);
    const employerCare = employeeCareBase;

    const employeeSocialTotal = money(employeePension + employeeUnemployment + employeeHealth + employeeCare);
    const employerSocialTotal = money(employerPension + employerUnemployment + employerHealth + employerCare);

    // Simplified Lohnsteuer approximation: annualize (gross - this period's
    // employee social insurance) x 12, apply the Grundtarif, divide by 12.
    const periodTaxableBase = Math.max(0, grossPay - employeeSocialTotal);
    const annualTaxableEstimate = money(periodTaxableBase * 12);
    const incomeTax = money(annualIncomeTax(annualTaxableEstimate) / 12);

    const netPay = money(grossPay - incomeTax - employeeSocialTotal);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      income_tax: incomeTax,
      employee_pension_insurance: employeePension,
      employee_unemployment_insurance: employeeUnemployment,
      employee_health_insurance: employeeHealth,
      employee_care_insurance: employeeCare,
      employee_social_insurance_total: employeeSocialTotal,
      employer_pension_insurance: employerPension,
      employer_unemployment_insurance: employerUnemployment,
      employer_health_insurance: employerHealth,
      employer_care_insurance: employerCare,
      employer_social_insurance_total: employerSocialTotal,
      net_pay: netPay,
      employer_funded_total: money(grossPay + employerSocialTotal),
      ytd_gross_after: money(ytdBefore + grossPay)
    };
  });

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    income_tax: sum(employees.map(e => e.income_tax)),
    employee_social_insurance: sum(employees.map(e => e.employee_social_insurance_total)),
    employer_social_insurance: sum(employees.map(e => e.employer_social_insurance_total)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: DeJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_SOCIAL_INSURANCE_EXPENSE', amount: totals.employer_social_insurance },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'INCOME_TAX_PAYABLE', amount: totals.income_tax },
    { side: 'CREDIT', account_role: 'SOCIAL_INSURANCE_PAYABLE', amount: money(totals.employee_social_insurance + totals.employer_social_insurance) }
  ].filter(line => line.amount !== 0) as DeJournalLine[];

  const journalDebits = sum(journal.filter(l => l.side === 'DEBIT').map(l => l.amount));
  const journalCredits = sum(journal.filter(l => l.side === 'CREDIT').map(l => l.amount));

  return {
    rule_pack_id: PAYROLL_RULE_PACK_DE.id,
    country_code: 'DE',
    currency: 'EUR',
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
    limitations: [...PAYROLL_RULE_PACK_DE.limitations]
  };
}

export function payrollEngineSelfTestDE() {
  // Single employee, gross €4,000/month, no prior YTD, childless surcharge
  // not applicable — a plain, well-inside-the-brackets case chosen so the
  // result can be sanity-checked by hand against the formula above.
  const sample = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E001', gross_pay: 4000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_gross_before: 28000 }
    ]
  });
  const e = sample.employees[0];

  const sv = PAYROLL_RULE_PACK_DE.social_insurance;
  const expectedPension = money(4000 * (sv.pension_rate_total / 2));
  const expectedUnemployment = money(4000 * (sv.unemployment_rate_total / 2));
  const expectedHealth = money(4000 * ((sv.health_general_rate_total + sv.health_avg_zusatzbeitrag_total) / 2));
  const expectedCare = money(4000 * (sv.care_rate_total / 2));
  const expectedSocialTotal = money(expectedPension + expectedUnemployment + expectedHealth + expectedCare);
  const expectedTaxableBase = money(4000 - expectedSocialTotal);
  const expectedAnnualTaxable = money(expectedTaxableBase * 12);
  const expectedIncomeTax = money(annualIncomeTax(expectedAnnualTaxable) / 12);
  const expectedNet = money(4000 - expectedIncomeTax - expectedSocialTotal);

  // Two ceiling cases, kept separate because the pension/unemployment
  // ceiling (€96,600) is higher than the health/care ceiling (€66,150), so
  // one YTD value can't sit "mid-crossing" on both at once.
  //
  // E002: YTD just under the pension/unemployment ceiling only — exercises
  // that ceiling being crossed mid-period, with health/care already fully
  // exceeded (so those should be 0 for this employee).
  const pensionCeilingCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E002', gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_gross_before: 93000 }
    ]
  });
  const c1 = pensionCeilingCase.employees[0];
  const expectedRoomToPensionCeiling = money(96600 - 93000); // 3,600
  const expectedCeilingPension = money(expectedRoomToPensionCeiling * (sv.pension_rate_total / 2));

  // E003: YTD just under the (lower) health/care ceiling — exercises that
  // ceiling being crossed mid-period, plus the childless care surcharge
  // being capped by the same ceiling.
  const healthCeilingCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E003', gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: true, ytd_gross_before: 60000 }
    ]
  });
  const c2 = healthCeilingCase.employees[0];
  const expectedRoomToHealthCeiling = money(66150 - 60000); // 6,150
  const expectedCeilingCare = money(
    expectedRoomToHealthCeiling * (sv.care_rate_total / 2) + expectedRoomToHealthCeiling * sv.care_childless_surcharge_employee
  );

  return {
    ok:
      e.employee_pension_insurance === expectedPension &&
      e.employee_unemployment_insurance === expectedUnemployment &&
      e.employee_health_insurance === expectedHealth &&
      e.employee_care_insurance === expectedCare &&
      e.employee_social_insurance_total === expectedSocialTotal &&
      e.income_tax === expectedIncomeTax &&
      e.net_pay === expectedNet &&
      sample.controls.journal_balanced &&
      c1.employee_pension_insurance === expectedCeilingPension &&
      c1.employer_pension_insurance === expectedCeilingPension &&
      c1.employee_health_insurance === 0 &&
      c1.employee_care_insurance === 0 &&
      pensionCeilingCase.controls.journal_balanced &&
      c2.employee_care_insurance === expectedCeilingCare &&
      c2.employee_care_insurance > money(expectedRoomToHealthCeiling * (sv.care_rate_total / 2)) && // surcharge applied
      healthCeilingCase.controls.journal_balanced,
    sample,
    pensionCeilingCase,
    healthCeilingCase
  };
}
