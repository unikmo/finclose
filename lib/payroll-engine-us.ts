// United States (US) payroll rule pack — v5: federal + 17 states (CA, NJ,
// NY incl. NYC/Yonkers, IL, PA, MI, CO, AZ, AK, WA, FL, NV, NH, SD, TN, TX, WY).
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
//      against the current-year EDD publication,
//   5. the New Jersey withholding rate tables (NJ-WT) and the UI/Workforce
//      Development/SWF, TDI, and FLI employee rates against the current-year
//      NJ Division of Taxation and NJDOL publications,
//   6. the New York, NYC, and Yonkers withholding rate tables (NYS-50-T-NYS/
//      NYC/Y) against the current-year NYS Department of Taxation and
//      Finance publications,
//   7. the IL/PA/MI/CO/AZ/AK/WA figures added in v5 against each state's
//      OWN primary publication — these seven were sourced from a secondary
//      cross-check reference document, not independently fetched the way
//      CA/NJ/NY were, and carry materially lower confidence as a result
//      (see the v5 change log and limitations for specifics).
// These figures change every year, several of them (SS wage base, CA SDI
// rate, FUTA credit reductions, NJ's UI/TDI/FLI rates) finalized only late
// in the prior year or even during the current year. This file uses figures
// sourced via AI web research (not a professional review) as of September
// 2026.
//
// v6 change log (from v5): adds NY Paid Family Leave (PFL, unconditional
// for every NY employee, 0.432% of gross wages) and NY Disability Benefits
// Law (DBL, opt-in only, WEEKLY-pay-only). Both were explicitly flagged as
// unimplemented gaps in v4/v5's own limitations list; a user-supplied
// second-generation "formula pack" document (derived from the same
// secondary reference already cited in v5, but distilling it into
// code-ready equations) supplied the complete formula for both, so the gap
// is now closed rather than merely flagged. PFL introduces a genuinely new
// primitive to this file — capTax(rawTax, ytdTaxBefore, annualCap), which
// caps the computed TAX amount against a cumulative annual DOLLAR figure,
// as opposed to every other capped tax in this file (ceilingContribution),
// which caps the taxable WAGE base before applying a rate. NY PFL's
// published cap is a flat dollar figure the state sets independently each
// year, not (rate × some wage base), so the two helpers are genuinely not
// interchangeable — using ceilingContribution for PFL would have been
// wrong. The same formula-pack document independently corroborated this
// file's existing NJ, AZ, CO, PA, AK, WA, and CA SDI figures with no
// discrepancies found, which is a meaningful secondary confirmation for the
// v5 states, even though it derives from the same original reference
// rather than being a fully independent source.
//
// v5 change log (from v4): adds 14 more states — IL, PA, MI, CO, AZ (each
// with a real, if simple, withholding FORMULA), AK and WA (no state income
// tax, but each has a real statutory EMPLOYEE-paid payroll levy: AK
// unemployment insurance, WA Paid Family & Medical Leave + WA Cares), and
// FL/NV/NH/SD/TN/TX/WY (no state income tax AND no statewide employee
// payroll levy of any kind — nothing to compute beyond the existing
// state-agnostic federal FICA/FUTA layer). This is the largest scope jump
// yet, and unlike CA/NJ/NY it draws on a SECONDARY reference document the
// user supplied rather than each state's own primary publication — flagged
// explicitly in evidence/limitations as lower-confidence than CA/NJ/NY, not
// silently treated as equally verified. Deliberately EXCLUDED this pass,
// even though a headline rate exists in the reference: Indiana, whose real
// withholding formula needs a personal/dependent exemption figure the
// reference doesn't supply — applying the headline 2.95% to full gross
// would overstate withholding, so it was rejected rather than
// approximated, the same fail-closed principle used throughout this file.
// The other 32 non-CA/NJ/NY/IL/PA/MI/CO/AZ/AK/WA/no-tax states all need
// their own official-table fetch-and-build pass, the same way CA/NJ/NY
// were each built — none of them had a usable complete formula in the
// reference document, only a pointer to "use the official 20XX tables."
//
// v4 change log (from v3): adds New York (state income tax, NYC resident
// tax, Yonkers resident surcharge / nonresident earnings tax) as a third
// supported state — the most structurally complex of the three states
// scoped after CA, built last of the three deliberately (see v3's own note
// below on why NJ went first). NY layers up to three separate income-tax
// withholding lines on top of federal, each with its own deduction table
// and bracket schedule: NY State tax (always), NYC resident tax (opt-in via
// ny_nyc_resident), and either the Yonkers RESIDENT surcharge (opt-in via
// ny_yonkers_resident — computed as 16.75% of the NY State tax amount per
// NYS-50-T-Y's own published method) or the Yonkers NONRESIDENT earnings
// tax (opt-in via ny_yonkers_nonresident_workplace — a flat 0.5% on wages
// above a small per-period exemption, for employees who work in Yonkers but
// live elsewhere). A real implementation trap encountered and fixed during
// this build: NY State, NYC, and Yonkers do NOT all share one deduction
// table — NY State and Yonkers publish identical deduction tables, but NYC's
// own table uses a materially lower deduction base (its per-allowance
// exemption value is identical, only the flat deduction differs). Treating
// all three as one shared table silently understated the NYC tax by
// several dollars per pay period until caught by comparing against the
// NYS-50-T-NYC publication's own worked example. Pre-tax deduction handling
// was NOT extended to NY this pass, for the same reason as NJ (see below).
//
// v3 change log (from v2): adds New Jersey as a second supported state.
// Scoped narrowly and deliberately ahead of NY in build order — the
// NY-Newark-Jersey City metro area is the single largest concentration of
// small businesses of any US metro, and NJ has no jurisdiction-lookup
// complexity (unlike NY, built next in v4: NY layers NYC and Yonkers local
// taxes on top of state tax; MD, still planned, requires a 24-county rate
// lookup by employee residence). NJ instead layers FOUR separate withholding
// lines on top of federal: its own state income tax (NJ-W4 Rate Tables A/B,
// not the federal W-4 shape — NJ never adopted the federal form), plus three
// employee-paid statutory contributions with their own rates and wage bases
// (UI/Workforce Development/Supplemental Workforce Fund, Temporary
// Disability Insurance, Family Leave Insurance). Pre-tax deduction handling
// (401(k)/Section 125) was NOT extended to NJ this pass — NJ's treatment of
// those wage bases wasn't independently verified, so NJ employees with
// either pretax field set are rejected rather than silently computed on the
// wrong wage base. See limitations for what else is explicitly out of scope
// (Rate Tables C/D/E, the Newark employer payroll tax, NJ/PA reciprocity).
//
// v2 change log (from v1, driven by review against two real-shaped sample
// payslips — see the PR for details):
//   - Pre-tax deductions are now modeled, with the two federally-distinct
//     categories kept separate rather than lumped together, because they are
//     NOT taxed the same way:
//       * `pretax_401k_deferral` (traditional 401(k)/403(b) elective
//         deferral): excluded from federal and CA INCOME tax wages, but
//         still fully subject to FICA (Social Security + Medicare) and FUTA
//         — per IRC §3121(a)(5)(D), elective deferrals are wages for FICA
//         purposes even though they're excluded from income tax wages.
//       * `pretax_section125_deduction` (cafeteria-plan health/dental/vision
//         premiums, health/dependent-care FSA contributions): excluded from
//         federal income tax wages, CA income tax wages, FICA wages, FUTA
//         wages, AND CA SDI wages — per IRC §125, a properly-elected
//         cafeteria-plan deduction is excluded from the FICA/FUTA wage base
//         entirely, unlike a 401(k) deferral.
//     Validated against a real-shaped sample payslip whose FICA figures
//     matched this engine exactly on the FULL gross despite the payslip
//     also showing 401(k) and health-insurance deductions — consistent with
//     the 401(k)-only-reduces-income-tax-wages rule (that payslip's health
//     deduction evidently wasn't also excluded from its own FICA
//     calculation, which is a discrepancy in that sample, not in this
//     engine's law-following behavior; see the PR for the full comparison).
//
// Scope, deliberately narrow (rejected, not approximated):
//   - Only 17 states are supported: CA, NJ, NY, IL, PA, MI, CO, AZ, AK, WA,
//     and the 7 states with neither a state income tax nor any statewide
//     employee payroll levy (FL, NV, NH, SD, TN, TX, WY). Every other US
//     state is rejected until built and validated individually — "no
//     income tax" still leaves SUI/SDI/local
//     nuances unverified here.
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
//   - Only two pre-tax deduction categories are modeled: traditional
//     401(k)/403(b) elective deferrals and Section 125 cafeteria-plan
//     deductions (see the v2 change log above for how each is taxed
//     differently). Not modeled: Roth 401(k)/403(b) contributions (fully
//     taxable, same as regular wages — caller should simply not pass them
//     as a pretax field), HSA contributions (excluded like Section 125 in
//     most cases, but with employer-vs-employee and state-conformity
//     nuances not implemented here), and annual IRS contribution-limit
//     enforcement for any of these (the caller is responsible for not
//     passing an amount that would exceed the employee's actual annual
//     limit; this engine does not track or cap it).
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
// Table, EDD 2026 Method B, NJ-WT, and NYS-50-T-NYS/NYC/Y rate table figures
// cited in evidence below — the NY/NYC/Yonkers cases are checked directly
// against the worked examples published in those three official NYS
// documents, not just hand-derived from the bracket tables. CA is
// additionally validated against two real-shaped sample payslips (see the
// v2 change log and the PR history). Neither NJ nor NY has yet been checked
// against a real payslip — flagged explicitly as a gap, the same way CA's
// v1 lacked real-payslip validation before its own review pass.

export type UsPayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
export type UsFederalFilingStatus = 'SINGLE_MFS' | 'MFJ' | 'HOH';
export type UsCaFilingStatus = 'SINGLE' | 'MARRIED_0_OR_1' | 'MARRIED_2_OR_MORE' | 'HEAD_OF_HOUSEHOLD';
export type UsState =
  | 'CA' | 'NJ' | 'NY'
  | 'IL' | 'PA' | 'MI' | 'CO' | 'AZ'
  | 'AK' | 'WA'
  | 'FL' | 'NV' | 'NH' | 'SD' | 'TN' | 'TX' | 'WY';
export type NjRateTable = 'A' | 'B';
export type NyFilingStatus = 'SINGLE' | 'MARRIED';
export type CoFilingStatus = 'MFJ_OR_QSS' | 'OTHER';
export type AzElectionPercent = 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5;

export type UsEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pretax_401k_deferral?: number;
  pretax_section125_deduction?: number;
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
  state: UsState;
  // CA fields — required when state === 'CA'.
  ca_filing_status?: UsCaFilingStatus;
  ca_regular_allowances?: number;
  ca_estimated_deduction_allowances?: number;
  // NJ fields — required when state === 'NJ'.
  nj_rate_table?: NjRateTable;
  nj_allowances?: number;
  ytd_nj_ui_wf_wages_before?: number;
  ytd_nj_tdi_fli_wages_before?: number;
  // NY fields — required when state === 'NY'.
  ny_filing_status?: NyFilingStatus;
  ny_allowances?: number;
  // NYC and Yonkers resident status are independent of ny_filing_status —
  // an NY employee may be an NYC resident, a Yonkers resident, neither, or
  // (rarely, e.g. remote-work edge cases) working in Yonkers while resident
  // elsewhere in NY (Yonkers nonresident earnings tax).
  ny_nyc_resident?: boolean;
  ny_yonkers_resident?: boolean;
  ny_yonkers_nonresident_workplace?: boolean;
  // NY Paid Family Leave: always applies to NY employees (no opt-out) at a
  // flat rate up to a cumulative ANNUAL DOLLAR cap (not a wage-base cap).
  ytd_ny_pfl_tax_before?: number;
  // NY Disability Benefits Law: opt-in only (employer elects to deduct it),
  // and only supported for WEEKLY pay — the statute caps it per calendar
  // week, which has no clean equivalent for biweekly/semimonthly/monthly
  // periods, so those are rejected rather than approximated.
  ny_dbl_opt_in?: boolean;
  // IL fields — required when state === 'IL'.
  il_line1_allowances?: number;
  il_line2_allowances?: number;
  il_extra_per_period?: number;
  // PA fields — none required; PA withholding is a flat rate on gross pay.
  // MI fields — required when state === 'MI'.
  mi_personal_exemptions?: number;
  // CO fields — required when state === 'CO'.
  co_filing_status?: CoFilingStatus;
  co_dr0004_line2_annual_override?: number;
  co_dr0004_line3_extra_per_period?: number;
  ytd_co_famli_wages_before?: number;
  // AZ fields — required when state === 'AZ'.
  az_election_percent?: AzElectionPercent;
  // AK fields — none required beyond gross pay; AK employee UI applies to
  // every AK employee at a flat statutory rate.
  ytd_ak_ui_wages_before?: number;
  // WA fields — none required beyond gross pay; WA PFML and WA Cares apply
  // to every WA employee at flat statutory rates (small-employer/approved-
  // exemption nuances are not modeled — see limitations).
  ytd_wa_pfml_wages_before?: number;
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
    | 'CA_SDI_PAYABLE'
    | 'NJ_INCOME_TAX_PAYABLE'
    | 'NJ_UI_WF_SWF_PAYABLE'
    | 'NJ_TDI_PAYABLE'
    | 'NJ_FLI_PAYABLE'
    | 'NY_INCOME_TAX_PAYABLE'
    | 'NYC_INCOME_TAX_PAYABLE'
    | 'YONKERS_TAX_PAYABLE'
    | 'NY_PFL_PAYABLE'
    | 'NY_DBL_PAYABLE'
    | 'IL_INCOME_TAX_PAYABLE'
    | 'PA_INCOME_TAX_PAYABLE'
    | 'PA_UC_PAYABLE'
    | 'MI_INCOME_TAX_PAYABLE'
    | 'CO_INCOME_TAX_PAYABLE'
    | 'CO_FAMLI_PAYABLE'
    | 'AZ_INCOME_TAX_PAYABLE'
    | 'AK_UI_PAYABLE'
    | 'WA_PFML_PAYABLE'
    | 'WA_CARES_PAYABLE'
    | 'EMPLOYEE_PRETAX_DEDUCTIONS_PAYABLE';
  amount: number;
};

export type UsEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pretax_401k_deferral: number;
  pretax_section125_deduction: number;
  federal_taxable_wages: number;
  fica_and_futa_wages: number;
  federal_income_tax: number;
  employee_social_security: number;
  employer_social_security: number;
  employee_medicare: number;
  employer_medicare: number;
  employee_additional_medicare: number;
  employer_futa: number;
  ca_income_tax: number;
  ca_sdi: number;
  nj_income_tax: number;
  nj_ui_wf_swf: number;
  nj_tdi: number;
  nj_fli: number;
  ny_income_tax: number;
  nyc_income_tax: number;
  yonkers_tax: number;
  ny_pfl: number;
  ny_dbl: number;
  il_income_tax: number;
  pa_income_tax: number;
  pa_uc: number;
  mi_income_tax: number;
  co_income_tax: number;
  co_famli: number;
  az_income_tax: number;
  ak_ui: number;
  wa_pfml: number;
  wa_cares: number;
  net_pay: number;
  employer_cost_total: number;
  ytd_ss_wages_after: number;
  ytd_medicare_wages_after: number;
  ytd_futa_wages_after: number;
  ytd_nj_ui_wf_wages_after: number;
  ytd_nj_tdi_fli_wages_after: number;
  ytd_co_famli_wages_after: number;
  ytd_ak_ui_wages_after: number;
  ytd_wa_pfml_wages_after: number;
  ytd_ny_pfl_tax_after: number;
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
    nj_income_tax: number;
    nj_ui_wf_swf: number;
    nj_tdi: number;
    nj_fli: number;
    ny_income_tax: number;
    nyc_income_tax: number;
    yonkers_tax: number;
    ny_pfl: number;
    ny_dbl: number;
    il_income_tax: number;
    pa_income_tax: number;
    pa_uc: number;
    mi_income_tax: number;
    co_income_tax: number;
    co_famli: number;
    az_income_tax: number;
    ak_ui: number;
    wa_pfml: number;
    wa_cares: number;
    pretax_deductions: number;
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
  id: 'US-17-STATES-2026-FEDERAL-PERCENTAGE-METHOD-DRAFT-V6',
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
  new_jersey: {
    // Employee-paid statutory deductions, 2026 rates (NJDOL benefit-rate
    // announcement, Dec 2025). Unemployment Insurance and Workforce/
    // Supplemental Workforce Fund share one combined rate and wage base;
    // Temporary Disability Insurance and Family Leave Insurance share a
    // separate, higher wage base.
    ui_wf_swf_rate: 0.00425,
    ui_wf_swf_wage_base_annual: 44800,
    tdi_rate: 0.0019,
    fli_rate: 0.0023,
    tdi_fli_wage_base_annual: 171100,
    // NJ-W4 Withholding Allowance Value Table (per payroll period), unchanged
    // since the NJ-WT percentage-method tables took effect Oct 1, 2020 — NJ's
    // brackets and allowance values are set by statute, not annually
    // inflation-indexed like federal/CA, so this remains the current figure.
    allowance_value_per_period: { WEEKLY: 19.2, BIWEEKLY: 38.4, SEMIMONTHLY: 41.6, MONTHLY: 83.3 } as Record<UsPayFrequency, number>,
    // NJ-WT Rate Tables A and B (percentage method), by payroll period.
    // Brackets: [over, base, rate]. Rate A: NJ-W4 filing status Single or
    // Married/CU Partner Separate (box 1 or 3). Rate B: Married/CU Couple
    // Joint, Head of Household, or Qualifying Widow(er) (box 2, 4, or 5)
    // when the employee has not elected a different table on line 3.
    // Rate Tables C, D, and E (elective, chosen via the NJ-W4 wage chart for
    // dual-income households) are NOT implemented — see limitations.
    rate_tables: {
      WEEKLY: {
        A: [[0, 0, 0.015], [385, 5.77, 0.02], [673, 11.54, 0.039], [769, 15.29, 0.061], [1442, 56.35, 0.07], [9615, 628.46, 0.099], [19231, 1580.38, 0.118]],
        B: [[0, 0, 0.015], [385, 5.77, 0.02], [962, 17.31, 0.027], [1346, 27.69, 0.039], [1538, 35.19, 0.061], [2885, 117.31, 0.07], [9615, 588.46, 0.099], [19231, 1540.38, 0.118]]
      },
      BIWEEKLY: {
        A: [[0, 0, 0.015], [769, 12.0, 0.02], [1346, 23.0, 0.039], [1538, 31.0, 0.061], [2885, 113.0, 0.07], [19231, 1257.0, 0.099], [38462, 3161.0, 0.118]],
        B: [[0, 0, 0.015], [769, 12.0, 0.02], [1923, 35.0, 0.027], [2692, 55.0, 0.039], [3077, 70.0, 0.061], [5769, 235.0, 0.07], [19231, 1177.0, 0.099], [38462, 3081.0, 0.118]]
      },
      SEMIMONTHLY: {
        A: [[0, 0, 0.015], [833, 13.0, 0.02], [1458, 25.0, 0.039], [1667, 33.0, 0.061], [3125, 122.0, 0.07], [20833, 1362.0, 0.099], [41667, 3424.0, 0.118]],
        B: [[0, 0, 0.015], [833, 12.5, 0.02], [2083, 37.5, 0.027], [2917, 59.99, 0.039], [3333, 76.25, 0.061], [6250, 254.19, 0.07], [20833, 1275.0, 0.099], [41667, 3338.0, 0.118]]
      },
      MONTHLY: {
        A: [[0, 0, 0.015], [1667, 25.0, 0.02], [2917, 50.0, 0.039], [3333, 66.0, 0.061], [6250, 244.0, 0.07], [41667, 2723.0, 0.099], [83333, 6848.0, 0.118]],
        B: [[0, 0, 0.015], [1667, 25.0, 0.02], [4167, 75.0, 0.027], [5833, 120.0, 0.039], [6667, 153.0, 0.061], [12500, 508.0, 0.07], [41667, 2550.0, 0.099], [83333, 6675.0, 0.118]]
      }
    } as Record<UsPayFrequency, Record<NjRateTable, Array<[number, number, number]>>>
  },
  new_york: {
    // NY-WT Special Tables for Deduction and Exemption Allowances (Table B:
    // per-period deduction by filing status; Table C: value of one exemption
    // by period). Yonkers (NYS-50-T-Y Table A) publishes the SAME deduction
    // table as NY State (confirmed identical figures in both publications)
    // — but NYC's own Table A (NYS-50-T-NYC) uses a materially LOWER
    // deduction base than NY State/Yonkers, even though the per-allowance
    // exemption value (Table C) is identical across all three. Do not
    // conflate the NY State/Yonkers deduction table with NYC's.
    deduction_per_period: { WEEKLY: 142.3, BIWEEKLY: 284.6, SEMIMONTHLY: 308.35, MONTHLY: 616.7 } as Record<UsPayFrequency, number>,
    deduction_per_period_married: { WEEKLY: 152.9, BIWEEKLY: 305.8, SEMIMONTHLY: 331.25, MONTHLY: 662.5 } as Record<UsPayFrequency, number>,
    nyc_deduction_per_period: { WEEKLY: 96.15, BIWEEKLY: 192.3, SEMIMONTHLY: 208.35, MONTHLY: 416.7 } as Record<UsPayFrequency, number>,
    nyc_deduction_per_period_married: { WEEKLY: 105.75, BIWEEKLY: 211.5, SEMIMONTHLY: 229.15, MONTHLY: 458.3 } as Record<UsPayFrequency, number>,
    exemption_per_allowance: { WEEKLY: 19.25, BIWEEKLY: 38.5, SEMIMONTHLY: 41.65, MONTHLY: 83.3 } as Record<UsPayFrequency, number>,
    // NYS-50-T-NYS (1/26) Method II Exact Calculation Method, Tables II-A/B/C/D.
    // Brackets: [atLeast net wages, base, rate]. Valid up to the "Method III
    // Top Income Tax Rates" cutover (~$20-41k/period depending on period and
    // status) — not implemented; see limitations.
    state_rate_tables: {
      WEEKLY: {
        SINGLE: [[0, 0, 0.039], [163, 6.38, 0.044], [225, 9.08, 0.0515], [267, 11.27, 0.054], [1551, 80.58, 0.059], [1862, 98.9, 0.0703], [2070, 113.58, 0.0753], [3032, 186.02, 0.064], [4142, 257.1, 0.1144], [5104, 367.13, 0.0735]],
        MARRIED: [[0, 0, 0.039], [163, 6.38, 0.044], [225, 9.08, 0.0515], [267, 11.27, 0.054], [1551, 80.58, 0.059], [1862, 98.9, 0.0657], [2070, 112.6, 0.0707], [3032, 180.54, 0.0801], [4068, 263.62, 0.064], [6215, 401.04, 0.1349], [7177, 530.77, 0.0735], [20722, 1526.33, 0.0765]]
      },
      BIWEEKLY: {
        SINGLE: [[0, 0, 0.039], [327, 12.77, 0.044], [450, 18.15, 0.0515], [535, 22.54, 0.054], [3102, 161.15, 0.059], [3723, 197.81, 0.0703], [4140, 227.15, 0.0753], [6063, 372.04, 0.064], [8285, 514.19, 0.1144], [10208, 734.27, 0.0735]],
        MARRIED: [[0, 0, 0.039], [327, 12.77, 0.044], [450, 18.15, 0.0515], [535, 22.54, 0.054], [3102, 161.15, 0.059], [3723, 197.81, 0.0657], [4140, 225.19, 0.0707], [6063, 361.08, 0.0801], [8137, 527.23, 0.064], [12431, 802.08, 0.1349], [14354, 1061.54, 0.0735], [41444, 3052.65, 0.0765]]
      },
      SEMIMONTHLY: {
        SINGLE: [[0, 0, 0.039], [354, 13.83, 0.044], [488, 19.67, 0.0515], [579, 24.42, 0.054], [3360, 174.58, 0.059], [4033, 214.29, 0.0703], [4485, 246.08, 0.0753], [6569, 403.04, 0.064], [8975, 557.04, 0.1144], [11058, 795.46, 0.0735]],
        MARRIED: [[0, 0, 0.039], [354, 13.83, 0.044], [488, 19.67, 0.0515], [579, 24.42, 0.054], [3360, 174.58, 0.059], [4033, 214.29, 0.0657], [4485, 243.96, 0.0707], [6569, 391.17, 0.0801], [8815, 571.17, 0.064], [13467, 868.92, 0.1349], [15550, 1150.0, 0.0735], [44898, 3307.04, 0.0765]]
      },
      MONTHLY: {
        SINGLE: [[0, 0, 0.039], [708, 27.67, 0.044], [975, 39.33, 0.0515], [1158, 48.83, 0.054], [6721, 349.17, 0.059], [8067, 428.58, 0.0703], [8971, 492.17, 0.0753], [13138, 806.08, 0.064], [17950, 1114.08, 0.1144], [22117, 1590.92, 0.0735]],
        MARRIED: [[0, 0, 0.039], [708, 27.67, 0.044], [975, 39.33, 0.0515], [1158, 48.83, 0.054], [6721, 349.17, 0.059], [8067, 428.58, 0.0657], [8971, 487.92, 0.0707], [13138, 782.33, 0.0801], [17629, 1142.33, 0.064], [26933, 1737.83, 0.1349], [31100, 2300.0, 0.0735], [89796, 6614.08, 0.0765]]
      }
    } as Record<UsPayFrequency, Record<NyFilingStatus, Array<[number, number, number]>>>,
    // Net-wage threshold at which NYS-50-T-NYS says "Use Method III, Top
    // Income Tax Rates Method" instead of the exact-calculation table above.
    // Method III is NOT implemented — net wages at or above this threshold
    // are rejected rather than mis-taxed at the top exact-calc bracket rate
    // indefinitely (irrelevant for this pack's small-business target
    // segment in practice, but rejected explicitly per this file's
    // fail-closed convention).
    state_method_iii_threshold: {
      WEEKLY: { SINGLE: 20722, MARRIED: 41449 },
      BIWEEKLY: { SINGLE: 41444, MARRIED: 82898 },
      SEMIMONTHLY: { SINGLE: 44898, MARRIED: 89806 },
      MONTHLY: { SINGLE: 89796, MARRIED: 179613 }
    } as Record<UsPayFrequency, Record<NyFilingStatus, number>>,
    // NYS-50-T-NYC (1/26) Method II, Tables II-A/B/C/D. Identical bracket
    // structure for Single and Married filing status (NYC's own table
    // publishes the same rates/thresholds for both) — only the deduction
    // amount from Table A above differs by filing status.
    nyc_rate_table: {
      WEEKLY: [[0, 0, 0.0205], [154, 3.15, 0.028], [167, 3.54, 0.0325], [288, 7.46, 0.0395], [481, 15.06, 0.0415], [1154, 43.0, 0.0425]],
      BIWEEKLY: [[0, 0, 0.0205], [308, 6.31, 0.028], [334, 7.08, 0.0325], [577, 14.92, 0.0395], [962, 30.12, 0.0415], [2308, 86.0, 0.0425]],
      SEMIMONTHLY: [[0, 0, 0.0205], [333, 6.83, 0.028], [362, 7.67, 0.0325], [625, 16.17, 0.0395], [1042, 32.63, 0.0415], [2500, 93.17, 0.0425]],
      MONTHLY: [[0, 0, 0.0205], [667, 13.67, 0.028], [725, 15.33, 0.0325], [1250, 32.33, 0.0395], [2083, 65.25, 0.0415], [5000, 186.33, 0.0425]]
    } as Record<UsPayFrequency, Array<[number, number, number]>>,
    // NYS-50-T-Y (1/26): the Yonkers RESIDENT surcharge is 16.75% of the NY
    // State tax computed on the same net wages via the same state_rate_tables
    // brackets above (confirmed identical column values in the Yonkers
    // publication's own Method II tables) — so no separate Yonkers-resident
    // bracket table is needed, just this multiplier.
    yonkers_resident_surcharge_rate: 0.1675,
    // Yonkers NONRESIDENT earnings tax (Method VII): flat 0.50% of gross
    // wages after a per-period exemption; applies to employees who work in
    // Yonkers but live elsewhere. Brackets: [atLeast gross wages, exemption].
    yonkers_nonresident_rate: 0.005,
    yonkers_nonresident_exemption_tables: {
      WEEKLY: [[0, Infinity], [77, 58], [192, 38], [385, 19], [577, 0]],
      BIWEEKLY: [[0, Infinity], [154, 115], [385, 77], [769, 38], [1154, 0]],
      SEMIMONTHLY: [[0, Infinity], [167, 125], [417, 83], [833, 42], [1250, 0]],
      MONTHLY: [[0, Infinity], [333, 250], [833, 167], [1667, 83], [2500, 0]]
    } as Record<UsPayFrequency, Array<[number, number]>>,
    // NY Paid Family Leave (PFL): applies to every NY employee, no opt-out,
    // at a flat 0.432% of gross wages up to a cumulative ANNUAL DOLLAR cap
    // ($411.91 for 2026) — a dollar cap on the computed tax itself, not a
    // wage-base cap (see capTax vs ceilingContribution). Cross-verified via
    // a second-generation formula-pack document (v6 change log).
    pfl_rate: 0.00432,
    pfl_annual_dollar_cap: 411.91,
    // NY Disability Benefits Law (DBL): employer-elects-to-deduct only, and
    // the statute caps it PER CALENDAR WEEK ($0.60/week) — which has no
    // clean equivalent for biweekly/semimonthly/monthly pay, so this engine
    // only supports it for WEEKLY pay frequency; other frequencies with
    // ny_dbl_opt_in set are rejected rather than approximated.
    dbl_rate: 0.005,
    dbl_weekly_dollar_cap: 0.6
  },
  // --- v5: states sourced from a secondary cross-check reference (a
  // "2026 U.S. Payroll Tax Implementation Reference" document the user
  // supplied), not fetched directly from each state's own primary
  // publication the way CA/NJ/NY were. Only states where that reference
  // supplies a COMPLETE formula (not just a headline rate or a pointer to
  // an official table this engine doesn't have) are implemented here — see
  // the v5 change log at the top of this file and the limitations list for
  // which states were deliberately left out for exactly that reason.
  illinois: {
    // Flat 4.95% on wages after IL-W-4 allowances. 2026 annual allowance
    // amounts: $2,925 per Line 1 allowance (self/spouse), $1,000 per Line 2
    // allowance (dependents), prorated by pay period.
    rate: 0.0495,
    line1_allowance_annual: 2925,
    line2_allowance_annual: 1000
  },
  pennsylvania: {
    // Flat 3.07% of PA taxable compensation, no allowances. Employee UC
    // (Unemployment Compensation) contribution: flat 0.07% of gross wages,
    // no annual wage cap — a real, easy-to-miss EMPLOYEE-paid PA tax
    // distinct from employer-paid SUI.
    income_tax_rate: 0.0307,
    employee_uc_rate: 0.0007
  },
  michigan: {
    // Flat 4.25% on wages after the 2026 personal exemption ($5,900/year
    // per exemption), prorated by pay period. Local city income tax (many
    // MI cities impose one) is NOT modeled — see limitations.
    rate: 0.0425,
    personal_exemption_annual: 5900
  },
  colorado: {
    // DR 1098 percentage method: annualize wages, subtract the DR 0004
    // Line 2 amount (or the statutory default — $11,000 for MFJ/Qualifying
    // Surviving Spouse, $5,500 otherwise — if the employee hasn't filed a
    // DR 0004), multiply by 4.40%, divide by periods, add any DR 0004
    // Line 3 additional per-period withholding.
    rate: 0.044,
    default_subtraction_mfj_or_qss: 11000,
    default_subtraction_other: 5500,
    // FAMLI (Family and Medical Leave Insurance): employee share 0.44% of
    // covered wages up to the SSA wage base ($184,500 in 2026). Employer
    // share/small-employer rules are DYNAMIC and not modeled (employer-side
    // only, doesn't affect what's withheld from the employee).
    famli_employee_rate: 0.0044,
    famli_wage_base_annual: 184500
  },
  arizona: {
    // Form A-4 employee election: a flat percentage of Arizona taxable
    // wages, chosen by the employee from a fixed statutory set (no
    // allowance/bracket calculation at all). This engine requires the
    // caller to supply the employee's actual election rather than
    // defaulting to the statutory default of 2.0% for a timely-filed-A-4
    // employee — a wrong default is worse than a required field.
    valid_election_percents: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
  },
  alaska: {
    // No state income tax. Alaska is one of only three states (with NJ and
    // PA) where the EMPLOYEE also contributes to state unemployment
    // insurance, at a flat statutory rate, uncapped by employer experience
    // rating (the employer's own UI rate is separate and DYNAMIC).
    ui_employee_rate: 0.005,
    ui_wage_base_annual: 54200
  },
  washington: {
    // No state income tax. Two separate employee-paid statutory programs:
    // WA Paid Family & Medical Leave (PFML) — total premium 1.13% of wages
    // up to the SSA wage base ($184,500), of which the employee's fixed
    // statutory share is 71.43% (the remainder is an employer-side cost
    // subject to small-employer exemptions this engine doesn't model); and
    // WA Cares (long-term care) — a flat 0.58% employee contribution with
    // NO wage cap, subject to state-approved individual exemptions this
    // engine also doesn't model (see limitations).
    pfml_total_rate: 0.0113,
    pfml_employee_share_of_total: 0.7143,
    pfml_wage_base_annual: 184500,
    wa_cares_employee_rate: 0.0058
  },
  // States with genuinely no individual wage income tax AND no statewide
  // employee-paid payroll tax of any kind (unlike AK/WA above). Nothing to
  // compute for the employee beyond the state-agnostic federal FICA/FUTA
  // layer already handled elsewhere in this file.
  no_tax_no_employee_levy_states: ['FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY'] as UsState[],
  evidence: [
    { authority: 'Internal Revenue Service', instrument: 'Publication 15-T (2026), Federal Income Tax Withholding Methods, Section 1 — Percentage Method Tables for Automated Payroll Systems', url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
    { authority: 'Internal Revenue Service', instrument: 'Publication 926 / SSA 2026 wage base and Additional Medicare Tax rules (IRC 3102(f))', url: 'https://www.irs.gov/pub/irs-pdf/p926.pdf' },
    { authority: 'US Department of Labor / IRS Form 940 instructions', instrument: '2026 FUTA rate, wage base, and California credit-reduction status', url: 'https://www.irs.gov' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California Withholding Schedules — Method B, Exact Calculation Method', url: 'https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California State Disability Insurance (SDI) employee contribution rate', url: 'https://edd.ca.gov' },
    { authority: 'Internal Revenue Code', instrument: '§3121(a)(5)(D) — traditional 401(k)/403(b) elective deferrals remain wages for FICA purposes despite being excluded from income tax wages', url: 'https://www.irs.gov/publications/p15b' },
    { authority: 'Internal Revenue Code', instrument: '§125 — cafeteria-plan (Section 125) benefits properly elected are excluded from federal income tax wages, FICA wages, and FUTA wages', url: 'https://www.irs.gov/publications/p15b' },
    { authority: 'California Employment Development Department (EDD)', instrument: 'DE 231 series — California\'s wage-exclusion treatment (Subject Wages vs. PIT Wages) for 401(k) deferrals and cafeteria-plan benefits generally follows the federal treatment', url: 'https://edd.ca.gov' },
    { authority: 'New Jersey Division of Taxation', instrument: 'NJ-WT — New Jersey Income Tax Withholding Instructions and Rate Tables (percentage method, effective Oct 1, 2020, still current)', url: 'https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf' },
    { authority: 'New Jersey Department of Labor and Workforce Development', instrument: '2026 UI/Workforce Development/Supplemental Workforce Fund, Temporary Disability Insurance, and Family Leave Insurance employee rates and wage bases', url: 'https://www.nj.gov/labor/lwdhome/press/2025/20251229_newbenefitrates2026.shtml' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-NYS (1/26) — New York State Withholding Tax Tables and Methods', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-NYC (1/26) — New York City Withholding Tax Tables and Methods', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nyc.pdf' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-Y (1/26) — Yonkers Withholding Tax Tables and Methods (resident surcharge and nonresident earnings tax)', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_y.pdf' },
    { authority: 'Cross-check / secondary reference', instrument: '"2026 U.S. Payroll Tax Implementation Reference" (all-50-states developer baseline, verified through 2026-09-13, user-supplied) — used to independently corroborate the CA/NJ/NY figures already in this file (all of which were independently fetched from each state\'s own primary publication), AND as the DIRECT source for the IL/PA/MI/CO/AZ/AK/WA figures added in v5 below, since those five states\' own primary withholding-table publications were not independently fetched this pass. This is a materially weaker sourcing chain than CA/NJ/NY and is called out explicitly, not glossed over — see the v5 change log and limitations.', url: 'file: US_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-14)' },
    { authority: 'Colorado Department of Revenue', instrument: 'DR 1098 (2026) — the reference document reproduces its full percentage-method computation steps (not just a headline rate), which is why CO is implemented here despite not being independently primary-sourced', url: 'https://tax.colorado.gov/withholding-tax' },
    { authority: 'Illinois Department of Revenue', instrument: '2026 Illinois withholding tax formula — flat 4.95% and the IL-W-4 Line 1/Line 2 annual allowance amounts, as reproduced in the reference document', url: 'https://tax.illinois.gov/research/publications/pubs/illinois-withholding-tax-tables-booklet.html' },
    { authority: 'Michigan Department of Treasury', instrument: '2026 Michigan withholding rate (4.25%) and personal exemption amount ($5,900), as reproduced in the reference document', url: 'https://www.michigan.gov/taxes/business-taxes/withholding' },
    { authority: 'Pennsylvania Department of Revenue', instrument: '2026 Pennsylvania flat withholding rate (3.07%) and employee UC contribution rate (0.07%), as reproduced in the reference document', url: 'https://www.pa.gov/agencies/revenue/businesses/business-registration-and-info/withholding-tax' },
    { authority: 'Arizona Department of Revenue', instrument: 'Form A-4 (2026) employee percentage-election set, as reproduced in the reference document', url: 'https://azdor.gov/business/withholding-tax' },
    { authority: 'Alaska Department of Labor and Workforce Development', instrument: '2026 Alaska employee UI contribution rate (0.50%) and wage base ($54,200), as reproduced in the reference document', url: 'https://labor.alaska.gov/estax/home.htm' },
    { authority: 'Washington Employment Security Department / WA Cares Fund', instrument: '2026 WA PFML total premium/employee-share and WA Cares employee rate, as reproduced in the reference document', url: 'https://paidleave.wa.gov/employers/' },
    { authority: 'New York State Paid Family Leave', instrument: '2026 NY PFL employee rate (0.432%) and annual dollar cap ($411.91), and NY DBL employee rate (0.5%) and weekly dollar cap ($0.60) — sourced from a second-generation "formula pack" cross-check document (2026_US_Payroll_Formula_Implementation_Guide.pdf, user-supplied 2026-09-14) that itself derives from the same secondary reference above, independently corroborating this file\'s NJ/AZ/CO/PA/AK/WA/CA-SDI figures in the process', url: 'https://paidfamilyleave.ny.gov/cost' }
  ],
  limitations: [
    'Supported states: CA, NJ, NY, IL, PA, MI, CO, AZ, AK, WA, and the 7 no-income-tax/no-employee-levy states (FL, NV, NH, SD, TN, TX, WY) — 17 states total. The remaining 33 states plus DC are rejected pending an official-table build for each: AL, AR, CT, DE, GA, HI, IA, ID, IN, KS, KY, LA, MD, MA, MN, MS, MO, MT, NE, NM, NC, ND, OH, OK, OR, RI, SC, UT, VT, VA, WI, WV, DC. Several of these (IN, GA, KY, NC — all flat- or near-flat-rate states) look deceptively simple from a headline rate alone, but this engine\'s own experience building CA/NJ/NY is that the actual withholding formula always has an allowance/deduction/exemption structure a headline rate doesn\'t capture (see the IN note below for a concrete example of exactly this trap being avoided rather than walked into).',
    'Indiana was deliberately NOT added despite the secondary reference giving a headline state rate (2.95%), because that reference does not give the actual personal/dependent exemption amounts Indiana\'s real withholding formula subtracts before applying the rate — applying 2.95% to full gross would overstate every IN employee\'s withholding. Rejected rather than approximated. (Indiana county income tax, which is required in addition to the state amount, is unimplemented regardless for the same reason CA/NJ/NY local complexity was scoped state-by-state.)',
    'IL, PA, MI, CO, AZ, AK, and WA (added in v5) are sourced from a secondary cross-check reference document, not independently fetched from each state\'s own primary publication the way CA/NJ/NY were — see the evidence list above. This is a materially weaker sourcing chain and these seven states should be treated as lower-confidence than CA/NJ/NY until independently verified against each state\'s own official withholding-methods publication.',
    'PA, MI, CO, AZ, AK, and WA local/city income taxes (e.g. Philadelphia Wage Tax, and the many Michigan cities that levy their own income tax) are NOT modeled — these states are implemented at the state level only.',
    'CO: the FAMLI employer-share/small-employer-exemption rules are DYNAMIC (employer-side only, don\'t affect the employee co_famli figure this engine computes) and not modeled.',
    'WA: PFML and WA Cares small-employer exemptions and WA Cares individual approved-exemption letters are DYNAMIC and not modeled — every WA employee is assumed subject to both at the flat statutory rates. A WA employee with an approved WA Cares exemption would be incorrectly charged the 0.58% contribution by this engine; callers with such employees must adjust outside this engine.',
    'AZ: only the employee\'s own percentage election (az_election_percent) is modeled. The statutory "default 2.0% if no A-4 timely filed" employer-side default behavior is NOT implemented — the caller must always supply the employee\'s actual election (or explicit 0% if validly elected) rather than relying on this engine to apply the default.',
    'Only 2020-or-later Form W-4 revisions are supported (Steps 1-4) for federal withholding. Pre-2020 allowances-based W-4s are rejected, not approximated via the IRS computational bridge.',
    'Only weekly, biweekly, semimonthly, and monthly pay frequencies are supported.',
    'State Unemployment Insurance (SUI) is not calculated for either state — both California (EDD) and New Jersey (NJDOL) assign each employer an individual experience rate, which this engine has no statutory default for. Callers must compute and post employer-side SUI/UI separately. (New Jersey\'s EMPLOYEE-side UI/Workforce Development contribution, which does have a flat statutory rate, IS calculated — see nj_ui_wf_swf below.)',
    'California Employment Training Tax (ETT) is not calculated.',
    'New Jersey: only NJ-W4 Rate Tables A and B are implemented (the two most common cases — see the file for which NJ-W4 filing-status boxes map to each). Rate Tables C, D, and E, which an employee may elect via the NJ-W4 wage chart in dual-income or multi-job households, are not implemented and are rejected if requested.',
    'New Jersey: the Newark payroll tax (an employer-paid 1% tax on total payroll for businesses with 50+ employees working in Newark) is NOT calculated — directly relevant to this pack\'s ~50-employee target segment if any client has a Newark work location, and flagged here rather than silently ignored.',
    'New Jersey: the NJ/PA reciprocal agreement (no NJ withholding for PA-resident employees who file Form NJ-165) is not modeled; all NJ employees are withheld as NJ-taxable.',
    'New Jersey: pretax_401k_deferral and pretax_section125_deduction are NOT applied to NJ state income tax, UI/WF/SWF, TDI, or FLI wages — NJ employees with either pretax field non-zero are rejected rather than silently taxed on the wrong base, since NJ\'s treatment of these wage bases was not independently verified this pass (unlike the federal/CA treatment, which was).',
    'New York: pretax_401k_deferral and pretax_section125_deduction are also NOT applied to NY State, NYC, or Yonkers wages for the same reason — NY employees with either pretax field non-zero are rejected rather than silently taxed on the wrong wage base.',
    'New York: the "Method III Top Income Tax Rates" schedule (for very high net wages — roughly above the $20k-$41k per-period range where each exact-calculation table in this file stops, i.e. very high six-figure and up annual pay) is NOT implemented. Employees whose net wages exceed the top bracket of the tables here are rejected rather than approximated — a non-issue for this pack\'s small-business target segment, but rejected explicitly rather than silently mis-taxed.',
    'New York PFL (v6): calculated for every NY employee at 0.432% of gross wages, capped by a cumulative ANNUAL DOLLAR amount ($411.91 for 2026) via a new capTax primitive — distinct from every other capped tax in this file, which caps the taxable WAGE base (ceilingContribution) rather than the computed tax itself. Callers must track and pass ytd_ny_pfl_tax_before (a YTD TAX total, not a YTD wage total) for this one to cap correctly.',
    'New York DBL (v6): calculated only when the caller sets ny_dbl_opt_in (employer elects to deduct it) AND pay_frequency is WEEKLY — DBL\'s statutory cap is $0.60 PER CALENDAR WEEK, which has no clean equivalent for biweekly/semimonthly/monthly pay (is a semimonthly period ~2.17 weeks? ~2 weeks? the source doesn\'t say), so non-weekly employees with ny_dbl_opt_in set are rejected rather than guessed at.',
    'New York: the Metropolitan Commuter Transportation Mobility Tax (MCTMT) — an EMPLOYER-paid payroll tax in the MTA region (NYC + surrounding counties) — is NOT calculated. It is an employer-side tax, not an employee withholding, so it has no effect on any figure this engine reports to employees, but it is a real employer payroll-tax liability this engine does not compute.',
    'New York: NYC residency and Yonkers residency/workplace are each opt-in per employee via ny_nyc_resident, ny_yonkers_resident, and ny_yonkers_nonresident_workplace. This engine has no way to independently verify an employee\'s actual home or work address — getting these flags wrong for an employee produces a wrong result, not a rejected one, so the caller is responsible for setting them correctly.',
    'New York: the Yonkers RESIDENT surcharge is computed as 16.75% of the NY State tax amount on the same net wages, per the official NYS-50-T-Y method — its published bracket tables are numerically identical to the NY State ones, so this is the documented method, not an approximation.',
    'Only two pre-tax deduction categories are modeled for CA: traditional 401(k)/403(b) deferrals (excluded from federal/CA income tax wages only, still FICA/FUTA-taxable) and Section 125 cafeteria-plan deductions (excluded from income tax wages, FICA wages, FUTA wages, and CA SDI wages). Roth deferrals, HSA contributions, and IRS annual contribution-limit enforcement are not modeled — the caller must not pass amounts exceeding the employee\'s actual limit.',
    'Supplemental-wage flat-rate withholding methods (22% optional / 37% mandatory federal; NJ\'s own supplemental-wage combining rule) are not implemented; all pay is run through the regular annualized/percentage method.',
    'Figures are 2026 values sourced via AI web research (not a professional review) as of September 2026 and must still be verified against the official IRS Pub 15-T, EDD Method B, and NJ-WT publications before this pack is marked VERIFIED_BASIC_RULES.',
    'The FUTA net rate (including the California credit reduction) is finalized by the Department of Labor late in the calendar year; the 1.8% California figure used here is the best available 2026 estimate at the time of writing and must be reconfirmed once the year is final. New Jersey is not currently a FUTA credit-reduction state and uses the standard 0.6% net rate.',
    'This engine prepares payroll and accounting outputs only. It does not submit tax filings (e.g. Form 940/941/DE 9, NJ-927) and does not initiate payments.'
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

// Caps the computed TAX amount itself against a cumulative annual dollar
// cap (e.g. NY Paid Family Leave), as distinct from ceilingContribution
// above which caps the taxable WAGE base before applying a rate. The two
// are not interchangeable — a dollar-capped tax like NY PFL has no simple
// equivalent wage-base cap because the published cap is a flat dollar
// figure the state sets independently each year, not (rate × some base).
function capTax(rawTax: number, ytdTaxBefore: number, annualCap: number) {
  const roomLeft = Math.max(0, annualCap - ytdTaxBefore);
  return money(Math.min(Math.max(rawTax, 0), roomLeft));
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
    const pretax401k = requireNonNegativeMoney(employee.pretax_401k_deferral ?? 0, `pretax_401k_deferral for ${employeeId}`);
    const pretaxSection125 = requireNonNegativeMoney(employee.pretax_section125_deduction ?? 0, `pretax_section125_deduction for ${employeeId}`);
    if (money(pretax401k + pretaxSection125) > grossPay) {
      const error = new Error(`pretax_401k_deferral + pretax_section125_deduction cannot exceed gross_pay for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    // Traditional 401(k)/403(b) deferrals reduce income-tax wages only.
    // Section 125 cafeteria-plan deductions reduce income-tax wages AND
    // FICA/FUTA/SDI wages. See the v2 change log at the top of this file.
    const federalTaxableWages = Math.max(0, money(grossPay - pretax401k - pretaxSection125));
    const ficaAndFutaWages = Math.max(0, money(grossPay - pretaxSection125));
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
    const supportedStates: UsState[] = ['CA', 'NJ', 'NY', 'IL', 'PA', 'MI', 'CO', 'AZ', 'AK', 'WA', ...p.no_tax_no_employee_levy_states];
    if (!supportedStates.includes(employee.state)) {
      const error = new Error(`state for ${employeeId} is not supported — only ${supportedStates.join(', ')} are implemented in this rule pack`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    let caEstimatedDeductionAllowances = 0;
    if (employee.state === 'CA') {
      if (!['SINGLE', 'MARRIED_0_OR_1', 'MARRIED_2_OR_MORE', 'HEAD_OF_HOUSEHOLD'].includes(employee.ca_filing_status as string)) {
        const error = new Error(`ca_filing_status for ${employeeId} must be SINGLE, MARRIED_0_OR_1, MARRIED_2_OR_MORE, or HEAD_OF_HOUSEHOLD`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ca_regular_allowances) || (employee.ca_regular_allowances as number) < 0) {
        const error = new Error(`ca_regular_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      caEstimatedDeductionAllowances = employee.ca_estimated_deduction_allowances ?? 0;
      if (!Number.isInteger(caEstimatedDeductionAllowances) || caEstimatedDeductionAllowances < 0) {
        const error = new Error(`ca_estimated_deduction_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NJ') {
      if (pretax401k > 0 || pretaxSection125 > 0) {
        const error = new Error(`pretax_401k_deferral and pretax_section125_deduction are not supported for NJ employees (${employeeId}) in this rule pack — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (employee.nj_rate_table !== 'A' && employee.nj_rate_table !== 'B') {
        const error = new Error(`nj_rate_table for ${employeeId} must be 'A' or 'B' (Rate Tables C, D, E are not implemented)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.nj_allowances) || (employee.nj_allowances as number) < 0) {
        const error = new Error(`nj_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NY') {
      if (pretax401k > 0 || pretaxSection125 > 0) {
        const error = new Error(`pretax_401k_deferral and pretax_section125_deduction are not supported for NY employees (${employeeId}) in this rule pack — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (employee.ny_filing_status !== 'SINGLE' && employee.ny_filing_status !== 'MARRIED') {
        const error = new Error(`ny_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ny_allowances) || (employee.ny_allowances as number) < 0) {
        const error = new Error(`ny_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.ny_yonkers_resident && employee.ny_yonkers_nonresident_workplace) {
        const error = new Error(`ny_yonkers_resident and ny_yonkers_nonresident_workplace cannot both be true for ${employeeId}`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.ny_dbl_opt_in && employee.pay_frequency !== 'WEEKLY') {
        const error = new Error(`ny_dbl_opt_in for ${employeeId} is only supported for WEEKLY pay frequency — NY DBL's statutory cap is per calendar week and has no clean equivalent for other pay frequencies`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
    }
    if (employee.state === 'IL') {
      if (!Number.isInteger(employee.il_line1_allowances) || (employee.il_line1_allowances as number) < 0) {
        const error = new Error(`il_line1_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.il_line2_allowances) || (employee.il_line2_allowances as number) < 0) {
        const error = new Error(`il_line2_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'MI') {
      if (!Number.isInteger(employee.mi_personal_exemptions) || (employee.mi_personal_exemptions as number) < 0) {
        const error = new Error(`mi_personal_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'CO') {
      if (employee.co_filing_status !== 'MFJ_OR_QSS' && employee.co_filing_status !== 'OTHER') {
        const error = new Error(`co_filing_status for ${employeeId} must be 'MFJ_OR_QSS' or 'OTHER'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'AZ') {
      if (!p.arizona.valid_election_percents.includes(employee.az_election_percent as number)) {
        const error = new Error(`az_election_percent for ${employeeId} must be one of ${p.arizona.valid_election_percents.join(', ')}`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }

    const periodsPerYear = p.federal_income_tax.periods_per_year[employee.pay_frequency];

    // --- FICA (on ficaAndFutaWages: gross minus Section 125 only — 401(k) stays FICA-taxable) ---
    const employeeSocialSecurity = ceilingContribution(ytdSsBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.fica.social_security_rate);
    const employerSocialSecurity = employeeSocialSecurity; // same ceiling, same rate, employer matches
    const employeeMedicare = money(ficaAndFutaWages * p.fica.medicare_rate);
    const employerMedicare = employeeMedicare;
    const medicareYtdAfter = money(ytdMedicareBefore + ficaAndFutaWages);
    const additionalMedicareWagesThisPeriod = Math.max(0, medicareYtdAfter - Math.max(p.fica.additional_medicare_threshold_annual, ytdMedicareBefore));
    const employeeAdditionalMedicare = money(additionalMedicareWagesThisPeriod * p.fica.additional_medicare_rate);

    // --- FUTA (employer only, same wage base as FICA) ---
    const futaNetRate = p.futa.net_rate_by_state[employee.state] ?? p.futa.net_rate_default;
    const employerFuta = ceilingContribution(ytdFutaBefore, ficaAndFutaWages, p.futa.wage_base_annual, futaNetRate);

    // --- Federal income tax withholding (Worksheet 1A, annualized percentage method) ---
    const step3AnnualCredits = employee.federal_step3_annual_credits ?? 0;
    const step4aAnnualOtherIncome = employee.federal_step4a_annual_other_income ?? 0;
    const step4bAnnualDeductions = employee.federal_step4b_annual_deductions ?? 0;
    const step4cExtraPerPeriod = employee.federal_step4c_extra_per_period ?? 0;

    const annualizedWage = money(federalTaxableWages * periodsPerYear);
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
    let caIncomeTax = 0;
    let caSdi = 0;
    if (employee.state === 'CA') {
      const caFilingStatus = employee.ca_filing_status as UsCaFilingStatus;
      const lowIncomeExemption = p.california.low_income_exemption[employee.pay_frequency][caFilingStatus];
      if (federalTaxableWages > lowIncomeExemption) {
        const estimatedDeduction = money(caEstimatedDeductionAllowances * p.california.estimated_deduction_per_allowance[employee.pay_frequency]);
        const wagesSubjectToWithholding = Math.max(0, money(federalTaxableWages - estimatedDeduction));
        const standardDeduction = p.california.standard_deduction[employee.pay_frequency][caFilingStatus];
        const caTaxableIncome = Math.max(0, money(wagesSubjectToWithholding - standardDeduction));
        const rateTableKey: 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD' =
          caFilingStatus === 'HEAD_OF_HOUSEHOLD' ? 'HEAD_OF_HOUSEHOLD' : caFilingStatus === 'SINGLE' ? 'SINGLE' : 'MARRIED';
        const computedTax = bracketLookup(caTaxableIncome, p.california.rate_tables[employee.pay_frequency][rateTableKey]);
        const exemptionCredit = money((employee.ca_regular_allowances as number) * p.california.exemption_allowance_credit_per_allowance[employee.pay_frequency]);
        caIncomeTax = Math.max(0, money(computedTax - exemptionCredit));
      }
      // California SDI (employee only, uncapped, same wage base as FICA).
      caSdi = money(ficaAndFutaWages * p.california.sdi_rate);
    }

    // --- New Jersey state income tax withholding (NJ-WT percentage method, Rate Table A or B) ---
    const ytdNjUiWfBefore = requireNonNegativeMoney(employee.ytd_nj_ui_wf_wages_before ?? 0, `ytd_nj_ui_wf_wages_before for ${employeeId}`);
    const ytdNjTdiFliBefore = requireNonNegativeMoney(employee.ytd_nj_tdi_fli_wages_before ?? 0, `ytd_nj_tdi_fli_wages_before for ${employeeId}`);
    let njIncomeTax = 0;
    let njUiWfSwf = 0;
    let njTdi = 0;
    let njFli = 0;
    if (employee.state === 'NJ') {
      const njTable = employee.nj_rate_table as NjRateTable;
      const allowanceValue = money((employee.nj_allowances as number) * p.new_jersey.allowance_value_per_period[employee.pay_frequency]);
      const njWagesSubjectToWithholding = Math.max(0, money(grossPay - allowanceValue));
      njIncomeTax = bracketLookup(njWagesSubjectToWithholding, p.new_jersey.rate_tables[employee.pay_frequency][njTable]);
      njUiWfSwf = ceilingContribution(ytdNjUiWfBefore, grossPay, p.new_jersey.ui_wf_swf_wage_base_annual, p.new_jersey.ui_wf_swf_rate);
      njTdi = ceilingContribution(ytdNjTdiFliBefore, grossPay, p.new_jersey.tdi_fli_wage_base_annual, p.new_jersey.tdi_rate);
      njFli = ceilingContribution(ytdNjTdiFliBefore, grossPay, p.new_jersey.tdi_fli_wage_base_annual, p.new_jersey.fli_rate);
    }

    // --- New York State income tax, NYC resident tax, Yonkers resident surcharge / nonresident earnings tax, PFL, DBL ---
    const ytdNyPflTaxBefore = requireNonNegativeMoney(employee.ytd_ny_pfl_tax_before ?? 0, `ytd_ny_pfl_tax_before for ${employeeId}`);
    let nyIncomeTax = 0;
    let nycIncomeTax = 0;
    let yonkersTax = 0;
    let nyPfl = 0;
    let nyDbl = 0;
    if (employee.state === 'NY') {
      const nyFilingStatus = employee.ny_filing_status as NyFilingStatus;
      const deductionTable = nyFilingStatus === 'MARRIED' ? p.new_york.deduction_per_period_married : p.new_york.deduction_per_period;
      const deduction = deductionTable[employee.pay_frequency];
      const exemption = money((employee.ny_allowances as number) * p.new_york.exemption_per_allowance[employee.pay_frequency]);
      const netWages = Math.max(0, money(grossPay - deduction - exemption));
      const methodIiiThreshold = p.new_york.state_method_iii_threshold[employee.pay_frequency][nyFilingStatus];
      if (netWages >= methodIiiThreshold) {
        const error = new Error(`net NY wages for ${employeeId} exceed this engine's supported range (Method III Top Income Tax Rates is not implemented) — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      const nyBrackets = p.new_york.state_rate_tables[employee.pay_frequency][nyFilingStatus];
      nyIncomeTax = bracketLookup(netWages, nyBrackets);
      if (employee.ny_nyc_resident) {
        // NYC uses its OWN (lower) deduction base — not the NY State one.
        const nycDeductionTable = nyFilingStatus === 'MARRIED' ? p.new_york.nyc_deduction_per_period_married : p.new_york.nyc_deduction_per_period;
        const nycDeduction = nycDeductionTable[employee.pay_frequency];
        const nycNetWages = Math.max(0, money(grossPay - nycDeduction - exemption));
        nycIncomeTax = bracketLookup(nycNetWages, p.new_york.nyc_rate_table[employee.pay_frequency]);
      }
      if (employee.ny_yonkers_resident) {
        yonkersTax = money(nyIncomeTax * p.new_york.yonkers_resident_surcharge_rate);
      } else if (employee.ny_yonkers_nonresident_workplace) {
        const exemptionTable = p.new_york.yonkers_nonresident_exemption_tables[employee.pay_frequency];
        let yonkersExemption = 0;
        let belowFirstThreshold = grossPay < exemptionTable[1][0];
        for (const [atLeast, exemptionAmount] of exemptionTable) {
          if (grossPay >= atLeast) yonkersExemption = exemptionAmount;
        }
        yonkersTax = belowFirstThreshold ? 0 : money(Math.max(0, grossPay - yonkersExemption) * p.new_york.yonkers_nonresident_rate);
      }
      // PFL applies to every NY employee, no opt-out, capped by cumulative
      // ANNUAL DOLLAR amount rather than by a wage base.
      nyPfl = capTax(money(grossPay * p.new_york.pfl_rate), ytdNyPflTaxBefore, p.new_york.pfl_annual_dollar_cap);
      // DBL is opt-in (employer elects to deduct) and WEEKLY-only — validated above.
      if (employee.ny_dbl_opt_in) {
        nyDbl = money(Math.min(grossPay * p.new_york.dbl_rate, p.new_york.dbl_weekly_dollar_cap));
      }
    }

    // --- Illinois: flat 4.95% after IL-W-4 Line 1/Line 2 allowances ---
    let ilIncomeTax = 0;
    if (employee.state === 'IL') {
      const allowanceAmount = money(
        ((employee.il_line1_allowances as number) * p.illinois.line1_allowance_annual +
         (employee.il_line2_allowances as number) * p.illinois.line2_allowance_annual) / periodsPerYear
      );
      const ilTaxableWages = Math.max(0, money(grossPay - allowanceAmount));
      ilIncomeTax = money(ilTaxableWages * p.illinois.rate + (employee.il_extra_per_period ?? 0));
    }

    // --- Pennsylvania: flat 3.07% state PIT + flat 0.07% employee UC, both on gross, no allowances ---
    let paIncomeTax = 0;
    let paUc = 0;
    if (employee.state === 'PA') {
      paIncomeTax = money(grossPay * p.pennsylvania.income_tax_rate);
      paUc = money(grossPay * p.pennsylvania.employee_uc_rate);
    }

    // --- Michigan: flat 4.25% after the annual personal exemption ---
    let miIncomeTax = 0;
    if (employee.state === 'MI') {
      const exemptionAmount = money(((employee.mi_personal_exemptions as number) * p.michigan.personal_exemption_annual) / periodsPerYear);
      const miTaxableWages = Math.max(0, money(grossPay - exemptionAmount));
      miIncomeTax = money(miTaxableWages * p.michigan.rate);
    }

    // --- Colorado: DR 1098 percentage method + FAMLI employee contribution ---
    const ytdCoFamliBefore = requireNonNegativeMoney(employee.ytd_co_famli_wages_before ?? 0, `ytd_co_famli_wages_before for ${employeeId}`);
    let coIncomeTax = 0;
    let coFamli = 0;
    if (employee.state === 'CO') {
      const coFilingStatus = employee.co_filing_status as CoFilingStatus;
      const defaultSubtraction = coFilingStatus === 'MFJ_OR_QSS' ? p.colorado.default_subtraction_mfj_or_qss : p.colorado.default_subtraction_other;
      const subtraction = employee.co_dr0004_line2_annual_override ?? defaultSubtraction;
      const annualWages = money(grossPay * periodsPerYear);
      const taxableAnnual = Math.max(0, money(annualWages - subtraction));
      const annualTax = money(taxableAnnual * p.colorado.rate);
      coIncomeTax = money(annualTax / periodsPerYear + (employee.co_dr0004_line3_extra_per_period ?? 0));
      coFamli = ceilingContribution(ytdCoFamliBefore, grossPay, p.colorado.famli_wage_base_annual, p.colorado.famli_employee_rate);
    }

    // --- Arizona: flat employee-elected percentage of gross wages ---
    let azIncomeTax = 0;
    if (employee.state === 'AZ') {
      azIncomeTax = money(grossPay * ((employee.az_election_percent as number) / 100));
    }

    // --- Alaska: no state income tax, but employee-paid UI at a flat statutory rate ---
    const ytdAkUiBefore = requireNonNegativeMoney(employee.ytd_ak_ui_wages_before ?? 0, `ytd_ak_ui_wages_before for ${employeeId}`);
    let akUi = 0;
    if (employee.state === 'AK') {
      akUi = ceilingContribution(ytdAkUiBefore, grossPay, p.alaska.ui_wage_base_annual, p.alaska.ui_employee_rate);
    }

    // --- Washington: no state income tax, but employee-paid PFML share + WA Cares ---
    const ytdWaPfmlBefore = requireNonNegativeMoney(employee.ytd_wa_pfml_wages_before ?? 0, `ytd_wa_pfml_wages_before for ${employeeId}`);
    let waPfml = 0;
    let waCares = 0;
    if (employee.state === 'WA') {
      const employeePfmlRate = p.washington.pfml_total_rate * p.washington.pfml_employee_share_of_total;
      waPfml = ceilingContribution(ytdWaPfmlBefore, grossPay, p.washington.pfml_wage_base_annual, employeePfmlRate);
      waCares = money(grossPay * p.washington.wa_cares_employee_rate);
    }

    const employeeTaxTotal = money(
      federalIncomeTax + employeeSocialSecurity + employeeMedicare + employeeAdditionalMedicare +
      caIncomeTax + caSdi + njIncomeTax + njUiWfSwf + njTdi + njFli +
      nyIncomeTax + nycIncomeTax + yonkersTax + nyPfl + nyDbl +
      ilIncomeTax + paIncomeTax + paUc + miIncomeTax + coIncomeTax + coFamli + azIncomeTax + akUi + waPfml + waCares
    );
    const netPay = money(grossPay - employeeTaxTotal - pretax401k - pretaxSection125);
    const employerPayrollTaxTotal = money(employerSocialSecurity + employerMedicare + employerFuta);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      pretax_401k_deferral: pretax401k,
      pretax_section125_deduction: pretaxSection125,
      federal_taxable_wages: federalTaxableWages,
      fica_and_futa_wages: ficaAndFutaWages,
      federal_income_tax: federalIncomeTax,
      employee_social_security: employeeSocialSecurity,
      employer_social_security: employerSocialSecurity,
      employee_medicare: employeeMedicare,
      employer_medicare: employerMedicare,
      employee_additional_medicare: employeeAdditionalMedicare,
      employer_futa: employerFuta,
      ca_income_tax: caIncomeTax,
      ca_sdi: caSdi,
      nj_income_tax: njIncomeTax,
      nj_ui_wf_swf: njUiWfSwf,
      nj_tdi: njTdi,
      nj_fli: njFli,
      ny_income_tax: nyIncomeTax,
      nyc_income_tax: nycIncomeTax,
      yonkers_tax: yonkersTax,
      ny_pfl: nyPfl,
      ny_dbl: nyDbl,
      il_income_tax: ilIncomeTax,
      pa_income_tax: paIncomeTax,
      pa_uc: paUc,
      mi_income_tax: miIncomeTax,
      co_income_tax: coIncomeTax,
      co_famli: coFamli,
      az_income_tax: azIncomeTax,
      ak_ui: akUi,
      wa_pfml: waPfml,
      wa_cares: waCares,
      net_pay: netPay,
      employer_cost_total: money(grossPay + employerPayrollTaxTotal),
      ytd_ss_wages_after: money(ytdSsBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdSsBefore))),
      ytd_medicare_wages_after: medicareYtdAfter,
      ytd_futa_wages_after: money(ytdFutaBefore + Math.min(ficaAndFutaWages, Math.max(0, p.futa.wage_base_annual - ytdFutaBefore))),
      ytd_nj_ui_wf_wages_after: money(ytdNjUiWfBefore + Math.min(grossPay, Math.max(0, p.new_jersey.ui_wf_swf_wage_base_annual - ytdNjUiWfBefore))),
      ytd_nj_tdi_fli_wages_after: money(ytdNjTdiFliBefore + Math.min(grossPay, Math.max(0, p.new_jersey.tdi_fli_wage_base_annual - ytdNjTdiFliBefore))),
      ytd_co_famli_wages_after: money(ytdCoFamliBefore + Math.min(grossPay, Math.max(0, p.colorado.famli_wage_base_annual - ytdCoFamliBefore))),
      ytd_ak_ui_wages_after: money(ytdAkUiBefore + Math.min(grossPay, Math.max(0, p.alaska.ui_wage_base_annual - ytdAkUiBefore))),
      ytd_wa_pfml_wages_after: money(ytdWaPfmlBefore + Math.min(grossPay, Math.max(0, p.washington.pfml_wage_base_annual - ytdWaPfmlBefore))),
      ytd_ny_pfl_tax_after: money(ytdNyPflTaxBefore + nyPfl)
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
    nj_income_tax: sum(employees.map(e => e.nj_income_tax)),
    nj_ui_wf_swf: sum(employees.map(e => e.nj_ui_wf_swf)),
    nj_tdi: sum(employees.map(e => e.nj_tdi)),
    nj_fli: sum(employees.map(e => e.nj_fli)),
    ny_income_tax: sum(employees.map(e => e.ny_income_tax)),
    nyc_income_tax: sum(employees.map(e => e.nyc_income_tax)),
    yonkers_tax: sum(employees.map(e => e.yonkers_tax)),
    ny_pfl: sum(employees.map(e => e.ny_pfl)),
    ny_dbl: sum(employees.map(e => e.ny_dbl)),
    il_income_tax: sum(employees.map(e => e.il_income_tax)),
    pa_income_tax: sum(employees.map(e => e.pa_income_tax)),
    pa_uc: sum(employees.map(e => e.pa_uc)),
    mi_income_tax: sum(employees.map(e => e.mi_income_tax)),
    co_income_tax: sum(employees.map(e => e.co_income_tax)),
    co_famli: sum(employees.map(e => e.co_famli)),
    az_income_tax: sum(employees.map(e => e.az_income_tax)),
    ak_ui: sum(employees.map(e => e.ak_ui)),
    wa_pfml: sum(employees.map(e => e.wa_pfml)),
    wa_cares: sum(employees.map(e => e.wa_cares)),
    pretax_deductions: sum(employees.map(e => money(e.pretax_401k_deferral + e.pretax_section125_deduction))),
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
    { side: 'CREDIT', account_role: 'CA_SDI_PAYABLE', amount: totals.ca_sdi },
    { side: 'CREDIT', account_role: 'NJ_INCOME_TAX_PAYABLE', amount: totals.nj_income_tax },
    { side: 'CREDIT', account_role: 'NJ_UI_WF_SWF_PAYABLE', amount: totals.nj_ui_wf_swf },
    { side: 'CREDIT', account_role: 'NJ_TDI_PAYABLE', amount: totals.nj_tdi },
    { side: 'CREDIT', account_role: 'NJ_FLI_PAYABLE', amount: totals.nj_fli },
    { side: 'CREDIT', account_role: 'NY_INCOME_TAX_PAYABLE', amount: totals.ny_income_tax },
    { side: 'CREDIT', account_role: 'NYC_INCOME_TAX_PAYABLE', amount: totals.nyc_income_tax },
    { side: 'CREDIT', account_role: 'YONKERS_TAX_PAYABLE', amount: totals.yonkers_tax },
    { side: 'CREDIT', account_role: 'NY_PFL_PAYABLE', amount: totals.ny_pfl },
    { side: 'CREDIT', account_role: 'NY_DBL_PAYABLE', amount: totals.ny_dbl },
    { side: 'CREDIT', account_role: 'IL_INCOME_TAX_PAYABLE', amount: totals.il_income_tax },
    { side: 'CREDIT', account_role: 'PA_INCOME_TAX_PAYABLE', amount: totals.pa_income_tax },
    { side: 'CREDIT', account_role: 'PA_UC_PAYABLE', amount: totals.pa_uc },
    { side: 'CREDIT', account_role: 'MI_INCOME_TAX_PAYABLE', amount: totals.mi_income_tax },
    { side: 'CREDIT', account_role: 'CO_INCOME_TAX_PAYABLE', amount: totals.co_income_tax },
    { side: 'CREDIT', account_role: 'CO_FAMLI_PAYABLE', amount: totals.co_famli },
    { side: 'CREDIT', account_role: 'AZ_INCOME_TAX_PAYABLE', amount: totals.az_income_tax },
    { side: 'CREDIT', account_role: 'AK_UI_PAYABLE', amount: totals.ak_ui },
    { side: 'CREDIT', account_role: 'WA_PFML_PAYABLE', amount: totals.wa_pfml },
    { side: 'CREDIT', account_role: 'WA_CARES_PAYABLE', amount: totals.wa_cares },
    { side: 'CREDIT', account_role: 'EMPLOYEE_PRETAX_DEDUCTIONS_PAYABLE', amount: totals.pretax_deductions }
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

  // Case 4: pre-tax 401(k) + Section 125 split. Gross 5000, 401k 300 (reduces
  // income-tax wages only), Section 125 200 (reduces income-tax AND FICA/SDI wages).
  // federalTaxableWages = 5000-300-200 = 4500; ficaAndFutaWages = 5000-200 = 4800.
  const pretaxCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E004',
        gross_pay: 5000,
        pretax_401k_deferral: 300,
        pretax_section125_deduction: 200,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s4 = pretaxCase.employees[0];
  const expectedFicaWages4 = 4800; // 5000 - 200 (401k stays FICA-taxable, Section 125 doesn't)
  const expectedFederalTaxableWages4 = 4500; // 5000 - 300 - 200
  const expectedSs4 = money(4800 * 0.062);
  const expectedMedicare4 = money(4800 * 0.0145);

  // Case 5: Married Filing Jointly, weekly, CA MARRIED_2_OR_MORE with 2 allowances.
  // Federal: annualized 1500*52=78000, minus MFJ step2-not-checked 12900 -> 65100.
  // MFJ bracket [44100,2480,12%]: 2480+0.12*(65100-44100)=5000.00 annual -> /52=96.1538->96.15.
  // CA: weekly low-income exemption (married 2+) 727 < 1500, taxable. Standard deduction
  // (weekly) 219 -> 1500-219=1281. MARRIED bracket [1010,17.54,4.4%]: 17.54+0.044*(1281-1010)=29.46.
  // Credit: 2 * 3.24 = 6.48 -> 29.46-6.48=22.98.
  const mfjCase = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E005',
        gross_pay: 1500,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'MARRIED_2_OR_MORE',
        ca_regular_allowances: 2
      }
    ]
  });
  const s5 = mfjCase.employees[0];
  const expectedFederal5 = 96.15;
  const expectedCa5 = 22.98;

  // Case 6: Head of Household, semimonthly, CA HEAD_OF_HOUSEHOLD with 1 allowance.
  // Federal: annualized 3000*24=72000, minus HOH step2-not-checked "other" 8600 -> 63400.
  // HOH bracket [33250,1770,12%]: 1770+0.12*(63400-33250)=5388.00 annual -> /24=224.50.
  // CA: semimonthly low-income exemption (HOH) 1575 < 3000, taxable. Standard deduction
  // (semimonthly) 476 -> 3000-476=2524. HEAD_OF_HOUSEHOLD bracket [2189,37.99,4.4%]:
  // 37.99+0.044*(2524-2189)=52.73. Credit: 1 * 7.01 -> 52.73-7.01=45.72.
  const hohCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-15',
    pay_date: '2026-08-15',
    employees: [
      {
        employee_id: 'E006',
        gross_pay: 3000,
        pay_frequency: 'SEMIMONTHLY',
        federal_filing_status: 'HOH',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'HEAD_OF_HOUSEHOLD',
        ca_regular_allowances: 1
      }
    ]
  });
  const s6 = hohCase.employees[0];
  const expectedFederal6 = 224.5;
  const expectedCa6 = 45.72;

  // Case 7: multi-employee run — verifies totals aggregate linearly across two
  // employees with different pay frequencies, filing statuses, and CA statuses,
  // by comparing the combined run's totals against the same two employees run
  // individually and summed by hand.
  const multiA = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E007A',
        gross_pay: 1200,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const multiB = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E007B',
        gross_pay: 2600,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'MARRIED_0_OR_1',
        ca_regular_allowances: 1
      }
    ]
  });
  const multiAB = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [{
      employee_id: 'E007A',
      gross_pay: 1200,
      pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS',
      federal_step2_checkbox: false,
      ytd_ss_wages_before: 0,
      ytd_medicare_wages_before: 0,
      ytd_futa_wages_before: 0,
      state: 'CA',
      ca_filing_status: 'SINGLE',
      ca_regular_allowances: 0
    }, {
      employee_id: 'E007B',
      gross_pay: 2600,
      pay_frequency: 'BIWEEKLY',
      federal_filing_status: 'MFJ',
      federal_step2_checkbox: false,
      ytd_ss_wages_before: 0,
      ytd_medicare_wages_before: 0,
      ytd_futa_wages_before: 0,
      state: 'CA',
      ca_filing_status: 'MARRIED_0_OR_1',
      ca_regular_allowances: 1
    }]
  });
  const expectedCombinedGross = money(multiA.totals.gross_pay + multiB.totals.gross_pay);
  const expectedCombinedFederal = money(multiA.totals.federal_income_tax + multiB.totals.federal_income_tax);
  const expectedCombinedCa = money(multiA.totals.ca_income_tax + multiB.totals.ca_income_tax);
  const expectedCombinedNet = money(multiA.totals.net_pay + multiB.totals.net_pay);

  // Case 8: Worksheet 1A Step 3/4(a)/4(b) fields (credits, other income, extra
  // deductions) all non-zero, single filer, monthly.
  // annualized 6000*12=72000, +step4a 2400=74400, -(step4b 3000 + 8600)=62800.
  // SINGLE_MFS bracket [57900,5800,22%]: 5800+0.22*(62800-57900)=6878.00 annual.
  // /12=573.17 tentative. Credits 1200/12=100.00 -> 573.17-100.00=473.17.
  const creditsCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E008',
        gross_pay: 6000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        federal_step3_annual_credits: 1200,
        federal_step4a_annual_other_income: 2400,
        federal_step4b_annual_deductions: 3000,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s8 = creditsCase.employees[0];
  const expectedFederal8 = 473.17;

  // Case 9: New Jersey, Rate Table A (Single), weekly, 1 allowance.
  // Allowance value weekly = 19.20 -> subject = 1000-19.20 = 980.80.
  // Rate A weekly bracket [769,15.29,6.1%]: 15.29+0.061*(980.80-769)=28.21.
  const njCaseA = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E009',
        gross_pay: 1000,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'A',
        nj_allowances: 1
      }
    ]
  });
  const s9 = njCaseA.employees[0];
  const expectedNjIncomeTax9 = 28.21;
  const expectedNjUiWfSwf9 = money(1000 * 0.00425);
  const expectedNjTdi9 = money(1000 * 0.0019);
  const expectedNjFli9 = money(1000 * 0.0023);

  // Case 10: New Jersey, Rate Table B (Married/CU Couple Joint), biweekly, 2 allowances.
  // Allowance value biweekly = 38.40*2 = 76.80 -> subject = 3000-76.80 = 2923.20.
  // Rate B biweekly bracket [2692,55,3.9%]: 55+0.039*(2923.20-2692)=64.02.
  const njCaseB = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-16',
    pay_date: '2026-08-16',
    employees: [
      {
        employee_id: 'E010',
        gross_pay: 3000,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'B',
        nj_allowances: 2
      }
    ]
  });
  const s10 = njCaseB.employees[0];
  const expectedNjIncomeTax10 = 64.02;

  // Case 11: NJ UI/WF/SWF and TDI/FLI wage-base ceilings crossed mid-period.
  // UI/WF room = 44800-40000=4800 (< gross 10000) -> 4800*0.00425=20.40.
  // TDI/FLI room = 171100-165000=6100 -> TDI 6100*0.0019=11.59, FLI 6100*0.0023=14.03.
  const njCeilingCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E011',
        gross_pay: 10000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'A',
        nj_allowances: 0,
        ytd_nj_ui_wf_wages_before: 40000,
        ytd_nj_tdi_fli_wages_before: 165000
      }
    ]
  });
  const s11 = njCeilingCase.employees[0];
  const expectedNjUiWfSwf11 = money(4800 * 0.00425);
  const expectedNjTdi11 = money(6100 * 0.0019);
  const expectedNjFli11 = money(6100 * 0.0023);

  // Case 12: New York, weekly, Single, 3 allowances, NYC resident, Yonkers
  // resident. Hand-derived directly against the worked examples in the
  // official NYS-50-T-NYS/NYC/Y publications (Method II, page 16/25/16):
  // deduction+exemption 200.05 -> net 199.95; NY state tax $8.01 (table
  // line2: (199.95-163)*0.044+6.38); NYC tax $6.11 (deduction 153.90 ->
  // net 246.10, table line3: (246.10-167)*0.0325+3.54); Yonkers resident
  // surcharge = $8.01 * 16.75% = $1.34.
  const nyCaseSingle = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E012',
        gross_pay: 400,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NY',
        ny_filing_status: 'SINGLE',
        ny_allowances: 3,
        ny_nyc_resident: true,
        ny_yonkers_resident: true
      }
    ]
  });
  const s12 = nyCaseSingle.employees[0];
  const expectedNyIncomeTax12 = 8.01;
  const expectedNycIncomeTax12 = 6.11;
  const expectedYonkersTax12 = 1.34;

  // Case 13: New York, weekly, $200 gross, Yonkers NONRESIDENT workplace.
  // Hand-derived against the NYS-50-T-Y Method VII worked example: wages
  // 200 is in the [192,385) bracket, exemption 38 -> (200-38)*0.005=0.81.
  const nyCaseYonkersNonresident = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E013',
        gross_pay: 200,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NY',
        ny_filing_status: 'SINGLE',
        ny_allowances: 0,
        ny_yonkers_nonresident_workplace: true
      }
    ]
  });
  const s13 = nyCaseYonkersNonresident.employees[0];
  const expectedYonkersTax13 = 0.81;

  // Case 15 (v6): NY PFL, ordinary case + dollar-cap crossing, plus NY DBL.
  // PFL rate 0.432% is unconditional for every NY employee.
  const nyPflOrdinary = calculateUsPayroll({
    pay_period_start: '2026-08-03', pay_period_end: '2026-08-09', pay_date: '2026-08-09',
    employees: [{
      employee_id: 'E015', gross_pay: 1000, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NY', ny_filing_status: 'SINGLE', ny_allowances: 0,
      ny_dbl_opt_in: true
    }]
  });
  const s15 = nyPflOrdinary.employees[0];
  // PFL: 1000 * 0.432% = 4.32, well under the $411.91 annual cap.
  const expectedNyPfl15 = 4.32;
  // DBL: min(1000*0.5%, 0.60) = min(5.00, 0.60) = 0.60 (capped).
  const expectedNyDbl15 = 0.6;

  // Case 16: NY PFL dollar-cap crossing mid-year — YTD PFL tax already at
  // $410.00, only $1.91 of room left before hitting the $411.91 annual cap.
  const nyPflCapCrossing = calculateUsPayroll({
    pay_period_start: '2026-12-01', pay_period_end: '2026-12-07', pay_date: '2026-12-07',
    employees: [{
      employee_id: 'E016', gross_pay: 1000, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NY', ny_filing_status: 'SINGLE', ny_allowances: 0,
      ytd_ny_pfl_tax_before: 410
    }]
  });
  const s16 = nyPflCapCrossing.employees[0];
  const expectedNyPfl16 = 1.91;

  // Case 14: one multi-employee run covering all 8 v5 state tiers at once —
  // IL, PA, MI, CO, AZ, AK, WA, and one no-tax/no-employee-levy state (TX).
  // All expected values hand-derived directly from this file's own v5
  // rule-pack constants (illinois/pennsylvania/michigan/colorado/arizona/
  // alaska/washington), not against any external worked example — these
  // seven states' figures come from a secondary reference, not an official
  // publication with its own worked examples the way NY's did.
  const multiStateCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-14',
    pay_date: '2026-08-14',
    employees: [
      { employee_id: 'IL1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IL', il_line1_allowances: 1, il_line2_allowances: 0 },
      { employee_id: 'PA1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'PA' },
      { employee_id: 'MI1', gross_pay: 1000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MI', mi_personal_exemptions: 1 },
      { employee_id: 'CO1', gross_pay: 2000, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'CO', co_filing_status: 'OTHER' },
      { employee_id: 'AZ1', gross_pay: 1500, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AZ', az_election_percent: 2.5 },
      { employee_id: 'AK1', gross_pay: 1200, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AK' },
      { employee_id: 'WA1', gross_pay: 2000, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'WA' },
      { employee_id: 'TX1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'TX' }
    ]
  });
  const [sIl, sPa, sMi, sCo, sAz, sAk, sWa, sTx] = multiStateCase.employees;
  // IL: (1000 - 2925/52) * 4.95% = (1000 - 56.25) * 0.0495 = 46.72 (943.75*0.0495=46.715625)
  const expectedIl = 46.72;
  // PA: 1000*3.07% = 30.70; UC 1000*0.07% = 0.70
  const expectedPaIncomeTax = 30.7;
  const expectedPaUc = 0.7;
  // MI: (1000 - 5900/12) * 4.25% = (1000 - 491.67) * 0.0425 = 508.33*0.0425 = 21.60
  const expectedMi = 21.6;
  // CO: annualize 2000*26=52000; -5500=46500; *4.4%=2046.00; /26=78.69
  const expectedCoIncomeTax = 78.69;
  // CO FAMLI: 2000*0.44% = 8.80
  const expectedCoFamli = 8.8;
  // AZ: 1500*2.5% = 37.50
  const expectedAz = 37.5;
  // AK UI: 1200*0.5% = 6.00 (well under the $54,200 annual cap)
  const expectedAkUi = 6.0;
  // WA PFML: 2000 * (1.13% * 71.43%) = 2000*0.00807159 = 16.14318 -> 16.14
  const expectedWaPfml = 16.14;
  // WA Cares: 2000*0.58% = 11.60
  const expectedWaCares = 11.6;

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
    addlMedicareCase.controls.journal_balanced &&
    s4.fica_and_futa_wages === expectedFicaWages4 &&
    s4.federal_taxable_wages === expectedFederalTaxableWages4 &&
    s4.employee_social_security === expectedSs4 &&
    s4.employer_social_security === expectedSs4 &&
    s4.employee_medicare === expectedMedicare4 &&
    pretaxCase.controls.journal_balanced &&
    s5.federal_income_tax === expectedFederal5 &&
    s5.ca_income_tax === expectedCa5 &&
    mfjCase.controls.journal_balanced &&
    s6.federal_income_tax === expectedFederal6 &&
    s6.ca_income_tax === expectedCa6 &&
    hohCase.controls.journal_balanced &&
    multiAB.controls.employee_count === 2 &&
    multiAB.controls.journal_balanced &&
    multiAB.totals.gross_pay === expectedCombinedGross &&
    multiAB.totals.federal_income_tax === expectedCombinedFederal &&
    multiAB.totals.ca_income_tax === expectedCombinedCa &&
    multiAB.totals.net_pay === expectedCombinedNet &&
    s8.federal_income_tax === expectedFederal8 &&
    creditsCase.controls.journal_balanced &&
    s9.nj_income_tax === expectedNjIncomeTax9 &&
    s9.nj_ui_wf_swf === expectedNjUiWfSwf9 &&
    s9.nj_tdi === expectedNjTdi9 &&
    s9.nj_fli === expectedNjFli9 &&
    njCaseA.controls.journal_balanced &&
    s10.nj_income_tax === expectedNjIncomeTax10 &&
    njCaseB.controls.journal_balanced &&
    s11.nj_ui_wf_swf === expectedNjUiWfSwf11 &&
    s11.nj_tdi === expectedNjTdi11 &&
    s11.nj_fli === expectedNjFli11 &&
    njCeilingCase.controls.journal_balanced &&
    s12.ny_income_tax === expectedNyIncomeTax12 &&
    s12.nyc_income_tax === expectedNycIncomeTax12 &&
    s12.yonkers_tax === expectedYonkersTax12 &&
    nyCaseSingle.controls.journal_balanced &&
    s13.yonkers_tax === expectedYonkersTax13 &&
    nyCaseYonkersNonresident.controls.journal_balanced &&
    sIl.il_income_tax === expectedIl &&
    sPa.pa_income_tax === expectedPaIncomeTax &&
    sPa.pa_uc === expectedPaUc &&
    sMi.mi_income_tax === expectedMi &&
    sCo.co_income_tax === expectedCoIncomeTax &&
    sCo.co_famli === expectedCoFamli &&
    sAz.az_income_tax === expectedAz &&
    sAk.ak_ui === expectedAkUi &&
    sWa.wa_pfml === expectedWaPfml &&
    sWa.wa_cares === expectedWaCares &&
    sTx.federal_income_tax > 0 &&
    sTx.employee_social_security > 0 &&
    multiStateCase.controls.employee_count === 8 &&
    multiStateCase.controls.journal_balanced &&
    s15.ny_pfl === expectedNyPfl15 &&
    s15.ny_dbl === expectedNyDbl15 &&
    nyPflOrdinary.controls.journal_balanced &&
    s16.ny_pfl === expectedNyPfl16 &&
    nyPflCapCrossing.controls.journal_balanced;

  return {
    ok,
    sample,
    ssCase,
    addlMedicareCase,
    multiStateCase,
    nyPflOrdinary,
    nyPflCapCrossing,
    pretaxCase,
    nyCaseSingle,
    nyCaseYonkersNonresident,
    njCaseA,
    njCaseB,
    njCeilingCase,
    mfjCase,
    hohCase,
    multiAB,
    creditsCase,
    expected: {
      expectedSs, expectedMedicare, expectedFuta, expectedFederal, expectedCa, expectedSdi,
      expectedSsRoom, expectedAdditionalMedicare, expectedAddlMedicare3,
      expectedFederal5, expectedCa5, expectedFederal6, expectedCa6,
      expectedCombinedGross, expectedCombinedFederal, expectedCombinedCa, expectedCombinedNet,
      expectedFederal8,
      expectedFicaWages4, expectedFederalTaxableWages4, expectedSs4, expectedMedicare4,
      expectedNjIncomeTax9, expectedNjUiWfSwf9, expectedNjTdi9, expectedNjFli9,
      expectedNjIncomeTax10, expectedNjUiWfSwf11, expectedNjTdi11, expectedNjFli11
    }
  };
}
