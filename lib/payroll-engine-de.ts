// Germany (DE) payroll rule pack — v2.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current German payroll/tax expertise has checked:
//   1. the income-tax bracket coefficients (§32a EStG) against the
//      current-year BMF Programmablaufplan (PAP) / official Lohnsteuertabelle,
//   2. the social-insurance rates and contribution ceilings against the
//      current-year Sozialversicherungs-Rechengrößenverordnung, and
//   3. the Solidaritätszuschlag Freigrenze against the current-year SolZG.
// These figures change most years. This file uses 2025 published values as
// the most recent available; they are NOT guaranteed correct for the year
// in which a real payroll run would execute.
//
// v2 change log (from v1, driven by real payslip review):
//   - taxable_gross_pay and sv_gross_pay are now separate inputs. A real
//     German payslip with employer-sponsored deferred compensation
//     (Direktversicherung, Pensionsfonds, Unterstützungskasse) commonly has
//     a Lohnsteuer-Brutto that differs from the SV-Brutto, because not every
//     such deduction reduces both bases the same way. Collapsing these into
//     one "gross_pay" (v1) was validated against a real payslip to produce
//     exact social-insurance figures when given the correct SV base, and
//     wrong ones when the tax base was used for SV instead — so this was a
//     real, not theoretical, gap.
//   - Solidaritätszuschlag is now calculated (§4 SolZG 1995: Freigrenze +
//     Milderungszone), previously not modeled at all.
//   - A one-time payment (Einmalzahlung / "sonstige Bezüge", e.g. an annual
//     bonus) can now be included and is taxed via the §39b(3) EStG
//     Differenzmethode (tax on annualized regular pay + the one-time
//     payment, minus tax on annualized regular pay alone), rather than
//     being unsupported.
//
// Still out of scope, deliberately (rejected, not approximated):
//   - Tax classes other than I.
//   - Church tax (Kirchensteuer) — an 8%/9% state-specific rate on top of
//     income tax, not a single national formula.
//   - Private/voluntary health insurance (PKV, or freiwillig gesetzlich
//     versichert above the Versicherungspflichtgrenze) — contribution is
//     set by the individual's insurance contract, not a statutory rate
//     table, so it cannot be computed from public sources the way the
//     standard-employee case can.
//   - Sachsen's different long-term-care-insurance employer/employee split.
//   - §34 EStG Fünftelregelung (an elective, narrower method for certain
//     severance/multi-year payments) — the Differenzmethode above covers
//     the common "annual bonus" case, not this.

export type DeEmployeeInput = {
  employee_id: string;
  name?: string;
  // Lohnsteuer-Brutto for this period's regular pay (after any pre-tax
  // deferred-compensation deductions). Usually equal to sv_gross_pay unless
  // the employee has employer-sponsored deferred compensation.
  taxable_gross_pay: number;
  // Sozialversicherungs-Brutto for this period's regular pay (after any
  // pre-SV deferred-compensation deductions).
  sv_gross_pay: number;
  // Optional one-time payment (Einmalzahlung / "sonstige Bezüge", e.g. an
  // annual bonus) for this period. Both the taxable and SV-relevant amount
  // are usually the same for a cash bonus; kept separate for consistency
  // with the regular-pay fields and in case of partial SV-freedom.
  one_time_payment_taxable?: number;
  one_time_payment_sv?: number;
  tax_class: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  church_tax_liable: boolean;
  childless_surcharge_applicable: boolean;
  // Year-to-date SV-relevant pay (regular + prior one-time payments) before
  // this period, used to apply the RV/ALV and KV/PV contribution ceilings.
  ytd_sv_gross_before: number;
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
    | 'SOLIDARITY_SURCHARGE_PAYABLE'
    | 'SOCIAL_INSURANCE_PAYABLE';
  amount: number;
};

export type DeEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number; // taxable_gross_pay + one_time_payment_taxable, for display/journal purposes
  income_tax: number; // regular + one-time-payment portions, combined
  solidarity_surcharge: number;
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
  ytd_sv_gross_after: number;
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
    solidarity_surcharge: number;
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
  id: 'DE-2025-GRUNDTARIF-KLASSE-I-DRAFT-V2',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'EUR',
  income_tax: {
    grundfreibetrag: 12096,
    zone2_upper: 17443,
    zone2_a: 932.3,
    zone2_b: 1400,
    zone3_upper: 68480,
    zone3_a: 176.64,
    zone3_b: 2397,
    zone3_c: 1015.13,
    zone4_upper: 277825,
    zone4_rate: 0.42,
    zone4_subtract: 10911.92,
    zone5_rate: 0.45,
    zone5_subtract: 19246.67
  },
  solidarity_surcharge: {
    rate: 0.055,
    milderungszone_rate: 0.119,
    // Monthly-equivalent Freigrenze for Steuerklasse I, 2025 published value.
    // NEEDS VERIFICATION against the current-year SolZG before production use.
    monthly_freigrenze: 1510.83
  },
  social_insurance: {
    pension_rate_total: 0.186,
    pension_ceiling_annual: 96600,
    unemployment_rate_total: 0.026,
    health_general_rate_total: 0.146,
    health_avg_zusatzbeitrag_total: 0.025,
    health_ceiling_annual: 66150,
    care_rate_total: 0.036,
    care_childless_surcharge_employee: 0.006
  },
  evidence: [
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Einkommensteuergesetz (EStG) §32a', url: 'https://www.gesetze-im-internet.de/estg/__32a.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Einkommensteuergesetz (EStG) §39b Abs. 3 (Besteuerung sonstiger Bezüge)', url: 'https://www.gesetze-im-internet.de/estg/__39b.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Solidaritätszuschlaggesetz 1995 (SolZG) §4', url: 'https://www.gesetze-im-internet.de/solzg_1995/__4.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch VI (SGB VI) §168', url: 'https://www.gesetze-im-internet.de/sgb_6/__168.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch III (SGB III) §341', url: 'https://www.gesetze-im-internet.de/sgb_3/__341.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch V (SGB V) §241', url: 'https://www.gesetze-im-internet.de/sgb_5/__241.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch XI (SGB XI) §55', url: 'https://www.gesetze-im-internet.de/sgb_11/__55.html' }
  ],
  limitations: [
    'Tax class I (single, no children, standard case) only. Tax classes II–VI are rejected, not approximated.',
    'Church tax (Kirchensteuer) is not calculated. Employees flagged church_tax_liable are rejected rather than under-withheld.',
    'Private health insurance (PKV) or voluntary statutory insurance above the Versicherungspflichtgrenze is not supported — the employer/employee contribution split is set by the individual insurance contract, not a public statutory rate, and cannot be computed from statute alone.',
    'Regular-pay income tax uses a simplified annualize-and-divide approximation of Lohnsteuer (this period’s taxable pay minus this period’s employee social-insurance withholding, annualized × 12, through the §32a Grundtarif formula, ÷ 12). This does not reproduce the official monthly Lohnsteuertabelle/ELStAM withholding procedure exactly.',
    'One-time payments (Einmalzahlung) are taxed via the §39b(3) EStG Differenzmethode (tax on annualized regular pay plus the payment, minus tax on annualized regular pay alone), using the same annualization approximation as above. This does not implement the elective §34 Fünftelregelung used for certain severance/multi-year payments.',
    'Solidaritätszuschlag applies the standard Freigrenze/Milderungszone formula to this period’s combined Lohnsteuer (regular + one-time payment). Real payroll software may compute the one-time-payment portion against a separately annualized Freigrenze; this can produce small differences.',
    'Long-term care insurance uses the standard (non-Sachsen) employer/employee split. Sachsen’s different split is not implemented; Sachsen employees are rejected.',
    'The health-insurance additional contribution (Zusatzbeitrag) uses a published national average, not the employee’s actual fund rate.',
    'Figures are 2025 published values and must be reverified against the current-year BMF Programmablaufplan, Sozialversicherungs-Rechengrößenverordnung and SolZG before this pack is marked VERIFIED_BASIC_RULES.',
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

function ceilingContribution(ytdBefore: number, amount: number, ceilingAnnual: number, rate: number) {
  const remainingRoom = Math.max(0, ceilingAnnual - ytdBefore);
  const contributable = Math.min(amount, remainingRoom);
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

// §4 SolZG 1995: Freigrenze below which no Soli is owed, then a
// Milderungszone (graduated 11.9% of the excess) until it reaches the flat
// 5.5% rate, after which the flat rate applies.
function solidaritySurcharge(periodIncomeTax: number): number {
  const s = PAYROLL_RULE_PACK_DE.solidarity_surcharge;
  if (periodIncomeTax <= s.monthly_freigrenze) return 0;
  const flat = periodIncomeTax * s.rate;
  const milderung = (periodIncomeTax - s.monthly_freigrenze) * s.milderungszone_rate;
  return money(Math.min(flat, milderung));
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

    const taxableGross = requireNonNegativeMoney(employee.taxable_gross_pay, `taxable_gross_pay for ${employeeId}`);
    const svGross = requireNonNegativeMoney(employee.sv_gross_pay, `sv_gross_pay for ${employeeId}`);
    const ezTaxable = requireNonNegativeMoney(employee.one_time_payment_taxable ?? 0, `one_time_payment_taxable for ${employeeId}`);
    const ezSv = requireNonNegativeMoney(employee.one_time_payment_sv ?? 0, `one_time_payment_sv for ${employeeId}`);
    const ytdSvBefore = requireNonNegativeMoney(employee.ytd_sv_gross_before, `ytd_sv_gross_before for ${employeeId}`);

    // Social insurance: regular pay first, then the one-time payment
    // continues against the same running ceiling (matches real payroll
    // practice of applying ceilings to cumulative annual SV pay).
    const pensionRegular = ceilingContribution(ytdSvBefore, svGross, sv.pension_ceiling_annual, sv.pension_rate_total / 2);
    const pensionEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.pension_ceiling_annual, sv.pension_rate_total / 2);
    const employeePension = money(pensionRegular + pensionEz);
    const employerPension = employeePension;

    const unemploymentRegular = ceilingContribution(ytdSvBefore, svGross, sv.pension_ceiling_annual, sv.unemployment_rate_total / 2);
    const unemploymentEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.pension_ceiling_annual, sv.unemployment_rate_total / 2);
    const employeeUnemployment = money(unemploymentRegular + unemploymentEz);
    const employerUnemployment = employeeUnemployment;

    const healthRate = (sv.health_general_rate_total + sv.health_avg_zusatzbeitrag_total) / 2;
    const healthRegular = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, healthRate);
    const healthEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, healthRate);
    const employeeHealth = money(healthRegular + healthEz);
    const employerHealth = employeeHealth;

    const careRateHalf = sv.care_rate_total / 2;
    const careRegularBase = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, careRateHalf);
    const careEzBase = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, careRateHalf);
    const careSurchargeRegular = employee.childless_surcharge_applicable
      ? ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, sv.care_childless_surcharge_employee)
      : 0;
    const careSurchargeEz = employee.childless_surcharge_applicable
      ? ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, sv.care_childless_surcharge_employee)
      : 0;
    const employeeCare = money(careRegularBase + careEzBase + careSurchargeRegular + careSurchargeEz);
    const employerCare = money(careRegularBase + careEzBase);

    const employeeSocialTotal = money(employeePension + employeeUnemployment + employeeHealth + employeeCare);
    const employerSocialTotal = money(employerPension + employerUnemployment + employerHealth + employerCare);

    // Regular-pay income tax: simplified annualize-and-divide.
    const regularEmployeeSv = money(pensionRegular + unemploymentRegular + healthRegular + careRegularBase + careSurchargeRegular);
    const regularTaxableBase = Math.max(0, taxableGross - regularEmployeeSv);
    const annualRegularEstimate = money(regularTaxableBase * 12);
    const regularIncomeTax = money(annualIncomeTax(annualRegularEstimate) / 12);

    // One-time-payment income tax: §39b(3) EStG Differenzmethode.
    let ezIncomeTax = 0;
    if (ezTaxable > 0) {
      const ezEmployeeSv = money(pensionEz + unemploymentEz + healthEz + careEzBase + careSurchargeEz);
      const ezTaxableBase = Math.max(0, ezTaxable - ezEmployeeSv);
      const annualWithEz = money(annualRegularEstimate + ezTaxableBase);
      ezIncomeTax = money(annualIncomeTax(annualWithEz) - annualIncomeTax(annualRegularEstimate));
    }

    const incomeTax = money(regularIncomeTax + ezIncomeTax);
    const solidarityTax = solidaritySurcharge(incomeTax);

    const grossPay = money(taxableGross + ezTaxable);
    const netPay = money(grossPay - incomeTax - solidarityTax - employeeSocialTotal);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      income_tax: incomeTax,
      solidarity_surcharge: solidarityTax,
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
      ytd_sv_gross_after: money(ytdSvBefore + svGross + ezSv)
    };
  });

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    income_tax: sum(employees.map(e => e.income_tax)),
    solidarity_surcharge: sum(employees.map(e => e.solidarity_surcharge)),
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
    { side: 'CREDIT', account_role: 'SOLIDARITY_SURCHARGE_PAYABLE', amount: totals.solidarity_surcharge },
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
  const sv = PAYROLL_RULE_PACK_DE.social_insurance;

  // Case 1: plain regular-only month, well inside the brackets.
  const sample = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E001', taxable_gross_pay: 4000, sv_gross_pay: 4000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 28000 }
    ]
  });
  const e = sample.employees[0];
  const expectedPension = money(4000 * (sv.pension_rate_total / 2));
  const expectedUnemployment = money(4000 * (sv.unemployment_rate_total / 2));
  const expectedHealth = money(4000 * ((sv.health_general_rate_total + sv.health_avg_zusatzbeitrag_total) / 2));
  const expectedCare = money(4000 * (sv.care_rate_total / 2));
  const expectedSocialTotal = money(expectedPension + expectedUnemployment + expectedHealth + expectedCare);
  const expectedTaxableBase = money(4000 - expectedSocialTotal);
  const expectedAnnualTaxable = money(expectedTaxableBase * 12);
  const expectedIncomeTax = money(annualIncomeTax(expectedAnnualTaxable) / 12);
  const expectedSoli = solidaritySurcharge(expectedIncomeTax);
  const expectedNet = money(4000 - expectedIncomeTax - expectedSoli - expectedSocialTotal);

  // Case 2: dual-basis regression — the real-payslip finding. Taxable base
  // and SV base deliberately differ (as with employer-sponsored deferred
  // compensation); social insurance must key off sv_gross_pay only.
  const dualBasisCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E002', taxable_gross_pay: 6138.11, sv_gross_pay: 6946.11, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 0 }
    ]
  });
  const d = dualBasisCase.employees[0];
  const expectedDualPension = money(6946.11 * (sv.pension_rate_total / 2));
  const expectedDualUnemployment = money(6946.11 * (sv.unemployment_rate_total / 2));

  // Case 3: pension/unemployment ceiling crossed mid-period.
  const pensionCeilingCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E003', taxable_gross_pay: 9000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 93000 }
    ]
  });
  const c1 = pensionCeilingCase.employees[0];
  const expectedRoomToPensionCeiling = money(96600 - 93000);
  const expectedCeilingPension = money(expectedRoomToPensionCeiling * (sv.pension_rate_total / 2));

  // Case 4: health/care ceiling crossed mid-period, plus childless surcharge.
  const healthCeilingCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E004', taxable_gross_pay: 9000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: true, ytd_sv_gross_before: 60000 }
    ]
  });
  const c2 = healthCeilingCase.employees[0];
  const expectedRoomToHealthCeiling = money(66150 - 60000);
  const expectedCeilingCare = money(
    expectedRoomToHealthCeiling * (sv.care_rate_total / 2) + expectedRoomToHealthCeiling * sv.care_childless_surcharge_employee
  );

  // Case 5: Solidaritätszuschlag threshold behavior — a low earner below
  // the Freigrenze owes none; a high earner above it owes the flat 5.5%.
  const belowFreigrenze = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E005', taxable_gross_pay: 3000, sv_gross_pay: 3000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 0 }
    ]
  });
  const highEarner = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E006', taxable_gross_pay: 15000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 200000 }
    ]
  });
  const highEarnerResult = highEarner.employees[0];

  // Case 6: one-time payment (Differenzmethode) — the tax on the bonus
  // alone should be a strictly higher marginal rate than the regular tax
  // on an equivalent amount of regular pay, since it stacks on top.
  const bonusCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E007', taxable_gross_pay: 4000, sv_gross_pay: 4000, one_time_payment_taxable: 10000, one_time_payment_sv: 10000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 20000 }
    ]
  });
  const b = bonusCase.employees[0];
  const bonusRegularOnly = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E007b', taxable_gross_pay: 4000, sv_gross_pay: 4000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 20000 }
    ]
  });
  const bRegularOnly = bonusRegularOnly.employees[0];

  return {
    ok:
      e.employee_pension_insurance === expectedPension &&
      e.employee_unemployment_insurance === expectedUnemployment &&
      e.employee_health_insurance === expectedHealth &&
      e.employee_care_insurance === expectedCare &&
      e.employee_social_insurance_total === expectedSocialTotal &&
      e.income_tax === expectedIncomeTax &&
      e.solidarity_surcharge === expectedSoli &&
      e.net_pay === expectedNet &&
      sample.controls.journal_balanced &&
      // dual-basis: SV keyed off sv_gross_pay (6,946.11), not taxable_gross_pay
      d.employee_pension_insurance === expectedDualPension &&
      d.employee_unemployment_insurance === expectedDualUnemployment &&
      dualBasisCase.controls.journal_balanced &&
      c1.employee_pension_insurance === expectedCeilingPension &&
      c1.employer_pension_insurance === expectedCeilingPension &&
      c1.employee_health_insurance === 0 &&
      c1.employee_care_insurance === 0 &&
      pensionCeilingCase.controls.journal_balanced &&
      c2.employee_care_insurance === expectedCeilingCare &&
      c2.employee_care_insurance > money(expectedRoomToHealthCeiling * (sv.care_rate_total / 2)) &&
      healthCeilingCase.controls.journal_balanced &&
      belowFreigrenze.employees[0].solidarity_surcharge === 0 &&
      highEarnerResult.solidarity_surcharge === money(highEarnerResult.income_tax * 0.055) &&
      belowFreigrenze.controls.journal_balanced &&
      highEarner.controls.journal_balanced &&
      // the bonus should be taxed at a rate at least as high as regular pay's
      // marginal rate, and the total run's tax should exceed the sum of the
      // two components taxed independently at the regular-pay rate
      b.income_tax > bRegularOnly.income_tax &&
      (b.income_tax - bRegularOnly.income_tax) > money(10000 * 0.14) && // sanity floor: bonus taxed above the lowest marginal bracket
      bonusCase.controls.journal_balanced,
    sample,
    dualBasisCase,
    pensionCeilingCase,
    healthCeilingCase,
    belowFreigrenze,
    highEarner,
    bonusCase
  };
}
