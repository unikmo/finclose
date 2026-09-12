// United States (US) payroll rule pack — v1: federal + California.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current US payroll/tax expertise has checked:
//   1. the federal percentage-method withholding table (IRS Pub 15-T) against
//      the current-year edition,
//   2. the FICA rates and Social Security wage base against the current-year
//      SSA/IRS figures,
//   3. the FUTA net rate (including any state credit-reduction) against the
//      current-year Department of Labor credit-reduction-state list,
//   4. the California withholding schedule (EDD DE 44 Method B) and SDI rate
//      against the current-year EDD publication.
// These figures change every year, several of them (SS wage base, CA SDI
// rate, FUTA credit reductions) finalized only late in the prior year or
// even during the current year. This file uses figures sourced via AI web
// research (not a professional review) as of September 2026.
//
// Scope, deliberately narrow (rejected, not approximated):
//   - Only one state is supported: California. Every other US state
//     (including the nine with no state income tax, which would otherwise be
//     "free" additions) is rejected until built and validated individually —
//     "no income tax" still leaves SUI/SDI/local nuances unverified here.
//   - Federal Form W-4 (2020 or later revision) only. Pre-2020 W-4s
//     (allowances-based) are rejected — the IRS's own "computational bridge"
//     could approximate them, but that's out of scope for v1.
//   - The federal "Form W-4, Step 2, Checkbox" percentage-method schedule IS
//     supported (caller passes `federal_step2_checkbox`).
//   - Only the four most common pay frequencies are supported: weekly,
//     biweekly, semimonthly, monthly. Quarterly/semiannual/annual/daily are
//     rejected.
//   - State Unemployment Insurance (SUI) is NOT calculated. Every California
//     employer has an individual SUI rate assigned annually by the EDD based
//     on their claims experience — there is no statutory flat rate this
//     engine could compute. The caller must supply their own SUI rate and
//     compute/post that contribution outside this engine.
//   - California Employment Training Tax (ETT) is NOT calculated — its
//     current wage base was not independently reverified this pass.
//   - Pre-tax deductions (401(k)/403(b) deferrals, cafeteria-plan health
//     premiums, HSA/FSA contributions) are NOT modeled. `gross_pay` is
//     treated as fully taxable for both federal and CA purposes. A payroll
//     with pre-tax deductions must be rejected or handled by pre-reducing
//     gross_pay/sv-equivalent wages outside this engine — this engine does
//     not know the difference between gross pay and taxable wages.
//   - Supplemental wage flat-rate withholding (the 22%/37% optional/mandatory
//     methods for bonuses, commissions, etc.) is not implemented. All pay is
//     treated as regular wages through the annualized percentage method.
//   - The Additional Medicare Tax employer withholding obligation applies a
//     single $200,000 threshold regardless of the employee's actual filing
//     status (per IRC 3102(f)(1) — employers withhold on wages over $200k
//     regardless of MFJ/MFS/HOH; true-up for a joint filer's actual $250k
//     threshold happens on the employee's own Form 8959, not in payroll).
//     This engine follows that employer-side rule exactly; it is not a
//     simplification.
//
// Self-test validated against the exact IRS Pub 15-T 2026 Percentage Method
// Table figures and EDD 2026 Method B table figures cited in evidence below,
// not against independent real-world payslips (none were available for this
// pass, unlike the German pack).

export type UsPayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
export type UsFederalFilingStatus = 'SINGLE_MFS' | 'MFJ' | 'HOH';
export type UsCaFilingStatus = 'SINGLE' | 'MARRIED_0_OR_1' | 'MARRIED_2_OR_MORE' | 'HEAD_OF_HOUSEHOLD';

export type UsEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pay_frequency: UsPayFrequency;
  federal_filing_status: UsFederalFilingStatus;
  federal_step2_checkbox: boolean;
  federal_step3_annual_credits?: number;
  federal_step4a_annual_other_income?: number;
  federal_step4b_annual_deductions?: number;
  federal_step4c_extra_per_period?: number;
  ytd_ss_wages_before: number;
  ytd_medicare_wages_before: number;
  ytd_futa_wages_before: number;
  state: 'CA';
  ca_filing_status: UsCaFilingStatus;
  ca_regular_allowances: number;
  ca_estimated_deduction_allowances?: number;
};

export type UsPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UsEmployeeInput[];
};

export type UsJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_PAYROLL_TAX_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'FEDERAL_INCOME_TAX_PAYABLE'
    | 'FICA_PAYABLE'
    | 'FUTA_PAYABLE'
    | 'CA_INCOME_TAX_PAYABLE'
    | 'CA_SDI_PAYABLE';
  amount: number;
};

export type UsEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  federal_income_tax: number;
  employee_social_security: number;
  employer_social_security: number;
  employee_medicare: number;
  employer_medicare: number;
  employee_additional_medicare: number;
  employer_futa: number;
  ca_income_tax: number;
  ca_sdi: number;
  net_pay: number;
  employer_cost_total: number;
  ytd_ss_wages_after: number;
  ytd_medicare_wages_after: number;
  ytd_futa_wages_after: number;
};

export type UsPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'US';
  currency: 'USD';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UsEmployeeResult[];
  totals: {
    gross_pay: number;
    federal_income_tax: number;
    fica_employee: number;
    fica_employer: number;
    futa: number;
    ca_income_tax: number;
    ca_sdi: number;
    net_pay: number;
    employer_cost_total: number;
  };
  journal: UsJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_US = {
  id: 'US-CA-2026-FEDERAL-PERCENTAGE-METHOD-DRAFT-V1',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'USD',
  fica: {
    social_security_rate: 0.062,
    social_security_wage_base_annual: 184500,
    medicare_rate: 0.0145,
    additional_medicare_rate: 0.009,
    additional_medicare_threshold_annual: 200000
  },
  futa: {
    gross_rate: 0.06,
    wage_base_annual: 7000,
    net_rate_default: 0.006,
    net_rate_by_state: {
      CA: 0.018
    } as Record<string, number>
  },
  federal_income_tax: {
    periods_per_year: { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12 } as Record<UsPayFrequency, number>,
    step2_not_checked_deduction_mfj: 12900,
    step2_not_checked_deduction_other: 8600,
    // 2026 Percentage Method Tables for Automated Payroll Systems, Annual
    // STANDARD Withholding Rate Schedules and Step-2-Checkbox schedules
    // (IRS Pub 15-T, section 1). Brackets: [atLeast, base, rate].
    standard: {
      MFJ: [
        [0, 0, 0], [19300, 0, 0.10], [44100, 2480, 0.12], [120100, 11600, 0.22],
        [230700, 35932, 0.24], [422850, 82048, 0.32], [531750, 116896, 0.35], [788000, 206583.5, 0.37]
      ],
      SINGLE_MFS: [
        [0, 0, 0], [7500, 0, 0.10], [19900, 1240, 0.12], [57900, 5800, 0.22],
        [113200, 17966, 0.24], [209275, 41024, 0.32], [263725, 58448, 0.35], [648100, 192979.25, 0.37]
      ],
      HOH: [
        [0, 0, 0], [15550, 0, 0.10], [33250, 1770, 0.12], [83000, 7740, 0.22],
        [121250, 16155, 0.24], [217300, 39207, 0.32], [271750, 56631, 0.35], [656150, 191171, 0.37]
      ]
    } as Record<UsFederalFilingStatus, Array<[number, number, number]>>,
    step2Checkbox: {
      MFJ: [
        [0, 0, 0], [16100, 0, 0.10], [28500, 1240, 0.12], [66500, 5800, 0.22],
        [121800, 17966, 0.24], [217875, 41024, 0.32], [272325, 58448, 0.35], [400450, 103291.75, 0.37]
      ],
      SINGLE_MFS: [
        [0, 0, 0], [8050, 0, 0.10], [14250, 620, 0.12], [33250, 2900, 0.22],
        [60900, 8983, 0.24], [108938, 20512, 0.32], [136163, 29224, 0.35], [328350, 96489.63, 0.37]
      ],
      HOH: [
        [0, 0, 0], [12075, 0, 0.10], [20925, 885, 0.12], [45800, 3870, 0.22],
        [64925, 8077.5, 0.24], [112950, 19603.5, 0.32], [140175, 28315.5, 0.35], [332375, 95585.5, 0.37]
      ]
    } as Record<UsFederalFilingStatus, Array<[number, number, number]>>
  },
  california: {
    sdi_rate: 0.013,
    // EDD 2026 Withholding Schedules, Method B - Exact Calculation.
    // Table 1: Low Income Exemption (per payroll period).
    low_income_exemption: {
      WEEKLY: { SINGLE: 363, MARRIED_0_OR_1: 363, MARRIED_2_OR_MORE: 727, HEAD_OF_HOUSEHOLD: 727 },
      BIWEEKLY: { SINGLE: 727, MARRIED_0_OR_1: 727, MARRIED_2_OR_MORE: 1454, HEAD_OF_HOUSEHOLD: 1454 },
      SEMIMONTHLY: { SINGLE: 787, MARRIED_0_OR_1: 787, MARRIED_2_OR_MORE: 1575, HEAD_OF_HOUSEHOLD: 1575 },
      MONTHLY: { SINGLE: 1575, MARRIED_0_OR_1: 1575, MARRIED_2_OR_MORE: 3149, HEAD_OF_HOUSEHOLD: 3149 }
    } as Record<UsPayFrequency, Record<UsCaFilingStatus, number>>,
    // Table 2: Estimated Deduction Table, per additional allowance claimed.
    estimated_deduction_per_allowance: { WEEKLY: 19, BIWEEKLY: 38, SEMIMONTHLY: 42, MONTHLY: 83 } as Record<UsPayFrequency, number>,
    // Table 3: Standard Deduction Table.
    standard_deduction: {
      WEEKLY: { SINGLE: 110, MARRIED_0_OR_1: 110, MARRIED_2_OR_MORE: 219, HEAD_OF_HOUSEHOLD: 219 },
      BIWEEKLY: { SINGLE: 219, MARRIED_0_OR_1: 219, MARRIED_2_OR_MORE: 439, HEAD_OF_HOUSEHOLD: 439 },
      SEMIMONTHLY: { SINGLE: 238, MARRIED_0_OR_1: 238, MARRIED_2_OR_MORE: 476, HEAD_OF_HOUSEHOLD: 476 },
      MONTHLY: { SINGLE: 476, MARRIED_0_OR_1: 476, MARRIED_2_OR_MORE: 951, HEAD_OF_HOUSEHOLD: 951 }
    } as Record<UsPayFrequency, Record<UsCaFilingStatus, number>>,
    // Table 4: Exemption Allowance Table, per regular allowance claimed.
    exemption_allowance_credit_per_allowance: { WEEKLY: 3.24, BIWEEKLY: 6.47, SEMIMONTHLY: 7.01, MONTHLY: 14.03 } as Record<UsPayFrequency, number>,
    // Tables 17-28: Tax Rate Tables by payroll period. Brackets: [atLeast, base, rate].
    // "married" rate table applies to both MARRIED_0_OR_1 and MARRIED_2_OR_MORE
    // (the allowance count only changes which low-income/standard-deduction
    // column is used, per EDD's own table structure).
    rate_tables: {
      WEEKLY: {
        SINGLE: [[0, 0, 0.011], [213, 2.34, 0.022], [505, 8.76, 0.044], [797, 21.61, 0.066], [1107, 42.07, 0.088], [1399, 67.77, 0.1023], [7144, 655.48, 0.1133], [8573, 817.39, 0.1243], [14288, 1527.76, 0.1353], [19231, 2196.55, 0.1463]],
        MARRIED: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1594, 43.24, 0.066], [2214, 84.16, 0.088], [2798, 135.55, 0.1023], [14288, 1310.98, 0.1133], [17146, 1634.79, 0.1243], [28575, 1893.96, 0.1353], [38462, 3158.2, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1302, 30.39, 0.066], [1612, 50.85, 0.088], [1904, 76.55, 0.1023], [9716, 875.72, 0.1133], [11659, 1095.86, 0.1243], [19231, 2037.06, 0.1353], [19431, 2064.12, 0.1463]]
      },
      BIWEEKLY: {
        SINGLE: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1594, 43.24, 0.066], [2214, 84.16, 0.088], [2798, 135.55, 0.1023], [14288, 1310.98, 0.1133], [17146, 1634.79, 0.1243], [28576, 3055.54, 0.1353], [38462, 4393.12, 0.1463]],
        MARRIED: [[0, 0, 0.011], [852, 9.37, 0.022], [2020, 35.07, 0.044], [3188, 86.46, 0.066], [4428, 168.3, 0.088], [5596, 271.08, 0.1023], [28576, 2621.93, 0.1133], [34292, 3269.55, 0.1243], [38462, 3787.88, 0.1353], [57150, 6316.37, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [852, 9.37, 0.022], [2020, 35.07, 0.044], [2604, 60.77, 0.066], [3224, 101.69, 0.088], [3808, 153.08, 0.1023], [19432, 1751.42, 0.1133], [23318, 2191.7, 0.1243], [38462, 4074.1, 0.1353], [38862, 4128.22, 0.1463]]
      },
      SEMIMONTHLY: {
        SINGLE: [[0, 0, 0.011], [462, 5.08, 0.022], [1094, 18.98, 0.044], [1727, 46.83, 0.066], [2398, 91.12, 0.088], [3030, 146.74, 0.1023], [15478, 1420.17, 0.1133], [18574, 1770.95, 0.1243], [30956, 3310.03, 0.1353], [41667, 4759.23, 0.1463]],
        MARRIED: [[0, 0, 0.011], [924, 10.16, 0.022], [2188, 37.97, 0.044], [3454, 93.67, 0.066], [4796, 182.24, 0.088], [6060, 293.47, 0.1023], [30956, 2840.33, 0.1133], [37148, 3541.88, 0.1243], [41667, 4103.59, 0.1353], [61913, 6842.87, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [924, 10.16, 0.022], [2189, 37.99, 0.044], [2822, 65.84, 0.066], [3492, 110.06, 0.088], [4125, 165.76, 0.1023], [21050, 1897.19, 0.1133], [25260, 2374.18, 0.1243], [41667, 4413.57, 0.1353], [42101, 4472.29, 0.1463]]
      },
      MONTHLY: {
        SINGLE: [[0, 0, 0.011], [924, 10.16, 0.022], [2188, 37.97, 0.044], [3454, 93.67, 0.066], [4796, 182.24, 0.088], [6060, 293.47, 0.1023], [30956, 2840.33, 0.1133], [37148, 3541.88, 0.1243], [61912, 6620.05, 0.1353], [83334, 9518.45, 0.1463]],
        MARRIED: [[0, 0, 0.011], [1848, 20.33, 0.022], [4376, 75.95, 0.044], [6908, 187.36, 0.066], [9592, 364.5, 0.088], [12120, 586.96, 0.1023], [61912, 5680.68, 0.1133], [74296, 7083.79, 0.1243], [83334, 8207.21, 0.1353], [123826, 13685.78, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [1848, 20.33, 0.022], [4378, 75.99, 0.044], [5644, 131.69, 0.066], [6984, 220.13, 0.088], [8250, 331.54, 0.1023], [42100, 3794.4, 0.1133], [50520, 4748.39, 0.1243], [83334, 8827.17, 0.1353], [84202, 8944.61, 0.1463]]
      }
    } as Record<UsPayFrequency, Record<'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD', Array<[number, number, number]>>>
  },
  evidence: [
    { authority: 'Internal Revenue Service', instrument: 'Publication 15-T (2026), Federal Income Tax Withholding Methods, Section 1 — Percentage Method Tables for Automated Payroll Systems', url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
    { authority: 'Internal Revenue Service', instrument: 'Publication 926 / SSA 2026 wage base and Additional Medicare Tax rules (IRC 3102(f))', url: 'https://www.irs.gov/pub/irs-pdf/p926.pdf' },
    { authority: 'US Department of Labor / IRS Form 940 instructions', instrument: '2026 FUTA rate, wage base, and California credit-reduction status', url: 'https://www.irs.gov' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California Withholding Schedules — Method B, Exact Calculation Method', url: 'https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California State Disability Insurance (SDI) employee contribution rate', url: 'https://edd.ca.gov' }
  ],
  limitations: [
    'Only California is supported as a state. Every other state, including the nine with no state income tax, is rejected pending its own build and validation.',
    'Only 2020-or-later Form W-4 revisions are supported (Steps 1-4). Pre-2020 allowances-based W-4s are rejected, not approximated via the IRS computational bridge.',
    'Only weekly, biweekly, semimonthly, and monthly pay frequencies are supported.',
    'State Unemployment Insurance (SUI) is not calculated — it uses an employer-specific experience rate assigned annually by the EDD, which this engine has no statutory default for. Callers must compute and post SUI separately.',
    'California Employment Training Tax (ETT) is not calculated.',
    'Pre-tax deductions (401(k)/403(b), cafeteria-plan premiums, HSA/FSA) are not modeled. gross_pay is treated as fully taxable for both federal and CA withholding and for FICA.',
    'Supplemental-wage flat-rate withholding methods (22% optional / 37% mandatory) are not implemented; all pay is run through the regular annualized percentage method.',
    'Figures are 2026 values sourced via AI web research (not a professional review) as of September 2026 and must still be verified against the official IRS Pub 15-T and EDD Method B publications before this pack is marked VERIFIED_BASIC_RULES.',
    'The FUTA net rate (including the California credit reduction) is finalized by the Department of Labor late in the calendar year; the 1.8% California figure used here is the best available 2026 estimate at the time of writing and must be reconfirmed once the year is final.',
    'This engine prepares payroll and accounting outputs only. It does not submit tax filings (e.g. Form 940/941/DE 9) and does not initiate payments.'
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

function bracketLookup(annualAmount: number, brackets: Array<[number, number, number]>) {
  let row = brackets[0];
  for (const candidate of brackets) {
    if (annualAmount >= candidate[0]) row = candidate;
    else break;
  }
  const [atLeast, base, rate] = row;
  return money(base + (annualAmount - atLeast) * rate);
}

export function calculateUsPayroll(input: UsPayrollRunInput): UsPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_US;
  const seen = new Set<string>();

  const employees: UsEmployeeResult[] = input.employees.map(employee => {
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
    const ytdSsBefore = requireNonNegativeMoney(employee.ytd_ss_wages_before, `ytd_ss_wages_before for ${employeeId}`);
    const ytdMedicareBefore = requireNonNegativeMoney(employee.ytd_medicare_wages_before, `ytd_medicare_wages_before for ${employeeId}`);
    const ytdFutaBefore = requireNonNegativeMoney(employee.ytd_futa_wages_before, `ytd_futa_wages_before for ${employeeId}`);

    if (!['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'].includes(employee.pay_frequency)) {
      const error = new Error(`pay_frequency for ${employeeId} must be WEEKLY, BIWEEKLY, SEMIMONTHLY, or MONTHLY`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!['SINGLE_MFS', 'MFJ', 'HOH'].includes(employee.federal_filing_status)) {
      const error = new Error(`federal_filing_status for ${employeeId} must be SINGLE_MFS, MFJ, or HOH`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.federal_step2_checkbox !== 'boolean') {
      const error = new Error(`federal_step2_checkbox must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state !== 'CA') {
      const error = new Error(`state for ${employeeId} is not supported — only CA is implemented in this rule pack`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (!['SINGLE', 'MARRIED_0_OR_1', 'MARRIED_2_OR_MORE', 'HEAD_OF_HOUSEHOLD'].includes(employee.ca_filing_status)) {
      const error = new Error(`ca_filing_status for ${employeeId} must be SINGLE, MARRIED_0_OR_1, MARRIED_2_OR_MORE, or HEAD_OF_HOUSEHOLD`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!Number.isInteger(employee.ca_regular_allowances) || employee.ca_regular_allowances < 0) {
      const error = new Error(`ca_regular_allowances for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const caEstimatedDeductionAllowances = employee.ca_estimated_deduction_allowances ?? 0;
    if (!Number.isInteger(caEstimatedDeductionAllowances) || caEstimatedDeductionAllowances < 0) {
      const error = new Error(`ca_estimated_deduction_allowances for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const periodsPerYear = p.federal_income_tax.periods_per_year[employee.pay_frequency];

    // --- FICA ---
    const employeeSocialSecurity = ceilingContribution(ytdSsBefore, grossPay, p.fica.social_security_wage_base_annual, p.fica.social_security_rate);
    const employerSocialSecurity = employeeSocialSecurity; // same ceiling, same rate, employer matches
    const employeeMedicare = money(grossPay * p.fica.medicare_rate);
    const employerMedicare = employeeMedicare;
    const medicareYtdAfter = money(ytdMedicareBefore + grossPay);
    const additionalMedicareWagesThisPeriod = Math.max(0, medicareYtdAfter - Math.max(p.fica.additional_medicare_threshold_annual, ytdMedicareBefore));
    const employeeAdditionalMedicare = money(additionalMedicareWagesThisPeriod * p.fica.additional_medicare_rate);

    // --- FUTA (employer only) ---
    const futaNetRate = p.futa.net_rate_by_state[employee.state] ?? p.futa.net_rate_default;
    const employerFuta = ceilingContribution(ytdFutaBefore, grossPay, p.futa.wage_base_annual, futaNetRate);

    // --- Federal income tax withholding (Worksheet 1A, annualized percentage method) ---
    const step3AnnualCredits = employee.federal_step3_annual_credits ?? 0;
    const step4aAnnualOtherIncome = employee.federal_step4a_annual_other_income ?? 0;
    const step4bAnnualDeductions = employee.federal_step4b_annual_deductions ?? 0;
    const step4cExtraPerPeriod = employee.federal_step4c_extra_per_period ?? 0;

    const annualizedWage = money(grossPay * periodsPerYear);
    const adjustedAnnualWageBeforeStandardDeduction = money(annualizedWage + step4aAnnualOtherIncome);
    const step2NotCheckedDeduction = employee.federal_step2_checkbox
      ? 0
      : employee.federal_filing_status === 'MFJ'
        ? p.federal_income_tax.step2_not_checked_deduction_mfj
        : p.federal_income_tax.step2_not_checked_deduction_other;
    const totalReduction = money(step4bAnnualDeductions + step2NotCheckedDeduction);
    const adjustedAnnualWageAmount = Math.max(0, money(adjustedAnnualWageBeforeStandardDeduction - totalReduction));

    const brackets = employee.federal_step2_checkbox
      ? p.federal_income_tax.step2Checkbox[employee.federal_filing_status]
      : p.federal_income_tax.standard[employee.federal_filing_status];
    const tentativeAnnualTax = bracketLookup(adjustedAnnualWageAmount, brackets);
    const tentativeWithholdingThisPeriod = money(tentativeAnnualTax / periodsPerYear);
    const creditsThisPeriod = money(step3AnnualCredits / periodsPerYear);
    const afterCredits = Math.max(0, money(tentativeWithholdingThisPeriod - creditsThisPeriod));
    const federalIncomeTax = money(afterCredits + step4cExtraPerPeriod);

    // --- California state income tax withholding (Method B, exact calculation) ---
    const lowIncomeExemption = p.california.low_income_exemption[employee.pay_frequency][employee.ca_filing_status];
    let caIncomeTax = 0;
    if (grossPay > lowIncomeExemption) {
      const estimatedDeduction = money(caEstimatedDeductionAllowances * p.california.estimated_deduction_per_allowance[employee.pay_frequency]);
      const wagesSubjectToWithholding = Math.max(0, money(grossPay - estimatedDeduction));
      const standardDeduction = p.california.standard_deduction[employee.pay_frequency][employee.ca_filing_status];
      const caTaxableIncome = Math.max(0, money(wagesSubjectToWithholding - standardDeduction));
      const rateTableKey: 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD' =
        employee.ca_filing_status === 'HEAD_OF_HOUSEHOLD'
          ? 'HEAD_OF_HOUSEHOLD'
          : employee.ca_filing_status === 'SINGLE'
            ? 'SINGLE'
            : 'MARRIED';
      const computedTax = bracketLookup(caTaxableIncome, p.california.rate_tables[employee.pay_frequency][rateTableKey]);
      const exemptionCredit = money(employee.ca_regular_allowances * p.california.exemption_allowance_credit_per_allowance[employee.pay_frequency]);
      caIncomeTax = Math.max(0, money(computedTax - exemptionCredit));
    }

    // --- California SDI (employee only, uncapped) ---
    const caSdi = money(grossPay * p.california.sdi_rate);

    const employeeTaxTotal = money(
      federalIncomeTax + employeeSocialSecurity + employeeMedicare + employeeAdditionalMedicare + caIncomeTax + caSdi
    );
    const netPay = money(grossPay - employeeTaxTotal);
    const employerPayrollTaxTotal = money(employerSocialSecurity + employerMedicare + employerFuta);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      federal_income_tax: federalIncomeTax,
      employee_social_security: employeeSocialSecurity,
      employer_social_security: employerSocialSecurity,
      employee_medicare: employeeMedicare,
      employer_medicare: employerMedicare,
      employee_additional_medicare: employeeAdditionalMedicare,
      employer_futa: employerFuta,
      ca_income_tax: caIncomeTax,
      ca_sdi: caSdi,
      net_pay: netPay,
      employer_cost_total: money(grossPay + employerPayrollTaxTotal),
      ytd_ss_wages_after: money(ytdSsBefore + Math.min(grossPay, Math.max(0, p.fica.social_security_wage_base_annual - ytdSsBefore))),
      ytd_medicare_wages_after: medicareYtdAfter,
      ytd_futa_wages_after: money(ytdFutaBefore + Math.min(grossPay, Math.max(0, p.futa.wage_base_annual - ytdFutaBefore)))
    };
  });

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    federal_income_tax: sum(employees.map(e => e.federal_income_tax)),
    fica_employee: sum(employees.map(e => money(e.employee_social_security + e.employee_medicare + e.employee_additional_medicare))),
    fica_employer: sum(employees.map(e => money(e.employer_social_security + e.employer_medicare))),
    futa: sum(employees.map(e => e.employer_futa)),
    ca_income_tax: sum(employees.map(e => e.ca_income_tax)),
    ca_sdi: sum(employees.map(e => e.ca_sdi)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_cost_total: sum(employees.map(e => e.employer_cost_total))
  };

  const journal: UsJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_PAYROLL_TAX_EXPENSE', amount: money(totals.fica_employer + totals.futa) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'FEDERAL_INCOME_TAX_PAYABLE', amount: totals.federal_income_tax },
    { side: 'CREDIT', account_role: 'FICA_PAYABLE', amount: money(totals.fica_employee + totals.fica_employer) },
    { side: 'CREDIT', account_role: 'FUTA_PAYABLE', amount: totals.futa },
    { side: 'CREDIT', account_role: 'CA_INCOME_TAX_PAYABLE', amount: totals.ca_income_tax },
    { side: 'CREDIT', account_role: 'CA_SDI_PAYABLE', amount: totals.ca_sdi }
  ].filter(line => line.amount !== 0) as UsJournalLine[];

  const journalDebits = sum(journal.filter(l => l.side === 'DEBIT').map(l => l.amount));
  const journalCredits = sum(journal.filter(l => l.side === 'CREDIT').map(l => l.amount));

  return {
    rule_pack_id: p.id,
    country_code: 'US',
    currency: 'USD',
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
    limitations: [...p.limitations]
  };
}

export function payrollEngineSelfTestUS() {
  const p = PAYROLL_RULE_PACK_US;

  // Case 1: single filer, biweekly, no allowances, well under all ceilings.
  // Verified by hand against the 2026 Pub 15-T biweekly-equivalent (via the
  // annual STANDARD Single/MFS table) and the 2026 EDD Method B biweekly
  // Single table.
  const sample = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-14',
    pay_date: '2026-08-14',
    employees: [
      {
        employee_id: 'E001',
        gross_pay: 2000,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 20000,
        ytd_medicare_wages_before: 20000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 1
      }
    ]
  });
  const s1 = sample.employees[0];
  // FICA: SS = 2000*6.2% = 124.00 (both sides); Medicare = 2000*1.45% = 29.00 (both sides).
  const expectedSs = 124.0;
  const expectedMedicare = 29.0;
  // FUTA: ytd already at the $7,000 ceiling -> $0 this period.
  const expectedFuta = 0;
  // Federal: annualized wage = 2000*26 = 52000; step2 not checked -> subtract 8600 -> 43400.
  // STANDARD Single/MFS bracket 19900-57900 (12%): 1240 + 12%*(43400-19900) = 1240+2820 = 4060.00 annual -> /26 = 156.1538 -> 156.15.
  const expectedFederal = 156.15;
  // CA: gross 2000 > weekly... wait BIWEEKLY low-income exemption Single = 727, gross 2000 > 727 so taxable.
  // No estimated deduction allowances. Standard deduction (biweekly, single) = 219 -> taxable = 2000-219 = 1781.
  // BIWEEKLY Single bracket: 1010-1594 -> no, 1781 falls in [1594,2214) actually check: brackets 1010,1594,2214...
  // row for 1781: at least 1594, base 43.24, rate 6.6% -> 43.24 + 0.066*(1781-1594) = 43.24 + 12.342 = 55.582 -> 55.58
  // credit: 1 allowance * 6.47 = 6.47 -> 55.58-6.47 = 49.11
  const expectedCa = 49.11;
  const expectedSdi = money(2000 * 0.013);

  // Case 2: married filing jointly, monthly, Step 2 checkbox checked, crossing the SS wage base mid-period.
  const ssCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E002',
        gross_pay: 20000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: true,
        ytd_ss_wages_before: 180000,
        ytd_medicare_wages_before: 180000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'MARRIED_2_OR_MORE',
        ca_regular_allowances: 2
      }
    ]
  });
  const s2 = ssCase.employees[0];
  const expectedSsRoom = money((184500 - 180000) * 0.062); // room to ceiling = 4500 -> 279.00
  // Additional Medicare: ytd 180000+20000=200000, threshold 200000 -> extra = max(0,200000-200000)=0.
  const expectedAdditionalMedicare = 0;

  // Case 3: Additional Medicare Tax actually triggers mid-period.
  const addlMedicareCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E003',
        gross_pay: 20000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 200000,
        ytd_medicare_wages_before: 195000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s3 = addlMedicareCase.employees[0];
  // ytd_medicare_before 195000 + 20000 = 215000; threshold 200000 -> extra = 215000-200000=15000 -> *0.9%=135.00
  const expectedAddlMedicare3 = money(15000 * 0.009);
  // SS already at/above ceiling (200000 >= 184500) -> $0 employee/employer SS this period.

  const ok =
    s1.employee_social_security === expectedSs &&
    s1.employer_social_security === expectedSs &&
    s1.employee_medicare === expectedMedicare &&
    s1.employer_futa === expectedFuta &&
    s1.federal_income_tax === expectedFederal &&
    s1.ca_income_tax === expectedCa &&
    s1.ca_sdi === expectedSdi &&
    sample.controls.journal_balanced &&
    s2.employee_social_security === expectedSsRoom &&
    s2.employer_social_security === expectedSsRoom &&
    s2.employee_additional_medicare === expectedAdditionalMedicare &&
    ssCase.controls.journal_balanced &&
    s3.employee_social_security === 0 &&
    s3.employer_social_security === 0 &&
    s3.employee_additional_medicare === expectedAddlMedicare3 &&
    addlMedicareCase.controls.journal_balanced;

  return {
    ok,
    sample,
    ssCase,
    addlMedicareCase,
    expected: { expectedSs, expectedMedicare, expectedFuta, expectedFederal, expectedCa, expectedSdi, expectedSsRoom, expectedAdditionalMedicare, expectedAddlMedicare3 }
  };
}
