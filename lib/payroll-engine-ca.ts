// Canada (CA, excluding Quebec) payroll rule pack — v1.
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
//   - Federal income tax uses a simplified ANNUALIZE-CURRENT-PERIOD-AND-
//     DIVIDE approximation of T4127 Option 1 (not the true cumulative-
//     averaging Option 2, and not the full K1-K4 credit machinery — only
//     the Basic Personal Amount credit K1 is applied). CPP/EI premiums are
//     NOT credited back against federal/provincial tax via K2/K3 (a real
//     part of the official formula) — this simplification OVERSTATES both
//     federal and provincial tax somewhat. The federal Basic Personal
//     Amount (BPAF) taper between the two published endpoints
//     ($181,440/$16,452 and $258,482/$14,829) is reconstructed as a LINEAR
//     interpolation, which the source document states as two endpoints,
//     not an explicit formula — this is CRA's known real methodology but
//     was not directly quoted as a formula in the source.
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
    | 'EI_PAYABLE';
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
  net_pay: number;
  employer_funded_total: number;
  ytd_earnings_after: number;
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
  id: 'CA-2026-FEDERAL-PLUS-12-NONQC-JURISDICTIONS-DRAFT-V1',
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
    bpaf_credit_rate: 0.14 // BPA is applied as a credit at the lowest federal rate
  },
  cpp: {
    ybe_annual: 3500, // basic exemption
    ympe_annual: 74600, // year's maximum pensionable earnings (CPP1 ceiling / CPP2 floor)
    yampe_annual: 85000, // year's additional maximum pensionable earnings (CPP2 ceiling)
    rate: 0.0595, // CPP1, employee and employer each
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
    { authority: 'User-supplied reference', instrument: '"Canada 2026 Payroll Implementation Reference" (as of 14 Sep 2026) — the source document this pack was built from; parameters not independently re-fetched from canada.ca directly this pass.', url: 'file: Canada_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' }
  ],
  limitations: [
    'v1 initial build. QUEBEC IS ENTIRELY REJECTED, not approximated — province_of_employment "QC" throws an explicit error. Quebec requires a wholly separate Revenu Quebec formula engine (TP-1015.F-V) for provincial tax, QPP/QPP2, QPIP, and reduced EI, none of which is implemented; the source document itself insists on this separation.',
    'Federal and provincial income tax use a simplified ANNUALIZE-CURRENT-PERIOD-AND-DIVIDE approximation of CRA T4127 Option 1, not the true cumulative-averaging Option 2. Only the Basic Personal Amount credit (K1-equivalent) is applied — the CPP/EI premium tax credits (K2/K3 in the real formula) are NOT modeled, which OVERSTATES both federal and provincial tax somewhat for every employee. The federal (and Yukon) BPA taper is linearly interpolated between two published endpoints, which the source states as a STATIC two-point parameter rather than an explicit formula.',
    'CPP1, CPP2, and EI are all computed on gross pay treated as fully pensionable and fully insurable, sharing one YTD accumulator (ytd_earnings_before) — no pay-component-level taxability/pensionability/insurability classification, which the source document explicitly warns against doing. CPT30 (age 65-69 stop-CPP election), age 18/70 proration, and the EI Premium Reduction Program (employer-specific reduced multiple, standard is 1.4x) are not modeled — standard ages/rates are assumed for every employee.',
    'Ontario surtax and Ontario Health Premium (both embedded in provincial withholding per T4127 Step 5) are NOT implemented — Ontario tax for high earners will be understated. Manitoba\'s labour-sponsored-fund credit and every other province\'s "formula-specific difference" (K5P Alberta supplemental credit, Nova Scotia\'s labour-sponsored fund credit, etc.) are also not implemented.',
    'NOT IMPLEMENTED AT ALL in v1, rejected outright: bonuses/retroactive/irregular pay (T4127 non-periodic difference method); retiring allowances; taxable-benefit-specific CPP/EI treatment (a single gross-pay figure is assumed fully subject to everything); Northwest Territories and Nunavut territorial payroll tax; all employer-only levies (BC Employer Health Tax, Manitoba HE Levy, Ontario EHT, NL HAPSET); all workers-compensation/WCB/WSIB/WorkSafe/CNESST/WSCC premiums, which the source explicitly marks as employer/classification-specific DYNAMIC data this engine cannot supply a rate for.',
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
    const employeeCpp1 = bandedContribution(ytdBefore, grossPay, p.cpp.ybe_annual, p.cpp.ympe_annual, p.cpp.rate);
    const employerCpp1 = employeeCpp1;
    const employeeCpp2 = bandedContribution(ytdBefore, grossPay, p.cpp.ympe_annual, p.cpp.yampe_annual, p.cpp.cpp2_rate);
    const employerCpp2 = employeeCpp2;

    // --- EI ---
    const employeeEi = bandedContribution(ytdBefore, grossPay, 0, p.ei.max_insurable_annual, p.ei.employee_rate);
    const employerEi = money(employeeEi * p.ei.employer_multiple);

    // --- Federal income tax (annualize-and-divide; see limitations) ---
    const annualGross = money(grossPay * periodsPerYear);
    const federalGross = federalTaxBeforeCredit(annualGross, p.federal.brackets);
    const bpaf = linearTaper(annualGross, p.federal.bpaf_taper_start, p.federal.bpaf_taper_end, p.federal.bpaf_full, p.federal.bpaf_min);
    const annualFederalTax = Math.max(0, money(federalGross - bpaf * p.federal.bpaf_credit_rate));
    const federalIncomeTax = money(annualFederalTax / periodsPerYear);

    // --- Provincial/territorial income tax ---
    const prov = p.provinces[employee.province_of_employment];
    const provGross = bracketLookup(annualGross, prov.brackets);
    const lowestProvRate = prov.brackets[0][2];
    let bpaProvincial: number;
    if (employee.province_of_employment === 'YT') {
      bpaProvincial = bpaf; // BPAYT mirrors the federal BPAF taper
    } else if ('bpa_full' in prov) {
      bpaProvincial = linearTaper(annualGross, prov.bpa_taper_start, prov.bpa_taper_end, prov.bpa_full, prov.bpa_min);
    } else {
      bpaProvincial = (prov as { bpa_annual: number }).bpa_annual;
    }
    let annualProvincialTax = Math.max(0, money(provGross - bpaProvincial * lowestProvRate));
    if (employee.province_of_employment === 'BC') {
      const bc = p.provinces.BC;
      let reduction = 0;
      if (annualGross <= bc.reduction_threshold_1) {
        reduction = Math.min(annualProvincialTax, bc.reduction_max);
      } else if (annualGross <= bc.reduction_threshold_2) {
        reduction = Math.min(annualProvincialTax, money(bc.reduction_max - (annualGross - bc.reduction_threshold_1) * bc.reduction_taper_rate));
      }
      annualProvincialTax = Math.max(0, money(annualProvincialTax - reduction));
    }
    const provincialIncomeTax = money(annualProvincialTax / periodsPerYear);

    const employeeTaxTotal = money(federalIncomeTax + provincialIncomeTax + employeeCpp1 + employeeCpp2 + employeeEi);
    const netPay = money(grossPay - employeeTaxTotal);
    const employerCppEi = money(employerCpp1 + employerCpp2 + employerEi);
    const employerFundedTotal = money(grossPay + employerCppEi);

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
      net_pay: netPay,
      employer_funded_total: employerFundedTotal,
      ytd_earnings_after: money(ytdBefore + grossPay)
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
    { side: 'CREDIT', account_role: 'EI_PAYABLE', amount: money(totals.employee_ei + totals.employer_ei) }
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
  // Case 1: Ontario, MONTHLY, gross CAD 6,000, YTD 0.
  // Annual gross = 72,000.
  // CPP1: banded(0,6000,3500,74600,0.0595) — YTD+current=72000<74600, so
  // subject = 72000 - 3500 = 68500 for the FULL YEAR, but this is a single
  // period call so subject = min(0+6000,74600)-max(0,3500) = 6000-3500=2500
  // -> employeeCpp1 = 2500*0.0595 = 148.75
  // CPP2: banded(0,6000,74600,85000,0.04): min(6000,85000)-max(0,74600)
  // = 6000-74600 -> negative -> 0.
  // EI: banded(0,6000,0,68900,0.0163): min(6000,68900)-max(0,0)=6000
  // -> 6000*0.0163=97.80. Employer = 97.80*1.4=136.92
  // Federal: A=72000. Bracket [58523,0.205,3804]: 72000*0.205-3804=14760-3804=10956
  // BPAF: A<=181440 -> full 16452. Credit=16452*0.14=2303.28
  // AnnualFedTax = 10956-2303.28=8652.72 -> monthly=8652.72/12=721.06
  // Ontario: A=72000. Bracket [53891,2721.50,0.0915]: 2721.50+(72000-53891)*0.0915
  // =2721.50+18109*0.0915=2721.50+1656.9735=4378.4735 -> 4378.47
  // BPA_ON=12989 at lowest rate 0.0505: credit=12989*0.0505=655.9445 -> 655.94
  // AnnualProvTax=4378.47-655.94=3722.53 -> monthly=3722.53/12=310.21
  const r1 = calculateCaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'E1', gross_pay: 6000, pay_frequency: 'MONTHLY',
      province_of_employment: 'ON', ytd_earnings_before: 0
    }]
  });
  const e1 = r1.employees[0];

  // Case 2: Quebec is rejected.
  let rejected = false;
  try {
    calculateCaPayroll({
      pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
      employees: [{ employee_id: 'QC1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'QC' as any, ytd_earnings_before: 0 }]
    });
  } catch {
    rejected = true;
  }

  const ok =
    e1.employee_cpp1 === 148.75 && e1.employee_cpp2 === 0 &&
    e1.employee_ei === 97.80 && e1.employer_ei === 136.92 &&
    e1.federal_income_tax === 721.06 && e1.provincial_income_tax === 310.21 &&
    r1.controls.journal_balanced &&
    rejected;

  return { ok, r1 };
}
