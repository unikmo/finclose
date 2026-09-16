// United Kingdom (GB) payroll rule pack — v1.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current UK payroll expertise has checked this against HMRC's own
// Specification for PAYE Tax Table Routines, the NI software-developer
// specification, and the Student Loan collection specification, and this
// pack's outputs have been run against HMRC's official 2026/27 payroll test
// data (not just this file's own hand-derived self-tests).
//
// Sourced from a user-supplied "UK 2026/27 Payroll Implementation
// Reference" (verified 14 Sep 2026, citing HMRC/GOV.UK/Scottish Government/
// The Pensions Regulator as primary authorities) — a genuine parameter
// reference with real rates/thresholds attributed to named HMRC
// publications, not a placeholder scaffold. Not independently re-fetched
// from GOV.UK/HMRC directly this pass; treat as one step removed from
// primary source, same tier as the original US IL/PA/MI/CO/AZ/AK/WA batch.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - PAYE Income Tax: ONLY the standard cumulative tax codes 1257L
//     (England & Northern Ireland), S1257L (Scotland), C1257L (Wales) are
//     accepted — the ordinary case for the vast majority of employees with
//     no other income, benefits, or under/over-payment adjustment. Every
//     other tax code (BR, D0/D1, 0T, K codes, W1/M1/X non-cumulative
//     operation, any other prefix/suffix) is REJECTED with an explicit
//     error. HMRC's real PAYE routine also runs CUMULATIVELY across the
//     tax year (this period's tax = cumulative-year tax to date minus tax
//     already deducted). This engine instead uses a simplified
//     annualize-current-period-and-divide approximation — the same
//     approach and the same disclosed limitation already used for Germany's
//     Lohnsteuer in payroll-engine-de.ts — which will diverge from the true
//     cumulative HMRC figure whenever pay varies period to period. This is
//     the single largest accuracy gap in this file; see limitations.
//   - Class 1 National Insurance: ONLY category A (the standard employee
//     category — the great majority of the workforce) is implemented.
//     Categories B/C/D/E/F/H/I/J/K/L/M/N/S/V/Z (married-woman reduced rate,
//     State Pension age, apprentices, veterans, Freeport/Investment Zone,
//     deferment, under-21, directors) are REJECTED, not approximated.
//     Directors' annual/alternative NI method is not implemented.
//   - Student/Postgraduate Loans: the plain periodic-threshold-and-rate
//     formula is implemented for Plans 1/2/4/5 plus PGL. Irregular pay
//     periods and priority ordering against protected-earnings attachment
//     orders are NOT implemented.
//   - Workplace pension: a simple qualifying-earnings-band 5%/3%
//     (employee/employer) calculation is implemented, gated on a
//     caller-supplied pension_enrolled flag. Auto-enrolment ASSESSMENT
//     (age/earnings trigger, postponement, opt-out/refund timing) is NOT
//     implemented — the caller must already know and supply whether the
//     employee is enrolled.
//   - NOT IMPLEMENTED AT ALL, rejected if requested: statutory payments
//     (SMP/SPP/SAP/ShPP/SPBP/SNCP/SSP and their employer recovery),
//     Apprenticeship Levy, Employment Allowance, Class 1A/1B, benefits in
//     kind/salary sacrifice, attachment/court order deductions, RTI
//     (FPS/EPS) generation. This engine prepares payroll and accounting
//     outputs only — it does not file with HMRC.

export type UkNation = 'ENGLAND_OR_NI' | 'SCOTLAND' | 'WALES';
// v3 adds the 0T non-cumulative (Week1/Month1) codes. HMRC's own rule for a
// W1/M1-marked code is: treat this period in isolation (no personal
// allowance carried, no prior pay/tax used) — multiply this period's
// taxable pay by the number of pay periods in the year, look up the tax on
// that annualized figure using the ANNUAL table, then divide back down by
// the same number of periods. That is exactly this engine's existing
// "annualize-current-period-and-divide" calculation (see
// PAYE Income Tax limitation below) — so for a genuinely non-cumulative
// (W1/M1) code the engine's simplification is not an approximation, it IS
// the correct HMRC method. Bare cumulative 0T (no W1/M1 marker) is
// deliberately NOT added here: cumulative operation needs prior pay/tax
// carried forward, which this engine does not track, so it would carry the
// same divergence risk already disclosed for 1257L/S1257L/C1257L.
export type UkTaxCode =
  | '1257L' | 'S1257L' | 'C1257L'
  | '0T M1' | '0T W1' | 'S0T M1' | 'S0T W1' | 'C0T M1' | 'C0T W1';
export type UkPayFrequency = 'WEEKLY' | 'MONTHLY';
// v3 adds category M (under 21). Employee rates for M are identical to A
// (8% to UEL, 2% above); the only difference is employer NIC, which is 0%
// up to the Under-21 Upper Secondary Threshold (UST — numerically the same
// weekly/monthly value as the UEL) and 15% above it. Source: UK 2026/27
// Payroll Implementation Reference, "Class 1 National Insurance" and
// "Employer National Insurance and special category reliefs" tables.
export type UkNiCategory = 'A' | 'M';
export type UkStudentLoanPlan = 'PLAN_1' | 'PLAN_2' | 'PLAN_4' | 'PLAN_5';

export type UkEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pay_frequency: UkPayFrequency;
  tax_code: UkTaxCode;
  ni_category: UkNiCategory;
  student_loan_plan?: UkStudentLoanPlan;
  postgraduate_loan: boolean;
  pension_enrolled: boolean;
  // Statutory Sick Pay (SSP) — v2. Both optional; omit both to leave SSP
  // uncomputed (default, matching every pre-v2 caller). Unlike SUI/WCB,
  // SSP's RATE is a fixed statutory amount (not employer/rate-notice
  // specific), so this engine computes the actual SSP pound amount
  // itself rather than requiring the caller to supply it — but ELIGIBILITY
  // (has the employee notified the employer correctly, is this within the
  // same Period of Incapacity for Work / linked-PIW chain, has the
  // 28-week maximum already been used) is NOT verified by this engine;
  // the caller supplies only the number of qualifying days actually being
  // paid, already having determined eligibility themselves.
  ssp_qualifying_days_paid?: number;
  // This employee's normal number of "qualifying days" (contracted
  // working days) in a week — used to convert the statutory WEEKLY
  // amount into this employee's own daily rate. Required whenever
  // ssp_qualifying_days_paid is supplied.
  ssp_qualifying_days_per_week?: number;
  // Average Weekly Earnings (AWE), as HMRC's SSP AWE reference-period
  // calculation would determine it — a caller-supplied dynamic fact, not
  // something this engine derives. Required whenever SSP inputs are
  // supplied: HMRC's 2026/27 SSP rate is "GBP 123.25 per week OR 80% of
  // AWE, whichever is LOWER" (not a flat GBP 123.25 for everyone) — see
  // ssp in the rule pack below and the corresponding limitations entry.
  ssp_average_weekly_earnings?: number;
};

export type UkPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UkEmployeeInput[];
};

export type UkJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_PENSION_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_INCOME_TAX_PAYABLE'
    | 'NATIONAL_INSURANCE_PAYABLE'
    | 'STUDENT_LOAN_PAYABLE'
    | 'PENSION_PAYABLE';
  amount: number;
};

export type UkEmployeeResult = {
  employee_id: string;
  name?: string;
  // Ordinary contractual pay PLUS any Statutory Sick Pay paid this period
  // (see ssp below) — the full amount subject to PAYE/NI/pension, matching
  // HMRC's own treatment of SSP as ordinary taxable/NICable pay. Equal to
  // the contractual gross_pay input alone when ssp is 0.
  gross_pay: number;
  ssp: number;
  nation: UkNation;
  paye_income_tax: number;
  employee_ni: number;
  employer_ni: number;
  student_loan_deduction: number;
  postgraduate_loan_deduction: number;
  employee_pension: number;
  employer_pension: number;
  net_pay: number;
  employer_funded_total: number;
};

export type UkPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'GB';
  currency: 'GBP';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UkEmployeeResult[];
  totals: {
    gross_pay: number;
    ssp: number;
    paye_income_tax: number;
    employee_ni: number;
    employer_ni: number;
    student_loan_deduction: number;
    postgraduate_loan_deduction: number;
    employee_pension: number;
    employer_pension: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: UkJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_UK = {
  // v2: adds Statutory Sick Pay (SSP). Unlike SUI/WCB-style employer-rated
  // items, SSP's rate is a fixed statutory MAXIMUM (£123.25/week for
  // 2026/27, confirmed directly against gov.uk's own current rates-and-
  // thresholds page — see evidence), not a flat amount everyone gets — see
  // v3 fix below.
  // v3 (golden-fixture pass, UK_2026_27_Payroll_QA_Golden_Pack):
  //   - Fixed a genuine bug: SSP was being paid at the flat £123.25/week
  //     rate (prorated by qualifying days) for every employee, with no cap.
  //     HMRC's actual 2026/27 rule (confirmed both by the independently
  //     re-fetched gov.uk rates page already cited below AND by the
  //     user-supplied implementation reference, section 6) is "GBP 123.25
  //     per week OR 80% of Average Weekly Earnings, whichever is LOWER".
  //     Any employee whose AWE is below ~GBP 154.06/week was being
  //     overpaid SSP by this engine. Fixed by requiring the caller to
  //     supply ssp_average_weekly_earnings alongside the existing two SSP
  //     fields, and capping the weekly SSP amount at
  //     min(123.25, 0.8 x AWE) before prorating to a daily rate.
  //   - Added the 0T (Week1/Month1-only) tax codes and NI category M
  //     (under-21) — see the UkTaxCode / UkNiCategory type comments above
  //     for why these are exact, not approximated, extensions of the
  //     existing calculation methods, verified against
  //     UK-ENG-001/UK-NI-M-001/UK-SCOT-001 in the golden pack.
  id: 'GB-2026-27-PAYE-CAT-A-M-STANDARD-AND-0T-CODES-SSP-DRAFT-V3',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'GBP',
  income_tax: {
    personal_allowance_annual: 12570,
    // Annual TAXABLE-income brackets (after the Personal Allowance is
    // already subtracted), as [atLeast, base, rate]. England/NI and Wales
    // share one table (Wales' C-prefixed codes use the same rates as
    // England per the source document); Scotland has its own.
    brackets_england_or_ni: [
      [0, 0, 0.20], [37700, 7540, 0.40], [125140, 42516, 0.45]
    ] as Array<[number, number, number]>,
    brackets_wales: [
      [0, 0, 0.20], [37700, 7540, 0.40], [125140, 42516, 0.45]
    ] as Array<[number, number, number]>,
    // Derived from the source's gross-income-equivalent band boundaries
    // (stated "assuming the standard GBP 12,570 Personal Allowance") minus
    // that allowance, converting to pure taxable-income bands: starter
    // 12,571-16,537 -> taxable 1-3,967; basic -> 3,968-16,956; intermediate
    // -> 16,957-31,092; higher -> 31,093-62,430; advanced -> 62,431-112,570;
    // top -> above 112,570. Each base amount hand-verified as the previous
    // row's own formula extrapolated to that threshold.
    brackets_scotland: [
      [0, 0, 0.19], [3967, 753.73, 0.20], [16956, 3351.53, 0.21],
      [31092, 6320.09, 0.42], [62430, 19482.05, 0.45], [112570, 42045.05, 0.48]
    ] as Array<[number, number, number]>
  },
  ni: {
    // Class 1, category A only. Thresholds per pay frequency (weekly/
    // monthly), employee rate 8% between PT and UEL then 2% above UEL;
    // employer rate 15% above ST (no special zero-rate band for category
    // A/B/C/J per the source's employer-NI matrix).
    primary_threshold: { WEEKLY: 242, MONTHLY: 1048 } as Record<UkPayFrequency, number>,
    upper_earnings_limit: { WEEKLY: 967, MONTHLY: 4189 } as Record<UkPayFrequency, number>,
    secondary_threshold: { WEEKLY: 96, MONTHLY: 417 } as Record<UkPayFrequency, number>,
    // Under-21 Upper Secondary Threshold (category M) — numerically the
    // same weekly/monthly value as the UEL, but a distinct named threshold
    // per HMRC's employer-NIC relief table (category M gets 0% employer
    // NIC up to this threshold instead of the ordinary ST).
    under21_upper_secondary_threshold: { WEEKLY: 967, MONTHLY: 4189 } as Record<UkPayFrequency, number>,
    employee_rate_to_uel: 0.08,
    employee_rate_above_uel: 0.02,
    employer_rate: 0.15
  },
  student_loan: {
    // Periodic thresholds as published directly (not a simple division of
    // the annual figure, to match HMRC's own stated periodic values
    // exactly). Deduction = (earnings - threshold) x rate, rounded DOWN to
    // the nearest whole pound per HMRC's own rounding rule.
    thresholds: {
      PLAN_1: { WEEKLY: 517.30, MONTHLY: 2241.66 },
      PLAN_2: { WEEKLY: 565.09, MONTHLY: 2448.75 },
      PLAN_4: { WEEKLY: 649.90, MONTHLY: 2816.25 },
      PLAN_5: { WEEKLY: 480.76, MONTHLY: 2083.33 }
    } as Record<UkStudentLoanPlan, Record<UkPayFrequency, number>>,
    postgraduate_threshold: { WEEKLY: 403.84, MONTHLY: 1750.00 } as Record<UkPayFrequency, number>,
    undergraduate_rate: 0.09,
    postgraduate_rate: 0.06
  },
  pension: {
    // Simple qualifying-earnings-band auto-enrolment minimum: 5% employee /
    // 3% employer (8% total) of earnings between the lower and upper
    // qualifying-earnings limits for the pay period, gated on a
    // caller-supplied enrolment flag (assessment itself is not modeled).
    qualifying_earnings_lower: { WEEKLY: 120, MONTHLY: 520 } as Record<UkPayFrequency, number>,
    qualifying_earnings_upper: { WEEKLY: 967, MONTHLY: 4189 } as Record<UkPayFrequency, number>,
    employee_rate: 0.05,
    employer_rate: 0.03
  },
  ssp: {
    // Statutory Sick Pay 2026/27 — confirmed directly from gov.uk's own
    // current "Rates and thresholds for employers 2026 to 2027" page, and
    // by the user-supplied implementation reference (section 6): the
    // amount is GBP 123.25 per week OR 80% of Average Weekly Earnings,
    // WHICHEVER IS LOWER — this constant is a ceiling, not a flat amount
    // (see calculateUkPayroll, v3 bug fix in the top-of-file changelog).
    // From 6 April 2026 SSP reform removed BOTH the 3-day waiting period
    // (paid from day 1) AND the Lower Earnings Limit eligibility test —
    // see limitations for what this engine still can't verify itself.
    weekly_rate_ceiling: 123.25,
    awe_percentage: 0.80
  },
  evidence: [
    { authority: 'HM Revenue & Customs / GOV.UK', instrument: 'Rates and thresholds for employers 2026 to 2027 (Personal Allowance GBP 12,570; England/NI/Wales bands 20%/40%/45%)', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027' },
    { authority: 'Scottish Government', instrument: 'Scottish Income Tax rates and bands 2026/27 (19%/20%/21%/42%/45%/48%)', url: 'https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/' },
    { authority: 'HM Revenue & Customs', instrument: 'National Insurance software-developer specification 2026/27 (Class 1 category A thresholds/rates)', url: 'https://www.gov.uk/government/publications/payroll-technical-specifications-national-insurance' },
    { authority: 'HM Revenue & Customs', instrument: 'Collection of student loans from 6 April 2026 (Plans 1/2/4/5, Postgraduate Loan thresholds/rates)', url: 'https://www.gov.uk/government/publications/payroll-technical-specifications-student-loans/collection-of-student-loans-from-6-april-2026' },
    { authority: 'The Pensions Regulator', instrument: 'Qualifying earnings band and 3%/8% statutory minimum contribution basis', url: 'https://www.thepensionsregulator.gov.uk/en/business-advisers/automatic-enrolment-guide-for-business-advisers/minimum-contribution-increases-planned-by-law-phasing' },
    { authority: 'User-supplied reference', instrument: '"UK 2026/27 Payroll Implementation Reference" (verified 14 Sep 2026) — the source document this pack was built from; parameters not independently re-fetched from GOV.UK/HMRC directly this pass.', url: 'file: UK_2026_27_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' },
    { authority: 'HM Revenue & Customs / GOV.UK', instrument: 'Rates and thresholds for employers 2026 to 2027 — Statutory Sick Pay weekly rate £123.25 as a ceiling (80% of AWE if lower), independently re-fetched directly (not via the implementation-reference document)', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027' },
    { authority: 'HM Revenue & Customs / GOV.UK', instrument: 'Sickness absences that start before and end on or after 6 April 2026 — confirms the 80%-of-AWE-or-£123.25-whichever-is-lower rule and removal of the LEL eligibility test / 3-day wait, independently re-fetched', url: 'https://www.gov.uk/guidance/sickness-absences-that-start-before-and-end-on-or-after-6-april-2026' },
    { authority: 'User-supplied golden QA pack', instrument: 'UK_2026_27_Payroll_QA_Golden_Pack (verified 2026-09-14): UK_2026_27_Payroll_Golden_Fixtures.json plus PDF/CSV — 4 payslip fixtures (0T M1 standard, NI category M employer relief, Scottish S0T M1 starter band, 2026 SSP low-AWE first-day rule) and 4 boundary-test assertions. Used to close the "zero directly-testable UK fixtures" gap and drive the v3 fixes above.', url: 'file: UK_2026_27_Payroll_QA_Golden_Pack/ (user-supplied, 2026-09-16)' }
  ],
  limitations: [
    'v1/v3: Only tax codes 1257L / S1257L / C1257L (standard cumulative, no other income/benefits/adjustments) and 0T M1 / 0T W1 / S0T M1 / S0T W1 / C0T M1 / C0T W1 (no-allowance, non-cumulative Week1/Month1 operation) are supported. All other codes (BR, D0/D1, K codes, bare cumulative 0T without a W1/M1 marker, X marker) are REJECTED with an explicit error. For the 0T M1/W1 codes specifically, this engine\'s existing annualize-and-divide calculation (see the PAYE Income Tax entry below) is the mathematically correct HMRC non-cumulative method, not an approximation — verified against golden fixtures UK-ENG-001, UK-NI-M-001 and UK-SCOT-001 (0T M1/S0T M1, gross GBP 3,000 and GBP 300 monthly, exact-penny match).',
    'Statutory Sick Pay (SSP), v3: computed ONLY when the caller supplies ssp_qualifying_days_paid, ssp_qualifying_days_per_week, AND ssp_average_weekly_earnings together. The weekly SSP amount is capped at the LOWER of the 2026/27 statutory ceiling (£123.25) and 80% of the supplied AWE (fixed in v3 — v2 incorrectly paid the flat £123.25 rate regardless of AWE; see the rule-pack id changelog above and evidence). That capped weekly amount is prorated to a daily rate by the employee\'s own qualifying-days-per-week pattern, then multiplied by days paid. The result is added to gross_pay (SSP is ordinary taxable/NICable/pensionable pay, per HMRC\'s own treatment) and also reported separately as ssp for transparency. This engine does NOT verify SSP eligibility itself — correct employee notification, Period of Incapacity for Work (PIW) linking across a sickness sequence, or the 28-week statutory maximum — nor does it compute AWE itself (the caller supplies it, already correctly derived over HMRC\'s relevant period). SSP can no longer be reclaimed from HMRC for most employers under the 2026/27 rules, so no separate employer-recovery figure is computed; the cost is simply part of gross_pay/SALARY_EXPENSE like ordinary wages. SMP/SPP/SAP/ShPP/SPBP/SNCP (all other statutory payments) remain entirely unimplemented — see below.',
    'PAYE Income Tax uses a simplified ANNUALIZE-CURRENT-PERIOD-AND-DIVIDE approximation, not HMRC\'s true cumulative PAYE routine (which compares cumulative year-to-date tax due against cumulative tax already deducted). This will diverge from the correct figure whenever an employee\'s pay varies from period to period under a CUMULATIVE code (1257L/S1257L/C1257L) — most divergent for a large one-off bonus or a mid-year pay change. The same approximation and the same disclosed limitation already exists for Germany\'s Lohnsteuer in payroll-engine-de.ts. This limitation does NOT apply to the 0T M1/W1 codes added in v3, since non-cumulative operation is defined by HMRC to work exactly this way (see above).',
    'Only Class 1 National Insurance categories A (standard employee) and M (under-21) are implemented. Categories B/C/D/E/F/H/I/J/K/L/N/S/V/Z — married-woman reduced rate, State Pension age, Freeport/Investment Zone, apprentices under 25, veterans, deferment — are REJECTED, not approximated. Directors\' annual/alternative NI earnings-period method is not implemented; a director must not be run through this engine.',
    'Student/Postgraduate Loans: only the ordinary periodic-threshold formula for a regular pay period is implemented. Irregular pay periods (HMRC\'s day-based/number-of-periods logic) and protected-earnings-order interaction are not implemented.',
    'Workplace pension: implements only the 5%/3% qualifying-earnings-band minimum contribution, gated on a caller-supplied pension_enrolled flag. Auto-enrolment ASSESSMENT (age 22-to-State-Pension-Age, GBP 10,000 earnings trigger, postponement, opt-out/refund) is NOT modeled — the caller must already know whether the employee should be enrolled.',
    'NOT IMPLEMENTED AT ALL, rejected outright: statutory payments OTHER than SSP (SMP/SPP/SAP/ShPP/SPBP/SNCP) and their employer recovery; Apprenticeship Levy; Employment Allowance; Class 1A/1B (benefits in kind, termination awards, PAYE Settlement Agreements); salary sacrifice/benefits-in-kind wage adjustments; attachment of earnings / court order deductions; RTI (FPS/EPS) generation. RTI in particular is not a calculation gap this engine could close by adding a formula — it is a live submission to HMRC\'s Government Gateway requiring real filing credentials and an actual API integration, fundamentally different in kind from every other item in this file. This engine prepares payroll and accounting outputs only — it does not file with HMRC.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing HMRC/GOV.UK/Scottish Government/The Pensions Regulator), not independently re-fetched from GOV.UK/HMRC directly this pass except where an evidence entry says otherwise. Should be reconfirmed against HMRC\'s own Specification for PAYE Tax Table Routines, NI specification, and Student Loan specification, and validated against HMRC\'s official 2026/27 payroll test data (the HMRC official software test data pack — NOT included in the golden pack used for this v3 pass), before this pack is marked VERIFIED_BASIC_RULES.',
    'This v3 pass closed the pack\'s previously-disclosed "zero directly-testable golden fixtures" gap using a user-supplied 4-fixture + 4-boundary-assertion golden QA pack (UK_2026_27_Payroll_QA_Golden_Pack, verified 2026-09-14) covering: 0T M1 standard monthly case, NI category M employer relief, Scottish S0T M1 starter-band low pay, and the 2026 SSP low-AWE first-day rule. That pack itself states HMRC\'s own official 2026/27 payroll test data is "an additional mandatory conformance suite" — this pass did NOT run against HMRC\'s official software test vectors, only against the 4 hand-derived payslip fixtures plus this file\'s own self-test cases. Coverage still NOT exercised by any fixture in hand: K-code 50% cap, categories other than A/M, Plans 1/4 student loans, bare cumulative 0T, W1 (only M1 variants were in the fixture set, though the same math applies), any multi-period/YTD scenario, and Welsh C0T/C1257L (no Welsh fixture was supplied).',
    'This engine does not calculate National Minimum Wage / National Living Wage compliance, mileage/expense rates, or any employer-wide charge not listed above.'
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

function taxCodeInfo(taxCode: UkTaxCode, p: typeof PAYROLL_RULE_PACK_UK): { nation: UkNation; brackets: Array<[number, number, number]>; personalAllowanceAnnual: number } {
  switch (taxCode) {
    case '1257L':
      return { nation: 'ENGLAND_OR_NI', brackets: p.income_tax.brackets_england_or_ni, personalAllowanceAnnual: p.income_tax.personal_allowance_annual };
    case 'S1257L':
      return { nation: 'SCOTLAND', brackets: p.income_tax.brackets_scotland, personalAllowanceAnnual: p.income_tax.personal_allowance_annual };
    case 'C1257L':
      return { nation: 'WALES', brackets: p.income_tax.brackets_wales, personalAllowanceAnnual: p.income_tax.personal_allowance_annual };
    case '0T M1':
    case '0T W1':
      // 0T = no Personal Allowance under the code.
      return { nation: 'ENGLAND_OR_NI', brackets: p.income_tax.brackets_england_or_ni, personalAllowanceAnnual: 0 };
    case 'S0T M1':
    case 'S0T W1':
      return { nation: 'SCOTLAND', brackets: p.income_tax.brackets_scotland, personalAllowanceAnnual: 0 };
    case 'C0T M1':
    case 'C0T W1':
      return { nation: 'WALES', brackets: p.income_tax.brackets_wales, personalAllowanceAnnual: 0 };
  }
}

export function calculateUkPayroll(input: UkPayrollRunInput): UkPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_UK;
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

    if (employee.pay_frequency !== 'WEEKLY' && employee.pay_frequency !== 'MONTHLY') {
      const error = new Error(`pay_frequency for ${employeeId} must be WEEKLY or MONTHLY`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const validTaxCodes: UkTaxCode[] = ['1257L', 'S1257L', 'C1257L', '0T M1', '0T W1', 'S0T M1', 'S0T W1', 'C0T M1', 'C0T W1'];
    if (!validTaxCodes.includes(employee.tax_code)) {
      const error = new Error(`tax_code for ${employeeId} must be one of ${validTaxCodes.join(', ')} (only these standard cumulative and non-cumulative 0T codes are implemented)`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (employee.ni_category !== 'A' && employee.ni_category !== 'M') {
      const error = new Error(`ni_category for ${employeeId} must be 'A' or 'M' (only NI categories A and M are implemented)`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (employee.student_loan_plan !== undefined &&
        employee.student_loan_plan !== 'PLAN_1' && employee.student_loan_plan !== 'PLAN_2' &&
        employee.student_loan_plan !== 'PLAN_4' && employee.student_loan_plan !== 'PLAN_5') {
      const error = new Error(`student_loan_plan for ${employeeId} must be PLAN_1, PLAN_2, PLAN_4, PLAN_5, or omitted`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.postgraduate_loan !== 'boolean') {
      const error = new Error(`postgraduate_loan must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.pension_enrolled !== 'boolean') {
      const error = new Error(`pension_enrolled must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const freq = employee.pay_frequency;
    const periodsPerYear = freq === 'WEEKLY' ? 52 : 12;
    const contractualGrossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);

    // --- Statutory Sick Pay (SSP); see limitations ---
    const sspDaysProvided = employee.ssp_qualifying_days_paid !== undefined;
    const sspPatternProvided = employee.ssp_qualifying_days_per_week !== undefined;
    const sspAweProvided = employee.ssp_average_weekly_earnings !== undefined;
    if (sspDaysProvided !== sspPatternProvided || sspDaysProvided !== sspAweProvided) {
      const error = new Error(`${employeeId}: ssp_qualifying_days_paid, ssp_qualifying_days_per_week and ssp_average_weekly_earnings must all be supplied together, or all omitted`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    let sspAmount = 0;
    if (sspDaysProvided) {
      const daysPaid = employee.ssp_qualifying_days_paid as number;
      const daysPerWeek = employee.ssp_qualifying_days_per_week as number;
      const awe = employee.ssp_average_weekly_earnings as number;
      if (!Number.isFinite(daysPaid) || daysPaid < 0 || daysPaid > 7) {
        const error = new Error(`ssp_qualifying_days_paid for ${employeeId} must be between 0 and 7`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
        const error = new Error(`ssp_qualifying_days_per_week for ${employeeId} must be an integer from 1 to 7`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isFinite(awe) || awe < 0) {
        const error = new Error(`ssp_average_weekly_earnings for ${employeeId} must be a non-negative number`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      // HMRC 2026/27 rule: SSP is the LOWER of the statutory ceiling and
      // 80% of AWE — not a flat rate for everyone (see rule-pack v3 fix).
      const weeklyAmount = Math.min(p.ssp.weekly_rate_ceiling, money(awe * p.ssp.awe_percentage));
      const dailyRate = money(weeklyAmount / daysPerWeek);
      sspAmount = money(dailyRate * daysPaid);
    }
    // SSP is ordinary taxable/NICable/pensionable pay per HMRC's own
    // treatment — folded into grossPay so every downstream calculation
    // (PAYE, NI, student loan, pension) applies to it automatically.
    const grossPay = money(contractualGrossPay + sspAmount);

    // --- PAYE income tax (simplified annualize-and-divide; exact for the
    // 0T M1/W1 non-cumulative codes, an approximation for 1257L-family
    // cumulative codes — see limitations) ---
    const { nation, brackets, personalAllowanceAnnual } = taxCodeInfo(employee.tax_code, p);
    const annualGross = money(grossPay * periodsPerYear);
    const annualTaxable = Math.max(0, money(annualGross - personalAllowanceAnnual));
    const annualTax = bracketLookup(annualTaxable, brackets);
    const payeIncomeTax = money(annualTax / periodsPerYear);

    // --- Class 1 National Insurance, categories A and M. Employee rates
    // are identical for both (8% to UEL, 2% above). Employer rate differs:
    // category A pays 15% above the ordinary Secondary Threshold; category
    // M (under-21) pays 0% up to the Under-21 UST (numerically the same
    // value as the UEL) and 15% above it. ---
    const pt = p.ni.primary_threshold[freq];
    const uel = p.ni.upper_earnings_limit[freq];
    const st = p.ni.secondary_threshold[freq];
    const ust = p.ni.under21_upper_secondary_threshold[freq];
    const toUelPortion = Math.max(0, Math.min(grossPay, uel) - pt);
    const aboveUelPortion = Math.max(0, grossPay - uel);
    const employeeNi = money(toUelPortion * p.ni.employee_rate_to_uel + aboveUelPortion * p.ni.employee_rate_above_uel);
    const employerNi = employee.ni_category === 'M'
      ? money(Math.max(0, grossPay - ust) * p.ni.employer_rate)
      : money(Math.max(0, grossPay - st) * p.ni.employer_rate);

    // --- Student Loan / Postgraduate Loan ---
    let studentLoanDeduction = 0;
    if (employee.student_loan_plan) {
      const threshold = p.student_loan.thresholds[employee.student_loan_plan][freq];
      const raw = Math.max(0, grossPay - threshold) * p.student_loan.undergraduate_rate;
      studentLoanDeduction = Math.floor(raw);
    }
    let postgraduateLoanDeduction = 0;
    if (employee.postgraduate_loan) {
      const threshold = p.student_loan.postgraduate_threshold[freq];
      const raw = Math.max(0, grossPay - threshold) * p.student_loan.postgraduate_rate;
      postgraduateLoanDeduction = Math.floor(raw);
    }

    // --- Workplace pension (qualifying-earnings-band minimum) ---
    let employeePension = 0;
    let employerPension = 0;
    if (employee.pension_enrolled) {
      const lower = p.pension.qualifying_earnings_lower[freq];
      const upper = p.pension.qualifying_earnings_upper[freq];
      const qualifyingEarnings = Math.max(0, Math.min(grossPay, upper) - lower);
      employeePension = money(qualifyingEarnings * p.pension.employee_rate);
      employerPension = money(qualifyingEarnings * p.pension.employer_rate);
    }

    const netPay = money(grossPay - payeIncomeTax - employeeNi - studentLoanDeduction - postgraduateLoanDeduction - employeePension);
    const employerFundedTotal = money(grossPay + employerNi + employerPension);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      ssp: sspAmount,
      nation,
      paye_income_tax: payeIncomeTax,
      employee_ni: employeeNi,
      employer_ni: employerNi,
      student_loan_deduction: studentLoanDeduction,
      postgraduate_loan_deduction: postgraduateLoanDeduction,
      employee_pension: employeePension,
      employer_pension: employerPension,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    ssp: sum(employees.map(e => e.ssp)),
    paye_income_tax: sum(employees.map(e => e.paye_income_tax)),
    employee_ni: sum(employees.map(e => e.employee_ni)),
    employer_ni: sum(employees.map(e => e.employer_ni)),
    student_loan_deduction: sum(employees.map(e => e.student_loan_deduction)),
    postgraduate_loan_deduction: sum(employees.map(e => e.postgraduate_loan_deduction)),
    employee_pension: sum(employees.map(e => e.employee_pension)),
    employer_pension: sum(employees.map(e => e.employer_pension)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: UkJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_PENSION_EXPENSE', amount: money(totals.employer_ni + totals.employer_pension) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_INCOME_TAX_PAYABLE', amount: totals.paye_income_tax },
    { side: 'CREDIT', account_role: 'NATIONAL_INSURANCE_PAYABLE', amount: money(totals.employee_ni + totals.employer_ni) },
    { side: 'CREDIT', account_role: 'STUDENT_LOAN_PAYABLE', amount: money(totals.student_loan_deduction + totals.postgraduate_loan_deduction) },
    { side: 'CREDIT', account_role: 'PENSION_PAYABLE', amount: money(totals.employee_pension + totals.employer_pension) }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'GB',
    currency: 'GBP',
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

export function payrollEngineSelfTestUK() {
  // Case 1: England, 1257L, MONTHLY, gross GBP 4,000, category A, no loans,
  // not pensioned.
  // Annual gross = 48,000; taxable = 48,000-12,570 = 35,430 (within the
  // 0-37,700 20% band) -> annual tax = 35,430*0.20 = 7,086 -> monthly = 590.50
  // NI: PT=1048, UEL=4189. toUel = min(4000,4189)-1048 = 2952. aboveUel=0.
  // employeeNI = 2952*0.08 = 236.16. employerNI = (4000-417)*0.15 = 537.45.
  const r1 = calculateUkPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'E1', gross_pay: 4000, pay_frequency: 'MONTHLY', tax_code: '1257L',
      ni_category: 'A', postgraduate_loan: false, pension_enrolled: false
    }]
  });
  const e1 = r1.employees[0];

  // Case 2: Scotland, S1257L, MONTHLY, gross GBP 8,000 (advanced-rate range),
  // with Plan 2 student loan, PGL, and pension enrolled.
  // Annual gross = 96,000; taxable = 96,000-12,570 = 83,430.
  // Falls in the "advanced" band (62,430+ at 45%): base 19,482.05 +
  // (83,430-62,430)*0.45 = 19,482.05+9,450 = 28,932.05
  // -> monthly = 28,932.05/12 = 2,411.0041... -> 2411.00
  // NI: toUel = min(8000,4189)-1048 = 3141. aboveUel = 8000-4189=3811.
  // employeeNI = 3141*0.08 + 3811*0.02 = 251.28+76.22 = 327.50
  // employerNI = (8000-417)*0.15 = 1137.45
  // Student loan Plan 2: threshold 2448.75; (8000-2448.75)*0.09=499.6125 -> floor 499
  // PGL: threshold 1750.00; (8000-1750)*0.06=375.00 -> floor 375
  // Pension: qualifying = min(8000,4189)-520 = 3669; EE=3669*0.05=183.45; ER=3669*0.03=110.07
  const r2 = calculateUkPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'E2', gross_pay: 8000, pay_frequency: 'MONTHLY', tax_code: 'S1257L',
      ni_category: 'A', student_loan_plan: 'PLAN_2', postgraduate_loan: true, pension_enrolled: true
    }]
  });
  const e2 = r2.employees[0];

  // Case 3: v3 SSP with AWE well above the cap threshold (AWE=500 ->
  // 80%*500=400 > 123.25 ceiling, so the ceiling binds, same result as the
  // old v2 flat-rate case). WEEKLY, England, fully off sick a whole
  // 5-qualifying-day week, no contractual pay this period. Daily rate =
  // 123.25/5 = 24.65 -> 5 days = 123.25. Folded into gross_pay/PAYE/NI like
  // ordinary pay: annualized 123.25*52=6409 < 12,570 PA -> PAYE 0. NI:
  // PT(weekly) 242 > 123.25 -> employee NI 0. Employer NI:
  // (123.25-96)*0.15=4.09.
  const r3 = calculateUkPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-07', pay_date: '2026-09-07',
    employees: [{
      employee_id: 'E3', gross_pay: 0, pay_frequency: 'WEEKLY', tax_code: '1257L',
      ni_category: 'A', postgraduate_loan: false, pension_enrolled: false,
      ssp_qualifying_days_paid: 5, ssp_qualifying_days_per_week: 5,
      ssp_average_weekly_earnings: 500
    }]
  });
  const e3 = r3.employees[0];

  // Case 4: v3 SSP low-AWE cap. AWE=100 -> 80%*100=80.00 < 123.25 ceiling,
  // so the AWE cap binds (this is the bug fixed in v3: pre-fix this engine
  // would have paid the full 123.25 regardless of AWE). Full 5-qualifying-
  // day week off sick: daily rate = 80/5=16.00 -> 5 days = 80.00.
  const r4 = calculateUkPayroll({
    pay_period_start: '2026-05-11', pay_period_end: '2026-05-17', pay_date: '2026-05-15',
    employees: [{
      employee_id: 'E4', gross_pay: 0, pay_frequency: 'WEEKLY', tax_code: '1257L',
      ni_category: 'A', postgraduate_loan: false, pension_enrolled: false,
      ssp_qualifying_days_paid: 5, ssp_qualifying_days_per_week: 5,
      ssp_average_weekly_earnings: 100
    }]
  });
  const e4 = r4.employees[0];

  const ok =
    e1.paye_income_tax === 590.50 && e1.employee_ni === 236.16 && e1.employer_ni === 537.45 &&
    e1.ssp === 0 &&
    r1.controls.journal_balanced &&
    e2.paye_income_tax === 2411.00 && e2.employee_ni === 327.50 && e2.employer_ni === 1137.45 &&
    e2.student_loan_deduction === 499 && e2.postgraduate_loan_deduction === 375 &&
    e2.employee_pension === 183.45 && e2.employer_pension === 110.07 &&
    r2.controls.journal_balanced &&
    e3.ssp === 123.25 && e3.gross_pay === 123.25 && e3.paye_income_tax === 0 &&
    e3.employee_ni === 0 && e3.employer_ni === 4.09 && e3.net_pay === 123.25 &&
    r3.controls.journal_balanced &&
    e4.ssp === 80.00 && e4.gross_pay === 80.00 && e4.net_pay === 80.00 &&
    r4.controls.journal_balanced;

  return { ok, r1, r2, r3, r4 };
}
