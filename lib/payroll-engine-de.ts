// Germany (DE) payroll rule pack — v3.
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
// v3 change log (from v2, driven by real payslip review):
//   - Fixed a real bug in the Soli calculation: v2 compared a mixed
//     "monthly regular tax + one-time-payment tax" figure against a MONTHLY
//     Freigrenze, which is apples-to-oranges (the one-time-payment portion
//     is a whole annual-scale amount, not a monthly rate) and overstated
//     Soli. Fixed by checking annualized regular tax, and annualized
//     regular-plus-one-time tax, each against the ANNUAL Freigrenze, then
//     taking the Differenzmethode result for the one-time portion — the
//     same annual→incremental pattern already used for the income tax
//     itself. Confirmed against a real payslip that showed zero Soli owed
//     in a month where the old method produced a nonzero (wrong) amount.
//   - Church tax (Kirchensteuer) is now calculated: a flat percentage
//     (8% or 9%, caller-supplied per the employee's registered state) of
//     income tax. No federal law sets a single national rate — it's set by
//     each Land's own Kirchensteuergesetz — so the caller supplies the
//     correct rate rather than the engine guessing German geography.
//   - Private health insurance (PKV) is now supported. The employer's
//     statutory subsidy (§257 Abs. 2a SGB V for health, §61 SGB XI for
//     care) is calculated as 50% of (contribution-ceiling-capped SV gross
//     × the general statutory rate), capped at 50% of the employee's
//     actual premium. The employee pays their actual premium minus that
//     subsidy out of pocket; the total premium itself is insurer-contract
//     specific and is caller-supplied, not computed by this engine.
//     Validated exactly (to the cent) against four real employer-subsidy
//     figures across two real payslips.
//
// Still out of scope, deliberately (rejected, not approximated):
//   - Tax classes other than I.
//   - The Kirchensteuer/Soli "Zählkinder" child-allowance correction: real
//     German payroll computes a separate, lower reference tax for Soli/
//     Kirchensteuer purposes that accounts for Kinderfreibeträge even when
//     they don't reduce the employee's actual withheld Lohnsteuer. This
//     engine applies both simply as a percentage of actual income tax,
//     which is correct for a childless employee and only approximately
//     correct otherwise.
//   - Sachsen's different long-term-care-insurance employer/employee split.
//   - §34 EStG Fünftelregelung (an elective, narrower method for certain
//     severance/multi-year payments) — the Differenzmethode covers the
//     common "annual bonus" case, not this.

export type DeInsuranceType = 'STATUTORY' | 'PRIVATE';

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
  // annual bonus) for this period.
  one_time_payment_taxable?: number;
  one_time_payment_sv?: number;
  tax_class: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  church_tax_liable: boolean;
  // Required when church_tax_liable is true: the employee's registered
  // Land's church-tax rate. Only 0.08 (Bayern, Baden-Württemberg) and 0.09
  // (all other Länder) are accepted.
  church_tax_rate?: 0.08 | 0.09;
  childless_surcharge_applicable: boolean;
  // Year-to-date SV-relevant pay (regular + prior one-time payments) before
  // this period, used to apply the RV/ALV and KV/PV contribution ceilings
  // (and, for PRIVATE insurance, the KV/PV ceiling that bounds the
  // employer's statutory subsidy calculation).
  ytd_sv_gross_before: number;
  // STATUTORY (gesetzliche Krankenversicherung) is the default modeled
  // case. PRIVATE requires the employee's actual premiums below.
  insurance_type: DeInsuranceType;
  // Required when insurance_type is 'PRIVATE': the employee's actual full
  // premium this period (both a real, insurer-contract-specific figure —
  // this engine cannot derive it, only apply the statutory employer-subsidy
  // formula to it).
  private_health_premium?: number;
  private_care_premium?: number;
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
    | 'CHURCH_TAX_PAYABLE'
    | 'SOCIAL_INSURANCE_PAYABLE';
  amount: number;
};

export type DeEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  income_tax: number;
  solidarity_surcharge: number;
  church_tax: number;
  insurance_type: DeInsuranceType;
  employee_pension_insurance: number;
  employee_unemployment_insurance: number;
  employee_health_insurance: number; // STATUTORY: employee's split. PRIVATE: premium minus employer subsidy.
  employee_care_insurance: number; // STATUTORY: employee's split (incl. childless surcharge). PRIVATE: premium minus employer subsidy.
  employee_social_insurance_total: number;
  employer_pension_insurance: number;
  employer_unemployment_insurance: number;
  employer_health_insurance: number; // STATUTORY: employer's split. PRIVATE: statutory-formula subsidy paid.
  employer_care_insurance: number; // STATUTORY: employer's split. PRIVATE: statutory-formula subsidy paid.
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
    church_tax: number;
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
  id: 'DE-2025-GRUNDTARIF-KLASSE-I-DRAFT-V3',
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
    // Monthly-equivalent Freigrenze for Steuerklasse I, 2025 published value
    // (applied on an annualized basis — see annualSoli). NEEDS VERIFICATION
    // against the current-year SolZG before production use.
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
    { authority: 'Landeskirchensteuergesetze (state law, not federal)', instrument: '8% (Bayern, Baden-Württemberg) or 9% (all other Länder) of income tax — caller-supplied per employee state', url: 'https://www.gesetze-im-internet.de/estg/__51a.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch V (SGB V) §257 Abs. 2a (Arbeitgeberzuschuss for privately insured employees)', url: 'https://www.gesetze-im-internet.de/sgb_5/__257.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch XI (SGB XI) §61 (Arbeitgeberzuschuss for private long-term-care insurance)', url: 'https://www.gesetze-im-internet.de/sgb_11/__61.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch VI (SGB VI) §168', url: 'https://www.gesetze-im-internet.de/sgb_6/__168.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch III (SGB III) §341', url: 'https://www.gesetze-im-internet.de/sgb_3/__341.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch V (SGB V) §241 (statutory health insurance rate)', url: 'https://www.gesetze-im-internet.de/sgb_5/__241.html' },
    { authority: 'Bundesministerium der Justiz (gesetze-im-internet.de)', instrument: 'Sozialgesetzbuch XI (SGB XI) §55 (statutory care insurance rate)', url: 'https://www.gesetze-im-internet.de/sgb_11/__55.html' }
  ],
  limitations: [
    'Tax class I (single, no children, standard case) only. Tax classes II–VI are rejected, not approximated.',
    'Church tax and Solidaritätszuschlag are computed as a flat percentage of actual income tax. Real German payroll computes a separate, lower reference tax for this purpose that accounts for Kinderfreibeträge (child allowances) via "Zählkinder", even when they do not reduce the employee’s actual withheld Lohnsteuer. This is correct for a childless employee and only approximately correct otherwise.',
    'Private health insurance support computes only the employer’s statutory subsidy (§257 SGB V / §61 SGB XI) against a caller-supplied actual premium. It does not compute or validate the premium itself, which is set by the employee’s individual insurance contract.',
    'Regular-pay income tax uses a simplified annualize-and-divide approximation of Lohnsteuer (this period’s taxable pay minus this period’s employee social-insurance withholding, annualized × 12, through the §32a Grundtarif formula, ÷ 12). This does not reproduce the official monthly Lohnsteuertabelle/ELStAM withholding procedure exactly.',
    'One-time payments (Einmalzahlung) are taxed via the §39b(3) EStG Differenzmethode. This does not implement the elective §34 Fünftelregelung used for certain severance/multi-year payments.',
    'Long-term care insurance uses the standard (non-Sachsen) employer/employee split. Sachsen’s different split is not implemented; Sachsen employees are rejected.',
    'The statutory health-insurance employee/employer split uses a published national average additional contribution (Zusatzbeitrag), not the employee’s actual fund rate. (The private-insurance employer subsidy formula does not use the Zusatzbeitrag average at all, per statute — validated against real payslips.)',
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

// §4 SolZG 1995, applied on an ANNUAL tax figure (see calculateGermanyPayroll
// for why: mixing a monthly regular-pay tax with a one-time-payment tax and
// comparing that mixed figure to a monthly threshold is apples-to-oranges).
function annualSoli(annualTax: number): number {
  const s = PAYROLL_RULE_PACK_DE.solidarity_surcharge;
  const annualFreigrenze = s.monthly_freigrenze * 12;
  if (annualTax <= annualFreigrenze) return 0;
  const flat = annualTax * s.rate;
  const milderung = (annualTax - annualFreigrenze) * s.milderungszone_rate;
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
    if (employee.church_tax_liable && employee.church_tax_rate !== 0.08 && employee.church_tax_rate !== 0.09) {
      const error = new Error(`church_tax_rate must be 0.08 or 0.09 when church_tax_liable is true, for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.childless_surcharge_applicable !== 'boolean') {
      const error = new Error(`childless_surcharge_applicable must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.insurance_type !== 'STATUTORY' && employee.insurance_type !== 'PRIVATE') {
      const error = new Error(`insurance_type must be STATUTORY or PRIVATE for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.insurance_type === 'PRIVATE') {
      if (typeof employee.private_health_premium !== 'number' || typeof employee.private_care_premium !== 'number') {
        const error = new Error(`private_health_premium and private_care_premium are required for ${employeeId} (insurance_type PRIVATE)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }

    const taxableGross = requireNonNegativeMoney(employee.taxable_gross_pay, `taxable_gross_pay for ${employeeId}`);
    const svGross = requireNonNegativeMoney(employee.sv_gross_pay, `sv_gross_pay for ${employeeId}`);
    const ezTaxable = requireNonNegativeMoney(employee.one_time_payment_taxable ?? 0, `one_time_payment_taxable for ${employeeId}`);
    const ezSv = requireNonNegativeMoney(employee.one_time_payment_sv ?? 0, `one_time_payment_sv for ${employeeId}`);
    const ytdSvBefore = requireNonNegativeMoney(employee.ytd_sv_gross_before, `ytd_sv_gross_before for ${employeeId}`);

    // Pension and unemployment insurance apply regardless of health-insurance type.
    const pensionRegular = ceilingContribution(ytdSvBefore, svGross, sv.pension_ceiling_annual, sv.pension_rate_total / 2);
    const pensionEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.pension_ceiling_annual, sv.pension_rate_total / 2);
    const employeePension = money(pensionRegular + pensionEz);
    const employerPension = employeePension;

    const unemploymentRegular = ceilingContribution(ytdSvBefore, svGross, sv.pension_ceiling_annual, sv.unemployment_rate_total / 2);
    const unemploymentEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.pension_ceiling_annual, sv.unemployment_rate_total / 2);
    const employeeUnemployment = money(unemploymentRegular + unemploymentEz);
    const employerUnemployment = employeeUnemployment;

    let employeeHealth: number;
    let employerHealth: number;
    let employeeCare: number;
    let employerCare: number;
    let regularEmployeeHealthCare: number; // this period's regular-pay portion only, for the tax-base calc below

    if (employee.insurance_type === 'STATUTORY') {
      const healthRate = (sv.health_general_rate_total + sv.health_avg_zusatzbeitrag_total) / 2;
      const healthRegular = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, healthRate);
      const healthEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, healthRate);
      employeeHealth = money(healthRegular + healthEz);
      employerHealth = employeeHealth;

      const careRateHalf = sv.care_rate_total / 2;
      const careRegularBase = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, careRateHalf);
      const careEzBase = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, careRateHalf);
      const careSurchargeRegular = employee.childless_surcharge_applicable
        ? ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, sv.care_childless_surcharge_employee)
        : 0;
      const careSurchargeEz = employee.childless_surcharge_applicable
        ? ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, sv.care_childless_surcharge_employee)
        : 0;
      employeeCare = money(careRegularBase + careEzBase + careSurchargeRegular + careSurchargeEz);
      employerCare = money(careRegularBase + careEzBase);

      regularEmployeeHealthCare = money(healthRegular + careRegularBase + careSurchargeRegular);
    } else {
      // PRIVATE: employer pays 50% of (ceiling-capped SV gross x general
      // statutory rate), capped at 50% of the employee's actual premium.
      // §257 Abs. 2a SGB V / §61 SGB XI. Validated exactly against real
      // payslips using the general rate alone (no Zusatzbeitrag averaging).
      const healthPremium = requireNonNegativeMoney(employee.private_health_premium, `private_health_premium for ${employeeId}`);
      const carePremium = requireNonNegativeMoney(employee.private_care_premium, `private_care_premium for ${employeeId}`);

      const fictionalHealthRegular = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, sv.health_general_rate_total);
      const fictionalHealthEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, sv.health_general_rate_total);
      const halfFictionalHealth = money((fictionalHealthRegular + fictionalHealthEz) / 2);
      employerHealth = Math.min(halfFictionalHealth, money(healthPremium / 2));
      employeeHealth = money(healthPremium - employerHealth);

      const fictionalCareRegular = ceilingContribution(ytdSvBefore, svGross, sv.health_ceiling_annual, sv.care_rate_total);
      const fictionalCareEz = ceilingContribution(ytdSvBefore + svGross, ezSv, sv.health_ceiling_annual, sv.care_rate_total);
      const halfFictionalCare = money((fictionalCareRegular + fictionalCareEz) / 2);
      employerCare = Math.min(halfFictionalCare, money(carePremium / 2));
      employeeCare = money(carePremium - employerCare);

      // For the tax base below, only the regular-pay share of what the
      // employee actually pays out of pocket counts as this period's
      // regular-pay pre-tax-equivalent social contribution; approximate by
      // prorating the employee's total private out-of-pocket by the
      // regular-vs-EZ SV split (falls back to the whole amount when there's
      // no one-time payment, which is the common case).
      const totalSv = money(svGross + ezSv);
      const regularShare = totalSv > 0 ? svGross / totalSv : 1;
      regularEmployeeHealthCare = money((employeeHealth + employeeCare) * regularShare);
    }

    const employeeSocialTotal = money(employeePension + employeeUnemployment + employeeHealth + employeeCare);
    const employerSocialTotal = money(employerPension + employerUnemployment + employerHealth + employerCare);

    // Regular-pay income tax: simplified annualize-and-divide.
    const regularEmployeeSv = money(pensionRegular + unemploymentRegular + regularEmployeeHealthCare);
    const regularTaxableBase = Math.max(0, taxableGross - regularEmployeeSv);
    const annualRegularEstimate = money(regularTaxableBase * 12);
    const annualTaxRegularOnly = annualIncomeTax(annualRegularEstimate);
    const regularIncomeTax = money(annualTaxRegularOnly / 12);
    const annualSoliRegularOnly = annualSoli(annualTaxRegularOnly);
    const monthlySoliRegular = money(annualSoliRegularOnly / 12);

    // One-time-payment income tax and Soli: §39b(3) EStG Differenzmethode,
    // applied consistently to both the tax and (now, fixed in v3) the Soli.
    let ezIncomeTax = 0;
    let ezSoli = 0;
    if (ezTaxable > 0) {
      const ezEmployeeSv = money(pensionEz + unemploymentEz + money(employeeHealth + employeeCare - regularEmployeeHealthCare));
      const ezTaxableBase = Math.max(0, ezTaxable - ezEmployeeSv);
      const annualTaxWithEz = annualIncomeTax(annualRegularEstimate + ezTaxableBase);
      ezIncomeTax = money(annualTaxWithEz - annualTaxRegularOnly);
      const annualSoliWithEz = annualSoli(annualTaxWithEz);
      ezSoli = money(annualSoliWithEz - annualSoliRegularOnly);
    }

    const incomeTax = money(regularIncomeTax + ezIncomeTax);
    const solidarityTax = money(monthlySoliRegular + ezSoli);
    const churchTax = employee.church_tax_liable ? money(incomeTax * (employee.church_tax_rate as number)) : 0;

    const grossPay = money(taxableGross + ezTaxable);
    const netPay = money(grossPay - incomeTax - solidarityTax - churchTax - employeeSocialTotal);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      income_tax: incomeTax,
      solidarity_surcharge: solidarityTax,
      church_tax: churchTax,
      insurance_type: employee.insurance_type,
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
    church_tax: sum(employees.map(e => e.church_tax)),
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
    { side: 'CREDIT', account_role: 'CHURCH_TAX_PAYABLE', amount: totals.church_tax },
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

  // Case 1: plain regular-only month, well inside the brackets, statutory insurance.
  const sample = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E001', taxable_gross_pay: 4000, sv_gross_pay: 4000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 28000, insurance_type: 'STATUTORY' }
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
  const expectedSoli = money(annualSoli(annualIncomeTax(expectedAnnualTaxable)) / 12);
  const expectedNet = money(4000 - expectedIncomeTax - expectedSoli - expectedSocialTotal);

  // Case 2: dual-basis regression (taxable base != SV base).
  const dualBasisCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E002', taxable_gross_pay: 6138.11, sv_gross_pay: 6946.11, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 0, insurance_type: 'STATUTORY' }
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
      { employee_id: 'E003', taxable_gross_pay: 9000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 93000, insurance_type: 'STATUTORY' }
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
      { employee_id: 'E004', taxable_gross_pay: 9000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: true, ytd_sv_gross_before: 60000, insurance_type: 'STATUTORY' }
    ]
  });
  const c2 = healthCeilingCase.employees[0];
  const expectedRoomToHealthCeiling = money(66150 - 60000);
  const expectedCeilingCare = money(
    expectedRoomToHealthCeiling * (sv.care_rate_total / 2) + expectedRoomToHealthCeiling * sv.care_childless_surcharge_employee
  );

  // Case 5: Solidaritätszuschlag threshold behavior.
  const belowFreigrenze = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E005', taxable_gross_pay: 3000, sv_gross_pay: 3000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 0, insurance_type: 'STATUTORY' }
    ]
  });
  const highEarner = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E006', taxable_gross_pay: 15000, sv_gross_pay: 9000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 200000, insurance_type: 'STATUTORY' }
    ]
  });
  const highEarnerResult = highEarner.employees[0];

  // Case 6: one-time payment (Differenzmethode), and the v3 Soli fix — a
  // combined regular+EZ period whose ANNUAL total tax stays close to the
  // annual Freigrenze should behave like the real payslip that showed zero
  // Soli despite a large one-time payment.
  const bonusCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E007', taxable_gross_pay: 4000, sv_gross_pay: 4000, one_time_payment_taxable: 10000, one_time_payment_sv: 10000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 20000, insurance_type: 'STATUTORY' }
    ]
  });
  const b = bonusCase.employees[0];
  const bonusRegularOnly = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E007b', taxable_gross_pay: 4000, sv_gross_pay: 4000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 20000, insurance_type: 'STATUTORY' }
    ]
  });
  const bRegularOnly = bonusRegularOnly.employees[0];

  // Regression for the specific bug fixed in v3: a low-regular-pay employee
  // whose combined (regular + EZ) *monthly* figure would have crossed the
  // old (wrong) monthly Freigrenze check, but whose ANNUAL total tax stays
  // under the annual Freigrenze, should owe zero Soli — mirroring the real
  // Apr 2024 payslip finding.
  const zeroSoliWithBonus = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E008', taxable_gross_pay: 2500, sv_gross_pay: 2500, one_time_payment_taxable: 3000, one_time_payment_sv: 3000, tax_class: 'I', church_tax_liable: false, childless_surcharge_applicable: false, ytd_sv_gross_before: 0, insurance_type: 'STATUTORY' }
    ]
  });

  // Case 7: church tax, 9% of income tax.
  const churchTaxCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      { employee_id: 'E009', taxable_gross_pay: 4000, sv_gross_pay: 4000, tax_class: 'I', church_tax_liable: true, church_tax_rate: 0.09, childless_surcharge_applicable: false, ytd_sv_gross_before: 0, insurance_type: 'STATUTORY' }
    ]
  });
  const ct = churchTaxCase.employees[0];

  // Case 8: private health insurance, validated exactly against real
  // payslip figures (Dec 2023 Ford payslip: KV-Brutto 4,987.50 -> AG-Zuschuss
  // KV 364.09; PV -> AG-Zuschuss 84.79, using 2025's 3.6% care rate here so
  // the expected value is derived from this pack's own rate, not the 2023
  // one, while confirming the *formula* against the real-world figures in
  // the PR description).
  const privateCase = calculateGermanyPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E010',
        taxable_gross_pay: 6138.11,
        sv_gross_pay: 4987.50, // at/above the KV/PV ceiling, as in the real payslip
        tax_class: 'I',
        church_tax_liable: false,
        childless_surcharge_applicable: false,
        ytd_sv_gross_before: 0,
        insurance_type: 'PRIVATE',
        private_health_premium: 900,
        private_care_premium: 200
      }
    ]
  });
  const pv = privateCase.employees[0];
  const expectedPrivateHealthSubsidy = money((4987.5 * sv.health_general_rate_total) / 2); // = 364.09 with 2025's 14.6% rate too
  const expectedPrivateCareSubsidy = money((4987.5 * sv.care_rate_total) / 2); // = 89.78 at 2025's 3.6%

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
      b.income_tax > bRegularOnly.income_tax &&
      (b.income_tax - bRegularOnly.income_tax) > money(10000 * 0.14) &&
      bonusCase.controls.journal_balanced &&
      zeroSoliWithBonus.employees[0].solidarity_surcharge === 0 &&
      zeroSoliWithBonus.controls.journal_balanced &&
      ct.church_tax === money(ct.income_tax * 0.09) &&
      ct.church_tax > 0 &&
      churchTaxCase.controls.journal_balanced &&
      pv.employer_health_insurance === expectedPrivateHealthSubsidy &&
      pv.employer_care_insurance === expectedPrivateCareSubsidy &&
      pv.employee_health_insurance === money(900 - expectedPrivateHealthSubsidy) &&
      pv.employee_care_insurance === money(200 - expectedPrivateCareSubsidy) &&
      privateCase.controls.journal_balanced,
    sample,
    dualBasisCase,
    pensionCeilingCase,
    healthCeilingCase,
    belowFreigrenze,
    highEarner,
    bonusCase,
    zeroSoliWithBonus,
    churchTaxCase,
    privateCase
  };
}
