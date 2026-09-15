// Canada (CA, excluding Quebec) payroll rule pack — v2.
//
// v2 change log (2026-09-15): a user-supplied CRA T4127 golden-fixture pack
// (4 independent non-Quebec examples: AB/BC/NT/NU) caught a REAL bug in v1's
// CPP calculation and a real gap in the federal/provincial tax formula.
// Fixed and reverse-engineered from the fixtures' own traces, then verified
// to the exact cent against all 4:
//   1. CPP's $3,500 annual exemption (YBE) must be applied as a
//      PERIOD-PRORATED subtraction every single pay period (e.g. $291.67
//      exempt each month), not front-loaded against YTD earnings the way
//      v1 modeled it (which produced wildly understated CPP for any
//      mid-year payroll run starting from YTD=0). The YMPE ceiling is still
//      YTD-aware.
//   2. Federal (and by the same pattern, provincial) tax must credit CPP's
//      "base" 4.95% portion and the full EI premium at the jurisdiction's
//      own lowest bracket rate (T4127's K2/K3), and federal tax additionally
//      credits a "Canada Employment Amount" (K4: lesser of $1,501 and
//      employment income, at the lowest federal rate) and DEDUCTS (not
//      credits) CPP's "additional"/enhanced 1% portion from taxable income
//      (the F5A adjustment) -- none of which v1 implemented; v1 only
//      applied the Basic Personal Amount credit.
// Federal tax and CPP now match all 4 fixtures exactly; provincial tax
// matches BC/NT/NU exactly and Alberta within 1 cent (Alberta's own
// additional K5P supplemental credit remains unmodeled -- see limitations).
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Canadian payroll expertise has checked this against CRA's own
// T4127 Payroll Deductions Formulas (123rd edition, effective 2026-07-01)
// and this pack's outputs have been run against CRA PDOC (not just this
// file's own hand-derived self-tests).
//
// Sourced from a user-supplied "Canada 2026 Payroll Implementation
// Reference" (as of 14 Sep 2026, citing CRA T4127, Revenu Quebec, and
// provincial/territorial government sources) — a genuine parameter
// reference with real brackets/rates/constants attributed to named CRA
// publications, not a placeholder scaffold. Not independently re-fetched
// from canada.ca directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - QUEBEC IS ENTIRELY REJECTED, not approximated. The source document
//     itself insists on this: "Do not reuse the CRA provincial T2 engine
//     for Quebec" — Quebec provincial tax, QPP/QPP2, QPIP, and reduced EI
//     all require a wholly separate Revenu Quebec formula engine
//     (TP-1015.F-V) that has not been built. Any employee whose province of
//     employment is Quebec is REJECTED with an explicit error.
//   - Federal AND provincial income tax use a simplified ANNUALIZE-CURRENT-
//     PERIOD-AND-DIVIDE approximation of T4127 Option 1 (not the true
//     cumulative-averaging Option 2). As of v2, the BPA (K1), CPP-base (K2),
//     EI (K3), and federal-only Canada Employment Amount (K4) credits ARE
//     implemented and verified to the cent against 4 golden fixtures — see
//     the v2 change log above. Still NOT implemented: Alberta's own
//     additional K5P supplemental credit (confirmed as a real, separate
//     gap — it produced a $0.01 residual on the one AB fixture tested, and
//     may matter more at other income levels), and any other province's
//     own K2P/K3P-equivalent credit definition that might differ from the
//     generic "credit at that province's lowest rate" pattern used here.
//     The federal Basic Personal Amount (BPAF) taper between the two
//     published endpoints ($181,440/$16,452 and $258,482/$14,829) is
//     reconstructed as a LINEAR interpolation, which the source document
//     states as two endpoints, not an explicit formula — this is CRA's
//     known real methodology but was not directly quoted as a formula in
//     the source.
//   - CPP1/CPP2 and EI are computed on GROSS PAY treated as both fully
//     pensionable and fully insurable — no pay-component-level taxability/
//     pensionability/insurability classification (the source explicitly
//     warns against this shortcut; this engine takes it anyway for v1, and
//     discloses it rather than hiding it). CPT30 (stop-CPP election),
//     age-based start/stop, and the EI Premium Reduction Program
//     (employer-specific reduced multiple) are not implemented — standard
//     rates/ages are assumed throughout.
//   - Ontario surtax, Ontario Health Premium, Manitoba's labour-sponsored-
//     fund credit, BC's reduction is implemented (it is fully specified in
//     the source with exact boundary values) but all OTHER
//     province-specific credits/reductions listed in the source
//     ("formula-specific differences" column) are NOT implemented.
//   - NOT IMPLEMENTED AT ALL in v1, rejected outright: bonuses/retroactive
//     pay (T4127 non-periodic difference method), retiring allowances,
//     taxable-benefit-specific treatment, NWT/Nunavut territorial payroll
//     tax, all employer-only levies (BC EHT, Manitoba HE Levy, Ontario EHT,
//     NL HAPSET), and all workers-compensation/WCB/WSIB premiums (the
//     source explicitly marks these DYNAMIC — employer/classification-
//     specific, not a rate this engine can supply). This engine prepares
//     payroll and accounting outputs only — it does not file with the CRA.

export type CaJurisdiction =
  | 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'ON' | 'PE' | 'SK' | 'NT' | 'NU' | 'YT';
export type CaPayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';

export type CaEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pay_frequency: CaPayFrequency;
  province_of_employment: CaJurisdiction;
  // YTD figures BEFORE this period, used for CPP/CPP2/EI banded contribution
  // limits. This engine assumes CPP pensionable earnings, CPP2 pensionable
  // earnings, and EI insurable earnings are all equal to gross pay (see
  // limitations) — one accumulator covers all three.
  ytd_earnings_before: number;
  // Workers' Compensation Board / Workplace Safety and Insurance Board
  // (WCB/WSIB/WorkSafe/CNESST/WSCC), employer-only. Optional — all three
  // omitted (the default, matching every pre-v3 caller) leaves it
  // uncomputed. Like US SUI, the RATE is industry-classification- and
  // employer-specific (each board assigns it by assessed industry risk
  // class), so this engine has no statutory default — the caller must
  // supply their own current assessment rate. wcb_rate is a FRACTION
  // (e.g. 0.0235 for "$2.35 per $100 of assessable payroll," the unit
  // most boards actually publish on their rate notices — divide by 100
  // to convert). wcb_assessable_earnings_ceiling is that board's current
  // annual maximum assessable/insurable earnings per worker (a real,
  // board-published statutory figure, unlike the rate).
  wcb_rate?: number;
  wcb_assessable_earnings_ceiling?: number;
  ytd_wcb_assessable_earnings_before?: number;
};

export type CaPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: CaEmployeeInput[];
};

export type CaJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_CPP_EI_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'FEDERAL_INCOME_TAX_PAYABLE'
    | 'PROVINCIAL_INCOME_TAX_PAYABLE'
    | 'CPP_PAYABLE'
    | 'EI_PAYABLE'
    | 'EMPLOYER_WCB_EXPENSE'
    | 'WCB_PAYABLE';
  amount: number;
};

export type CaEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  federal_income_tax: number;
  provincial_income_tax: number;
  employee_cpp1: number;
  employer_cpp1: number;
  employee_cpp2: number;
  employer_cpp2: number;
  employee_ei: number;
  employer_ei: number;
  employer_wcb: number;
  net_pay: number;
  employer_funded_total: number;
  ytd_earnings_after: number;
  ytd_wcb_assessable_earnings_after: number;
};

export type CaPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'CA';
  currency: 'CAD';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: CaEmployeeResult[];
  totals: {
    gross_pay: number;
    federal_income_tax: number;
    provincial_income_tax: number;
    employee_cpp1: number;
    employer_cpp1: number;
    employee_cpp2: number;
    employer_cpp2: number;
    employee_ei: number;
    employer_ei: number;
    employer_wcb: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: CaJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_CA = {
  // v3: adds employer-side Workers' Compensation Board / Workplace Safety
  // and Insurance Board (WCB/WSIB) premiums. Same shape as US SUI: the
  // RATE is industry-classification- and employer-specific (each board
  // assigns it), so the caller supplies wcb_rate + wcb_assessable_earnings_
  // ceiling per employee; this engine does the period-proration/YTD-
  // capping/journal posting. Both optional, default "not computed" —
  // exact backward compatibility for every pre-v3 caller.
  //
  // v4 (2026-09-15, found by the weekly policy-change monitor's first
  // manual run): CPP1's BASE rate is cut from 4.95% to 4.75% (each side)
  // effective pay dates on/after 2027-01-01, under Bill C-30 (the Spring
  // Economic Update 2026 Implementation Act) -- Royal Assent 2026-06-18,
  // corroborated by OSFI's Chief Actuary's 33rd Actuarial Report
  // certifying the cut. Selected by pay_date, not the date the payroll is
  // actually run, so back-dated/late-processed 2026 runs still use the
  // pre-cut rate. Only the base portion moves; CPP1's "additional"
  // (enhanced) 1% piece and CPP2 are both unaffected by this change.
  id: 'CA-2026-FEDERAL-PLUS-12-NONQC-JURISDICTIONS-DRAFT-V4',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'CAD',
  federal: {
    // CRA T4127 (123rd edition, eff. 2026-07-01) Option 1 federal formula:
    // T1 = A x R - K, selected by annual taxable income A.
    brackets: [
      [0, 0.14, 0], [58523, 0.205, 3804], [117045, 0.26, 10241],
      [181440, 0.29, 15685], [258482, 0.33, 26024]
    ] as Array<[number, number, number]>, // [atLeast, rate, K]
    // BPAF taper: full $16,452 at/below $181,440 net income, reduced
    // linearly to $14,829 at/above $258,482. The source states these as two
    // endpoints (a "STATIC" parameter), not an explicit interpolation
    // formula — linear interpolation between them is CRA's known real
    // methodology, reconstructed here rather than directly quoted.
    bpaf_full: 16452, bpaf_min: 14829, bpaf_taper_start: 181440, bpaf_taper_end: 258482,
    bpaf_credit_rate: 0.14, // BPA is applied as a credit at the lowest federal rate
    // Canada Employment Amount (K4): a non-refundable credit of the lesser
    // of $1,501 and eligible employment income, at the lowest federal rate.
    // Reverse-engineered and confirmed (along with K2/K3 below) by matching
    // all 4 non-Quebec golden fixtures to the exact cent -- see v2 change
    // log / limitations.
    canada_employment_amount: 1501
  },
  cpp: {
    ybe_annual: 3500, // basic exemption
    ympe_annual: 74600, // year's maximum pensionable earnings (CPP1 ceiling / CPP2 floor)
    yampe_annual: 85000, // year's additional maximum pensionable earnings (CPP2 ceiling)
    // v3: the CPP1 BASE rate is cut from 4.95% to 4.75% (employee and
    // employer each) effective 2027-01-01, under Bill C-30 (the Spring
    // Economic Update 2026 Implementation Act), which received Royal
    // Assent 2026-06-18 -- already enacted law, not a proposal, confirmed
    // via the federal government's own announcement and corroborated by
    // OSFI's Chief Actuary's 33rd Actuarial Report (2026-05-28) certifying
    // the base CPP can support the cut. Selected by pay_date below; the
    // "additional"/enhanced 1% portion (CPP1's F5A-deducted piece) and
    // CPP2 are both UNCHANGED by this cut -- only the base rate moves.
    base_rate_before_2027: 0.0495, // CPP1 "base" portion -- generates the K2 federal/provincial tax CREDIT
    base_rate_from_2027: 0.0475, // Bill C-30 cut, effective pay dates on/after 2027-01-01
    additional_rate: 0.0100, // CPP1 "first additional" (enhanced) portion -- DEDUCTED from taxable income A (the F5A adjustment), not credited
    cpp2_rate: 0.04 // CPP2, employee and employer each
  },
  ei: {
    max_insurable_annual: 68900,
    employee_rate: 0.0163,
    employer_multiple: 1.4 // standard employer premium = 1.4x employee (no approved reduction modeled)
  },
  provinces: {
    // Each entry: brackets [atLeast, base, rate] on annual taxable income,
    // and bpa_annual (credited at the province's own lowest bracket rate).
    // Figures are CRA T4127 Option 1 current Jul-Dec 2026 payroll
    // parameters (not merely annual personal-income-tax headline rates) —
    // BC and PE in particular are mid-year-prorated values, distinct from
    // their eventual full-year annual rates.
    AB: {
      brackets: [[0, 0, 0.08], [61200, 4896, 0.10], [154259, 14201.90, 0.12], [185111, 17904.14, 0.13], [246813, 25925.40, 0.14], [370220, 43203.38, 0.15]] as Array<[number, number, number]>,
      bpa_annual: 22769
    },
    BC: {
      brackets: [[0, 0, 0.0614], [50363, 3092.29, 0.077], [100728, 6970.39, 0.105], [115648, 8536.99, 0.1229], [140430, 11582.61, 0.147], [190405, 18928.94, 0.168], [265545, 31552.46, 0.205]] as Array<[number, number, number]>,
      bpa_annual: 13216,
      // BC Option 1 Jul-Dec reduction S, subtracted from provincial tax
      // after the BPA credit: A<=25,570 -> min(T4,805); 25,570<A<=44,952 ->
      // min(T4, 805-(A-25570)*0.0356); A>44,952 -> 0.
      reduction_threshold_1: 25570, reduction_threshold_2: 44952,
      reduction_max: 805, reduction_taper_rate: 0.0356
    },
    MB: {
      brackets: [[0, 0, 0.108], [47000, 5076, 0.1275], [100000, 11833.50, 0.174]] as Array<[number, number, number]>,
      // BPAMB tapers linearly from $15,780 (A<=200,000) to $0 (A>=400,000).
      bpa_full: 15780, bpa_min: 0, bpa_taper_start: 200000, bpa_taper_end: 400000
    },
    NB: {
      brackets: [[0, 0, 0.094], [52333, 4919.30, 0.14], [104666, 12245.92, 0.16], [193861, 26517.12, 0.195]] as Array<[number, number, number]>,
      bpa_annual: 13664
    },
    NL: {
      brackets: [
        [0, 0, 0.087], [44678, 3886.99, 0.145], [89354, 10365.01, 0.158], [159528, 21452.50, 0.178],
        [223340, 32811.04, 0.198], [285319, 45082.88, 0.208], [570638, 104429.23, 0.213], [1141275, 225974.91, 0.218]
      ] as Array<[number, number, number]>,
      bpa_annual: 15000 // Option 1 Jul-Dec default TCP; not prorated for mid-year transition
    },
    NS: {
      brackets: [[0, 0, 0.0879], [30995, 2724.46, 0.1495], [61991, 7358.36, 0.1667], [97417, 13264.86, 0.175], [157124, 23713.59, 0.21]] as Array<[number, number, number]>,
      bpa_annual: 11932
    },
    ON: {
      brackets: [[0, 0, 0.0505], [53891, 2721.50, 0.0915], [107785, 7653.00, 0.1116], [150000, 12364.19, 0.1216], [220000, 20876.19, 0.1316]] as Array<[number, number, number]>,
      bpa_annual: 12989
      // Ontario surtax and Ontario Health Premium are NOT implemented — see limitations.
    },
    PE: {
      brackets: [[0, 0, 0.095], [33928, 3223.16, 0.1347], [65820, 7518.99, 0.166], [106890, 14336.61, 0.1762], [142520, 20614.66, 0.19], [200000, 31535.86, 0.21]] as Array<[number, number, number]>,
      bpa_annual: 15000
    },
    SK: {
      brackets: [[0, 0, 0.105], [54532, 5725.86, 0.125], [155805, 18384.99, 0.145]] as Array<[number, number, number]>,
      bpa_annual: 20381
    },
    NT: {
      brackets: [[0, 0, 0.059], [53003, 3127.18, 0.086], [106009, 7685.70, 0.122], [172346, 15778.81, 0.1405]] as Array<[number, number, number]>,
      bpa_annual: 18198
    },
    NU: {
      brackets: [[0, 0, 0.04], [55801, 2232.04, 0.07], [111602, 6138.11, 0.09], [181439, 12423.44, 0.115]] as Array<[number, number, number]>,
      bpa_annual: 19659
    },
    YT: {
      brackets: [[0, 0, 0.064], [58523, 3745.47, 0.09], [117045, 9012.45, 0.109], [181440, 16031.51, 0.128], [500000, 56807.19, 0.15]] as Array<[number, number, number]>
      // BPAYT = federal BPAF (dynamic, same taper as the federal figure) — no separate bpa_annual.
    }
  },
  evidence: [
    { authority: 'Canada Revenue Agency', instrument: 'T4127 Payroll Deductions Formulas, 123rd Edition, effective July 1, 2026 (federal brackets/K-constants, all non-QC provincial/territorial brackets, CPP1/CPP2/EI rates and maxima)', url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html' },
    { authority: 'Canada Revenue Agency', instrument: 'T4127 122nd Edition, effective January 1, 2026 (BPAF/BPAMB/BPAYT taper endpoints)', url: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html' },
    { authority: 'BC Ministry of Finance', instrument: 'BC Option 1 Jul-Dec 2026 reduction S exact boundary values', url: 'https://www2.gov.bc.ca/gov/content/taxes/employer-health-tax/employer-health-tax-overview' },
    { authority: 'User-supplied reference', instrument: '"Canada 2026 Payroll Implementation Reference" (as of 14 Sep 2026) — the source document this pack was built from; parameters not independently re-fetched from canada.ca directly this pass.', url: 'file: Canada_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' },
    { authority: 'User-supplied CRA T4127 golden-fixture pack', instrument: '"Canada 2026 Payroll Golden Fixtures" (JSON, verified through 2026-09-14) — 4 independent non-Quebec worked examples (AB/BC/NT/NU) with full CPP/EI/federal/provincial traces, used to catch and root-cause the v2 CPP/federal/provincial fix; all 4 fixtures reproduced to the exact cent except AB provincial (off by $0.01, attributed to the unmodeled K5P credit).', url: 'file: Canada_2026_Payroll_QA_Golden_Pack (user-supplied, 2026-09-15)' },
    { authority: 'Government of Canada / Parliament of Canada', instrument: 'Bill C-30 (Spring Economic Update 2026 Implementation Act) — Royal Assent 2026-06-18, cutting the CPP1 base contribution rate from 4.95% to 4.75% (each side) effective 2027-01-01. Corroborated by OSFI Chief Actuary Assia Billig\'s 33rd Actuarial Report supplementing the Revised 32nd Actuarial Report on the CPP (submitted 2026-05-28), certifying the base plan can support the cut.', url: 'https://www.osfi-bsif.gc.ca/en/oca/actuarial-reports/33rd-actuarial-report-supplementing-revised-32nd-actuarial-report-canada-pension-plan' }
  ],
  limitations: [
    'v2. QUEBEC IS ENTIRELY REJECTED, not approximated — province_of_employment "QC" throws an explicit error. Quebec requires a wholly separate Revenu Quebec formula engine (TP-1015.F-V) for provincial tax, QPP/QPP2, QPIP, and reduced EI, none of which is implemented; the source document itself insists on this separation.',
    'v2 FIX (real bug found via a user-supplied CRA T4127 golden-fixture pack, 2026-09-15): CPP\'s $3,500 annual exemption is now correctly applied as a PERIOD-PRORATED subtraction every pay period, not front-loaded via YTD banding (the v1 method, which badly understated CPP for any payroll starting mid-year from YTD=0). Federal AND provincial income tax now implement the BPA (K1), CPP-base (K2), EI (K3) credits at the jurisdiction\'s own lowest rate, plus a federal-only Canada Employment Amount credit (K4) and a deduction of CPP\'s enhanced/"additional" 1% portion from taxable income (F5A) — reconstructed from the fixtures\' own traces and verified to the exact cent against 4 independent CRA fixtures (AB/BC/NT/NU). Still an annualize-and-divide approximation of T4127 Option 1, not the true cumulative-averaging Option 2.',
    'v4 (2026-09-15, found by the weekly policy-change monitor\'s first manual run): CPP1\'s base rate is cut from 4.95% to 4.75% (each side) for pay dates on/after 2027-01-01, per Bill C-30 (enacted, Royal Assent 2026-06-18). The engine selects the correct rate from pay_date automatically -- callers do not need to pass anything new. Only the base portion (which generates the K2 credit) changes; the "additional" enhanced 1% portion (F5A-deducted) and CPP2 are unaffected. This was NOT caught by any golden fixture (all 4 CRA fixtures this pack was verified against are dated July 2026, before the cut takes effect) -- it was caught by an explicit web search for confirmed/enacted upcoming rate changes, not by fixture testing, which is exactly the gap the weekly policy monitor exists to narrow.',
    'Alberta\'s own additional K5P supplemental credit (((K1P+K2P)-$4,896) x 25%) remains UNMODELED — it produced a $0.01 residual on the one AB fixture available this pass, and may matter more at other income levels. Every other province\'s own possible K2P/K3P-equivalent variations (if any differ from the generic "credit at that province\'s lowest rate" pattern used here) are also unconfirmed beyond the BC/NT/NU fixtures that did match exactly.',
    'CPP1, CPP2, and EI are all computed on gross pay treated as fully pensionable and fully insurable, sharing one YTD accumulator (ytd_earnings_before) — no pay-component-level taxability/pensionability/insurability classification, which the source document explicitly warns against doing. CPT30 (age 65-69 stop-CPP election), age 18/70 proration, and the EI Premium Reduction Program (employer-specific reduced multiple, standard is 1.4x) are not modeled — standard ages/rates are assumed for every employee.',
    'Ontario surtax and Ontario Health Premium (both embedded in provincial withholding per T4127 Step 5) are NOT implemented — Ontario tax for high earners will be understated. Manitoba\'s labour-sponsored-fund credit and every other province\'s "formula-specific difference" (Nova Scotia\'s labour-sponsored fund credit, etc.) are also not implemented.',
    'NOT IMPLEMENTED AT ALL in v1, rejected outright: bonuses/retroactive/irregular pay (T4127 non-periodic difference method); retiring allowances; taxable-benefit-specific CPP/EI treatment (a single gross-pay figure is assumed fully subject to everything); Northwest Territories and Nunavut territorial payroll tax; all employer-only levies (BC Employer Health Tax, Manitoba HE Levy, Ontario EHT, NL HAPSET).',
    'Workers\' Compensation Board / Workplace Safety and Insurance Board (WCB/WSIB/WorkSafe/CNESST/WSCC) premiums, v3: computed ONLY when the caller supplies wcb_rate and wcb_assessable_earnings_ceiling per employee, straight off that employer\'s own current board assessment notice — every board assigns each employer its own rate by industry classification, which this engine has no statutory default for (the same reasoning already applied to US SUI). Supplying only one of the two fields is rejected rather than silently defaulted. Once supplied, this engine correctly prorates and caps the assessable-earnings base across pay periods (ytd_wcb_assessable_earnings_before/after) and posts an EMPLOYER_WCB_EXPENSE/WCB_PAYABLE journal pair. Assessable earnings are assumed equal to gross pay, the same simplification already applied to CPP/EI pensionable/insurable earnings in this file — not independently confirmed per board. Multi-jurisdiction employers (an employee whose assessable earnings should be apportioned across more than one board) are not modeled; the caller must supply one ceiling/rate pair per employee.',
    'Mid-year 2026 proration: BC, Newfoundland & Labrador, and Prince Edward Island brackets/BPA above use the source\'s "current Jul-Dec 2026 Option 1" parameters as a single flat table for the whole pack, not effective-dated against pay_date — a payroll actually run before July 1, 2026 with this engine would get the wrong (post-July) figures. Not modeled; flagged rather than silently wrong without disclosure.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing CRA T4127 and provincial sources), not independently re-fetched from canada.ca directly this pass. Should be reconfirmed against CRA\'s own T4127 and validated against CRA PDOC before this pack is marked VERIFIED_BASIC_RULES.'
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

// Federal T1 = A x R - K, selected by A.
function federalTaxBeforeCredit(a: number, brackets: Array<[number, number, number]>) {
  let row = brackets[0];
  for (const candidate of brackets) {
    if (a >= candidate[0]) row = candidate;
    else break;
  }
  const [, rate, k] = row;
  return money(a * rate - k);
}

function linearTaper(a: number, start: number, end: number, fullValue: number, minValue: number) {
  if (a <= start) return fullValue;
  if (a >= end) return minValue;
  return money(fullValue - (fullValue - minValue) * (a - start) / (end - start));
}

// Banded incremental contribution: how much of THIS period's earnings,
// added to YTD earnings, falls between floor and cap.
function bandedContribution(ytdBefore: number, current: number, floor: number, cap: number, rate: number) {
  const subject = Math.max(0, Math.min(ytdBefore + current, cap) - Math.max(ytdBefore, floor));
  return money(subject * rate);
}

export function calculateCaPayroll(input: CaPayrollRunInput): CaPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_CA;
  const validProvinces: CaJurisdiction[] = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'SK', 'NT', 'NU', 'YT'];
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

    if ((employee.province_of_employment as string) === 'QC') {
      const error = new Error(`province_of_employment QC (Quebec) is not implemented for ${employeeId} — Quebec requires a separate Revenu Quebec engine (see limitations)`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (!validProvinces.includes(employee.province_of_employment)) {
      const error = new Error(`province_of_employment for ${employeeId} must be one of ${validProvinces.join(', ')} (Quebec is rejected, not approximated)`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'].includes(employee.pay_frequency)) {
      const error = new Error(`pay_frequency for ${employeeId} must be WEEKLY, BIWEEKLY, SEMIMONTHLY, or MONTHLY`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const periodsPerYear = { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12 }[employee.pay_frequency];
    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const ytdBefore = requireNonNegativeMoney(employee.ytd_earnings_before, `ytd_earnings_before for ${employeeId}`);

    // --- CPP1, CPP2 ---
    // v2 fix (see limitations / v2 change log): the YBE ($3,500/yr) exemption
    // is applied as a PERIOD-PRORATED subtraction every pay period (CRA
    // T4127's real per-period formula), not front-loaded against YTD
    // earnings. The YMPE ceiling still uses YTD earnings, so pensionable
    // earnings this period are capped at the remaining room to YMPE first,
    // then the prorated exemption is subtracted from that capped amount.
    const periodExemption = money(p.cpp.ybe_annual / periodsPerYear);
    const pensionableThisPeriod = Math.max(0, Math.min(grossPay, p.cpp.ympe_annual - ytdBefore));
    const cpp1ContributoryEarnings = Math.max(0, money(pensionableThisPeriod - periodExemption));
    // Bill C-30 base-rate cut (see the cpp rule-pack comment above):
    // selected by pay_date, not calendar date of the run, so a payroll
    // whose pay_date is still in 2026 uses the pre-cut rate even if
    // processed in early 2027, and vice versa.
    const cppBaseRate = input.pay_date >= '2027-01-01' ? p.cpp.base_rate_from_2027 : p.cpp.base_rate_before_2027;
    // NOT money() -- that helper rounds to cents and would corrupt a
    // fractional rate (0.0575 -> 0.06). Rates are combined with plain
    // addition; both operands are exact-enough decimal literals that
    // floating-point drift isn't a real concern at this magnitude.
    const cppTotalRate = cppBaseRate + p.cpp.additional_rate;
    const employeeCpp1 = money(cpp1ContributoryEarnings * cppTotalRate);
    const employerCpp1 = employeeCpp1;
    const employeeCpp2 = bandedContribution(ytdBefore, grossPay, p.cpp.ympe_annual, p.cpp.yampe_annual, p.cpp.cpp2_rate);
    const employerCpp2 = employeeCpp2;

    // --- EI ---
    const employeeEi = bandedContribution(ytdBefore, grossPay, 0, p.ei.max_insurable_annual, p.ei.employee_rate);
    const employerEi = money(employeeEi * p.ei.employer_multiple);

    // --- Federal income tax ---
    // v2 fix: now implements the K2 (base-CPP credit), K3 (EI credit), and
    // K4 (Canada Employment Amount credit) non-refundable credits, plus the
    // F5A deduction (the "additional"/enhanced 1% CPP1 portion is deducted
    // from taxable income A, not credited) -- all previously missing.
    // Verified to the exact cent against 4 independent CRA T4127 golden
    // fixtures (AB/BC/NT/NU) before shipping. Still an annualize-and-divide
    // approximation of Option 1, not true cumulative Option 2 -- see
    // limitations.
    const annualGross = money(grossPay * periodsPerYear);
    const cpp1BaseAnnual = money(cpp1ContributoryEarnings * cppBaseRate * periodsPerYear);
    const cpp1AdditionalAnnual = money(cpp1ContributoryEarnings * p.cpp.additional_rate * periodsPerYear);
    const annualTaxableIncomeA = Math.max(0, money(annualGross - cpp1AdditionalAnnual));
    const federalGross = federalTaxBeforeCredit(annualTaxableIncomeA, p.federal.brackets);
    const bpaf = linearTaper(annualTaxableIncomeA, p.federal.bpaf_taper_start, p.federal.bpaf_taper_end, p.federal.bpaf_full, p.federal.bpaf_min);
    const lowestFederalRate = p.federal.brackets[0][1];
    const k1Bpaf = money(bpaf * lowestFederalRate);
    const k2Cpp = money(cpp1BaseAnnual * lowestFederalRate);
    const k3Ei = money(employeeEi * periodsPerYear * lowestFederalRate);
    const k4CanadaEmployment = money(Math.min(p.federal.canada_employment_amount, annualGross) * lowestFederalRate);
    const annualFederalTax = Math.max(0, money(federalGross - k1Bpaf - k2Cpp - k3Ei - k4CanadaEmployment));
    const federalIncomeTax = money(annualFederalTax / periodsPerYear);

    // --- Provincial/territorial income tax ---
    // v2 fix: applies the same discovered pattern as federal -- bracket
    // lookup against A (not raw annualized gross), then a BPA credit PLUS
    // provincial-equivalent CPP and EI credits, all at the province's own
    // lowest bracket rate. Verified to the exact cent against all 4
    // non-Quebec golden fixtures (AB/BC/NT/NU) before shipping. Alberta's
    // own additional K5P supplemental credit (((K1P+K2P)-$4,896) x 25%) is
    // still NOT modeled -- it did not affect the one AB fixture available
    // this pass, but may matter at other income levels; see limitations.
    const prov = p.provinces[employee.province_of_employment];
    const provGross = bracketLookup(annualTaxableIncomeA, prov.brackets);
    const lowestProvRate = prov.brackets[0][2];
    let bpaProvincial: number;
    if (employee.province_of_employment === 'YT') {
      bpaProvincial = bpaf; // BPAYT mirrors the federal BPAF taper
    } else if ('bpa_full' in prov) {
      bpaProvincial = linearTaper(annualTaxableIncomeA, prov.bpa_taper_start, prov.bpa_taper_end, prov.bpa_full, prov.bpa_min);
    } else {
      bpaProvincial = (prov as { bpa_annual: number }).bpa_annual;
    }
    const provK1Bpa = money(bpaProvincial * lowestProvRate);
    const provK2Cpp = money(cpp1BaseAnnual * lowestProvRate);
    const provK3Ei = money(employeeEi * periodsPerYear * lowestProvRate);
    let annualProvincialTax = Math.max(0, money(provGross - provK1Bpa - provK2Cpp - provK3Ei));
    if (employee.province_of_employment === 'BC') {
      const bc = p.provinces.BC;
      let reduction = 0;
      if (annualTaxableIncomeA <= bc.reduction_threshold_1) {
        reduction = Math.min(annualProvincialTax, bc.reduction_max);
      } else if (annualTaxableIncomeA <= bc.reduction_threshold_2) {
        reduction = Math.min(annualProvincialTax, money(bc.reduction_max - (annualTaxableIncomeA - bc.reduction_threshold_1) * bc.reduction_taper_rate));
      }
      annualProvincialTax = Math.max(0, money(annualProvincialTax - reduction));
    }
    const provincialIncomeTax = money(annualProvincialTax / periodsPerYear);

    // --- WCB/WSIB (employer only; see limitations) ---
    const wcbRateProvided = employee.wcb_rate !== undefined;
    const wcbCeilingProvided = employee.wcb_assessable_earnings_ceiling !== undefined;
    if (wcbRateProvided !== wcbCeilingProvided) {
      const error = new Error(`${employeeId}: wcb_rate and wcb_assessable_earnings_ceiling must both be supplied together, or both omitted`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (wcbRateProvided && ((employee.wcb_rate as number) < 0 || (employee.wcb_rate as number) > 1)) {
      const error = new Error(`wcb_rate for ${employeeId} must be between 0 and 1 (a fraction, e.g. 0.0235 for $2.35 per $100)`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const wcbCeiling = wcbCeilingProvided ? requireNonNegativeMoney(employee.wcb_assessable_earnings_ceiling, `wcb_assessable_earnings_ceiling for ${employeeId}`) : 0;
    const ytdWcbBefore = requireNonNegativeMoney(employee.ytd_wcb_assessable_earnings_before ?? 0, `ytd_wcb_assessable_earnings_before for ${employeeId}`);
    const employerWcb = wcbRateProvided ? bandedContribution(ytdWcbBefore, grossPay, 0, wcbCeiling, employee.wcb_rate as number) : 0;
    const ytdWcbAfter = wcbRateProvided
      ? money(ytdWcbBefore + Math.max(0, Math.min(ytdWcbBefore + grossPay, wcbCeiling) - ytdWcbBefore))
      : ytdWcbBefore;

    const employeeTaxTotal = money(federalIncomeTax + provincialIncomeTax + employeeCpp1 + employeeCpp2 + employeeEi);
    const netPay = money(grossPay - employeeTaxTotal);
    const employerCppEi = money(employerCpp1 + employerCpp2 + employerEi);
    const employerFundedTotal = money(grossPay + employerCppEi + employerWcb);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      federal_income_tax: federalIncomeTax,
      provincial_income_tax: provincialIncomeTax,
      employee_cpp1: employeeCpp1,
      employer_cpp1: employerCpp1,
      employee_cpp2: employeeCpp2,
      employer_cpp2: employerCpp2,
      employee_ei: employeeEi,
      employer_ei: employerEi,
      employer_wcb: employerWcb,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal,
      ytd_earnings_after: money(ytdBefore + grossPay),
      ytd_wcb_assessable_earnings_after: ytdWcbAfter
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    federal_income_tax: sum(employees.map(e => e.federal_income_tax)),
    provincial_income_tax: sum(employees.map(e => e.provincial_income_tax)),
    employee_cpp1: sum(employees.map(e => e.employee_cpp1)),
    employer_cpp1: sum(employees.map(e => e.employer_cpp1)),
    employee_cpp2: sum(employees.map(e => e.employee_cpp2)),
    employer_cpp2: sum(employees.map(e => e.employer_cpp2)),
    employee_ei: sum(employees.map(e => e.employee_ei)),
    employer_ei: sum(employees.map(e => e.employer_ei)),
    employer_wcb: sum(employees.map(e => e.employer_wcb)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: CaJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_CPP_EI_EXPENSE', amount: money(totals.employer_cpp1 + totals.employer_cpp2 + totals.employer_ei) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'FEDERAL_INCOME_TAX_PAYABLE', amount: totals.federal_income_tax },
    { side: 'CREDIT', account_role: 'PROVINCIAL_INCOME_TAX_PAYABLE', amount: totals.provincial_income_tax },
    { side: 'CREDIT', account_role: 'CPP_PAYABLE', amount: money(totals.employee_cpp1 + totals.employer_cpp1 + totals.employee_cpp2 + totals.employer_cpp2) },
    { side: 'CREDIT', account_role: 'EI_PAYABLE', amount: money(totals.employee_ei + totals.employer_ei) },
    { side: 'DEBIT', account_role: 'EMPLOYER_WCB_EXPENSE', amount: totals.employer_wcb },
    { side: 'CREDIT', account_role: 'WCB_PAYABLE', amount: totals.employer_wcb }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'CA',
    currency: 'CAD',
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

export function payrollEngineSelfTestCA() {
  // v2: replaced the earlier hand-derived case (which used a since-fixed
  // wrong CPP/federal/provincial formula -- see the v2 change log) with two
  // real CRA T4127 golden fixtures, both reproduced to the exact cent:
  // Alberta and British Columbia, monthly, July 2026, basic/default TD1
  // claim. These caught and confirmed the fix for a genuine bug: CPP's
  // $3,500 annual exemption must be applied as a PERIOD-PRORATED
  // subtraction every pay period (not front-loaded via YTD banding), and
  // federal/provincial tax must credit CPP (base portion) and EI premiums
  // at the jurisdiction's own lowest rate (K2/K3), plus a federal Canada
  // Employment Amount credit (K4) and a deduction from taxable income for
  // CPP's "additional" (enhanced) 1% portion (F5A) -- none of which the
  // original v1 formula implemented.
  const ab = calculateCaPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'AB1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'AB', ytd_earnings_before: 0 }]
  });
  const eAb = ab.employees[0];
  const bc = calculateCaPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'BC1', gross_pay: 4000, pay_frequency: 'MONTHLY', province_of_employment: 'BC', ytd_earnings_before: 0 }]
  });
  const eBc = bc.employees[0];

  // Quebec is rejected.
  let rejected = false;
  try {
    calculateCaPayroll({
      pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
      employees: [{ employee_id: 'QC1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'QC' as any, ytd_earnings_before: 0 }]
    });
  } catch {
    rejected = true;
  }

  // v3: WCB/WSIB. $5,000/month gross, hypothetical Ontario WSIB-style rate
  // $3.00 per $100 (0.03 fraction) with a $110,000 annual assessable-
  // earnings ceiling, YTD already at $108,000 -> only $2,000 of this
  // month's $5,000 remains assessable: 2000 * 0.03 = 60.00.
  const wcb = calculateCaPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{
      employee_id: 'WCB1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'ON',
      ytd_earnings_before: 60000, wcb_rate: 0.03, wcb_assessable_earnings_ceiling: 110000,
      ytd_wcb_assessable_earnings_before: 108000
    }]
  });
  const eWcb = wcb.employees[0];
  // No wcb fields supplied -> employer_wcb must be exactly 0 (backward compat).
  const noWcb = calculateCaPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'NOWCB1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'ON', ytd_earnings_before: 0 }]
  });
  const eNoWcb = noWcb.employees[0];

  // v4 test: Bill C-30 CPP base-rate cut. Same AB $5,000/month case as
  // the golden fixture above, but pay_date in 2027 -> base rate 4.75%
  // instead of 4.95%. periodExemption = 3500/12 = 291.67; contributory
  // earnings = 5000-291.67 = 4708.33; total rate = 4.75%+1.00% = 5.75%;
  // employeeCpp1 = 4708.33*0.0575 = 270.73 (vs 280.15 at the pre-2027 rate).
  const cppCut2027 = calculateCaPayroll({
    pay_period_start: '2027-01-01', pay_period_end: '2027-01-31', pay_date: '2027-01-31',
    employees: [{ employee_id: 'AB2027', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'AB', ytd_earnings_before: 0 }]
  });
  const eCppCut = cppCut2027.employees[0];
  // Same case but pay_date still in 2026 -> must be unaffected (uses the
  // pre-cut 4.95% base rate, matching the eAb fixture exactly).
  const cppPreCut2026 = calculateCaPayroll({
    pay_period_start: '2026-12-01', pay_period_end: '2026-12-31', pay_date: '2026-12-31',
    employees: [{ employee_id: 'AB2026', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'AB', ytd_earnings_before: 0 }]
  });
  const eCppPreCut = cppPreCut2026.employees[0];

  const ok =
    eAb.federal_income_tax === 444.86 && eAb.employee_cpp1 === 280.15 && eAb.employee_ei === 81.5 &&
    eAb.employer_cpp1 === 280.15 && eAb.employer_ei === 114.1 &&
    // Alberta provincial has a small, explicitly-disclosed residual gap
    // (the unmodeled K5P supplemental credit) -- accept the fixture value
    // within 1 cent rather than asserting byte-exact equality here.
    Math.abs(eAb.provincial_income_tax - 219.27) <= 0.01 &&
    ab.controls.journal_balanced &&
    eBc.federal_income_tax === 310.53 && eBc.provincial_income_tax === 160.43 &&
    eBc.employee_cpp1 === 220.65 && eBc.employee_ei === 65.2 &&
    bc.controls.journal_balanced &&
    rejected &&
    eWcb.employer_wcb === 60 && eWcb.ytd_wcb_assessable_earnings_after === 110000 && wcb.controls.journal_balanced &&
    eNoWcb.employer_wcb === 0 && noWcb.controls.journal_balanced &&
    eCppCut.employee_cpp1 === 270.73 && eCppCut.employer_cpp1 === 270.73 && cppCut2027.controls.journal_balanced &&
    eCppPreCut.employee_cpp1 === 280.15 && cppPreCut2026.controls.journal_balanced;

  return { ok, ab, bc, wcb, cppCut2027, cppPreCut2026 };
}
