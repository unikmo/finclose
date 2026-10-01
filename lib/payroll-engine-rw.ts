// Rwanda (RW) payroll rule pack — v1.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Rwandan payroll expertise has checked this against RRA's own PAYE
// guidance and RSSB's Ishema system output directly (this pack's CBHI net-
// salary base in particular is explicitly NOT confirmed against Ishema —
// see limitations).
//
// Sourced from a user-supplied "Rwanda 2026 Payroll Implementation
// Reference" (verified to 14 Sep 2026, citing RRA and RSSB as primary
// authorities) — a genuine parameter reference with real bands/rates
// attributed to named government sources, including RRA's own published
// worked example (RWF300,000 taxable -> RWF54,000 PAYE), which this pack's
// self-test reproduces exactly. Not independently re-fetched from
// rra.gov.rw/rssb.rw directly this pass.
//
// DELIBERATE v1 SCOPE (rejected, not approximated, for anything not listed):
//   - PAYE: monthly progressive bands only (Rwanda is monthly, not
//     cumulative-annual, per the source). First-employer vs non-first-
//     employer (flat 30%) vs casual-labourer (0%/15%) paths are all
//     implemented, gated on a caller-supplied employee_type/first_employer
//     flag combination.
//   - RSSB mandatory pension is fixed at 6%/6% for all of 2026 per the
//     source's own effective-date schedule. The already-enacted 2027+
//     increases (14%, 16%, 18%, 20%) are NOT implemented — the source
//     itself flags these as subject to Presidential Order revalidation
//     before activation, so this pack deliberately does not pre-load them.
//     A payroll run dated 2027-01-01 or later will still use the 2026
//     6%/6% rate, which would be WRONG once the increase actually takes
//     effect — flagged explicitly rather than silently mis-versioned.
//   - CBHI (0.5% of "net salary") uses this engine's own best reading of
//     the source's recommended validation order (gross - PAYE - employee
//     pension - employee maternity - employee RAMA if applicable) as the
//     net-salary base. The source explicitly warns this base must be
//     locked only after golden-testing against actual Ishema system
//     output, which this pass could not do — treat the CBHI figure this
//     engine produces as UNVERIFIED against the real system, not just
//     lower-confidence.
//   - Occupational Hazards (OH) contribution base defaults to gross pay
//     when no separate oh_contribution_base is supplied — the source
//     notes OH has its own authority-defined base, distinct from the
//     pension base, which was not itself specified numerically in the
//     source.
//   - NOT IMPLEMENTED AT ALL in v1, rejected outright: vehicle/
//     accommodation benefit-in-kind valuation, low-interest employee
//     advances, expense-reimbursement classification, and all statutory
//     filing (Ishema declarations). This engine prepares payroll and
//     accounting outputs only — it does not file with RRA/RSSB.

export type RwEmployeeType = 'REGULAR' | 'CASUAL';

export type RwEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  employee_type: RwEmployeeType;
  // For REGULAR employees only: whether this is the employee's declared
  // first/main employer (progressive PAYE) or not (flat 30% withholding).
  first_employer?: boolean;
  oh_contribution_base?: number; // defaults to gross_pay if omitted
  rama_member: boolean;
  rama_basic_salary?: number; // required when rama_member is true
  // Benefit-in-kind flags, v2. Both optional/default false — omitting both
  // leaves PAYE computed on gross_pay alone, unchanged from v1. Per the
  // source document: a vehicle benefit adds 10% of employment income to
  // taxable income; an accommodation benefit adds 20%. Both affect PAYE
  // only (RSSB pension/OH/maternity, RAMA, and CBHI stay on the gross-pay
  // cash base — the source did not specify a BIK treatment for those, so
  // this engine does not guess one; see limitations).
  vehicle_benefit?: boolean;
  accommodation_benefit?: boolean;
  // CBHI (Community-Based Health Insurance), v3. Defaults to false/omitted
  // because this pack's CBHI net-salary base is explicitly UNVERIFIED
  // against RSSB/RRA Ishema system output (see limitations) — callers must
  // opt in deliberately. When true, CBHI is computed on this engine's best
  // reading of the net-salary base and deducted from net pay; when
  // false/omitted, CBHI is not computed at all (0) and net pay excludes it,
  // matching the "Rwanda 2026 Payroll Golden Fixtures" QA pack, whose five
  // GOLDEN fixtures all set CBHI_applicable=false and whose expected net
  // pay figures have zero CBHI deduction.
  cbhi_applicable?: boolean;
  // Executive/other cash fringe benefit or allowance paid in CASH this
  // period (e.g. a cash allowance, executive cash perk) — v4. Distinct
  // from vehicle_benefit/accommodation_benefit above, which are true
  // benefits-in-kind valued at 10%/20% of employment income and added to
  // the PAYE base ONLY (never received in cash). A CASH allowance is
  // ordinary employment income under RRA's PAYE law, AND (per the source's
  // own RSSB pension-base formula, "Basic Salary + BIK House + BIK Others +
  // Cash Allowance House + Cash Allowance Others") part of the RSSB
  // pension/maternity contribution base too — it is added to gross_pay for
  // PAYE, pension, maternity, and (because the employee actually receives
  // it) net_pay/CBHI purposes. Omit or 0 leaves every existing caller's
  // figures unchanged. NOT added to oh_contribution_base by default (OH has
  // its own unspecified authority-defined base — see limitations) or to
  // rama_basic_salary (a separately-declared figure this engine does not
  // infer from gross_pay).
  exec_cash_fringe_benefit?: number;
};

export type RwPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: RwEmployeeInput[];
};

export type RwJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_RSSB_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_PAYABLE'
    | 'RSSB_PENSION_PAYABLE'
    | 'RSSB_OH_PAYABLE'
    | 'RSSB_MATERNITY_PAYABLE'
    | 'RAMA_PAYABLE'
    | 'CBHI_PAYABLE';
  amount: number;
};

export type RwEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  exec_cash_fringe_benefit: number;
  benefit_in_kind: number;
  paye: number;
  employee_pension: number;
  employer_pension: number;
  employer_oh: number;
  employee_maternity: number;
  employer_maternity: number;
  employee_rama: number;
  employer_rama: number;
  employee_cbhi: number;
  net_pay: number;
  employer_funded_total: number;
};

export type RwPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'RW';
  currency: 'RWF';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: RwEmployeeResult[];
  totals: {
    gross_pay: number;
    exec_cash_fringe_benefit: number;
    benefit_in_kind: number;
    paye: number;
    employee_pension: number;
    employer_pension: number;
    employer_oh: number;
    employee_maternity: number;
    employer_maternity: number;
    employee_rama: number;
    employer_rama: number;
    employee_cbhi: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: RwJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_RW = {
  // v2: adds vehicle (10%) and accommodation (20%) benefit-in-kind
  // additions to the PAYE taxable base, per the source document's own
  // stated percentages (already cited in the v1 limitations, just not
  // implemented until now). RSSB/RAMA/CBHI bases stay on cash gross_pay
  // only — the source doesn't specify a BIK treatment for those.
  //
  // v3 (2026-09-16, golden-fixture QA pass): fixed a bug where CBHI was
  // ALWAYS computed and deducted from net pay, with no way for a caller to
  // turn it off — even though this pack's own limitations text already
  // flagged the CBHI net-salary base as UNVERIFIED against real Ishema
  // output. The "Rwanda 2026 Payroll Golden Fixtures" QA pack (5 fixtures,
  // verified through 2026-09-14, sourced from RRA/RSSB) all set
  // CBHI_applicable=false and expect net pay with ZERO CBHI deduction —
  // e.g. RW-FIRST-300K: gross 300,000, PAYE 54,000, pension 18,000,
  // maternity 900 -> expected net 227,100 (300,000-54,000-18,000-900,
  // no CBHI). Before this fix the engine unconditionally subtracted
  // employeeCbhi (≈1,135.5 in this example), producing net 225,964.5 —
  // wrong by more than a rounding tolerance, on every single fixture.
  // Added an explicit cbhi_applicable input flag (default false) so CBHI is
  // only computed/deducted when a caller opts in; all five golden fixtures
  // now pass net pay exactly. CBHI's net-salary base itself remains
  // UNVERIFIED and unchanged from v2 — this fix only corrects when it fires.
  //
  // v4: adds exec_cash_fringe_benefit — a cash allowance/benefit is
  // ordinary employment income (PAYE) and, per the source's own RSSB
  // pension-base formula, part of the pension/maternity contribution base
  // too. Distinct from vehicle_benefit/accommodation_benefit, which are
  // non-cash and only ever affect the PAYE base. See evidence/limitations.
  id: 'RW-2026-PAYE-RSSB-RAMA-CBHI-BIK-FRINGE-DRAFT-V4',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'RWF',
  paye: {
    brackets: [[0, 0, 0], [60000, 0, 0.10], [100000, 4000, 0.20], [200000, 24000, 0.30]] as Array<[number, number, number]>,
    non_first_employer_flat_rate: 0.30,
    casual_threshold: 60000,
    casual_rate_above: 0.15
  },
  rssb: {
    pension_employee_rate: 0.06,
    pension_employer_rate: 0.06,
    oh_employer_rate: 0.02,
    maternity_employee_rate: 0.003,
    maternity_employer_rate: 0.003
  },
  rama: { employee_rate: 0.075, employer_rate: 0.075 },
  cbhi: { employee_rate: 0.005 },
  evidence: [
    { authority: 'Rwanda Revenue Authority (RRA)', instrument: 'PAYE current guidance — monthly progressive bands, first-employer rule, RWF300,000 -> RWF54,000 worked example (reproduced exactly by this pack\'s self-test)', url: 'https://www.rra.gov.rw/en/individuals/paye' },
    { authority: 'Rwanda Social Security Board (RSSB)', instrument: '2025 pension reform notice — 12% total (6% employee + 6% employer) for 2026, gross-salary base, OH unchanged', url: 'https://www.rssb.rw/' },
    { authority: 'Official Gazette of Rwanda', instrument: 'Future pension rate schedule (2027: 14%, 2028: 16%, 2029: 18%, 2030: 20%) — NOT implemented in this pack, deliberately, per the source\'s own revalidation warning', url: 'https://www.minijust.gov.rw/official-gazette' },
    { authority: 'RRA / RSSB', instrument: 'Maternity Leave Benefits (0.3%/0.3%) and RAMA medical scheme (7.5%/7.5% of basic salary)', url: 'https://www.rssb.rw/' },
    { authority: 'User-supplied reference', instrument: '"Rwanda 2026 Payroll Implementation Reference" (verified to 14 Sep 2026) — the source document this pack was built from. Not independently re-fetched from rra.gov.rw/rssb.rw directly this pass.', url: 'file: Rwanda_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-15)' },
    { authority: 'Rwanda Revenue Authority (RRA) — Tax Handbook, "Explanation of PAYE"', instrument: 'Employment income subject to PAYE includes all payments to an employee in cash or in kind, incl. allowances (e.g. medical allowance) — a cash allowance/benefit is ordinary employment income, no separate in-kind valuation rule applies to it', url: 'https://tax-handbook.rra.gov.rw/handbook/explanation-of-paye/' },
    { authority: 'RSSB / RRA payroll guidance (pension-base definition)', instrument: 'Pension contribution base = Basic Salary + Benefit in Kind House + Benefit in Kind Others + Cash Allowance House + Cash Allowance Others, charged on all employment income except transport allowances/benefits — confirms a general cash allowance is part of the RSSB pension (and, by the same "employment income" base, maternity) contribution base, not just the PAYE base', url: 'https://tax-handbook.rra.gov.rw/handbook/explanation-of-rssb-contributions/' }
  ],
  limitations: [
    'v1 initial build, monthly payroll only. PAYE has three paths: REGULAR + first_employer=true uses progressive bands; REGULAR + first_employer=false uses a flat 30% rate; CASUAL uses 0% up to RWF60,000 and 15% above.',
    'RSSB pension is fixed at 6%/6% for all of 2026. The already-enacted 2027+ rate increases (14%, 16%, 18%, 20%) are deliberately NOT implemented — a payroll run dated 2027 or later will still use the 6%/6% rate, which will be WRONG once the increase takes effect. The source itself notes these future rates require Presidential Order revalidation before activation.',
    'CBHI (0.5%) is opt-in via cbhi_applicable (default false, added in v3 2026-09-16 — previously CBHI was always computed and deducted from net pay with no way to disable it, which mismatched the golden fixture pack\'s CBHI_applicable=false net-pay expectations on every fixture). When enabled, CBHI is computed on this engine\'s own best reading of the source\'s recommended net-salary base (gross - PAYE - employee pension - employee maternity - employee RAMA if applicable). The source EXPLICITLY warns this base must be locked only after golden-testing against actual RSSB/RRA Ishema system output — this pass could not do that. Treat this pack\'s CBHI figure as UNVERIFIED against the real system, not merely lower-confidence, and leave cbhi_applicable=false for real payroll runs until that verification happens.',
    'Occupational Hazards (OH) contribution base defaults to gross pay when no oh_contribution_base is separately supplied — the source notes OH has its own authority-defined base distinct from the pension base, but did not give that base numerically.',
    'Vehicle/accommodation benefit-in-kind, v2: computed ONLY when the caller sets vehicle_benefit and/or accommodation_benefit to true, adding 10% (vehicle) and/or 20% (accommodation) of gross_pay to the PAYE taxable base only, per the source\'s own stated percentages. RSSB pension/OH/maternity, RAMA, and CBHI stay on the cash gross_pay base — the source did not specify how (or whether) these benefits affect those bases, and this engine does not guess. Both flags default to false/omitted, exactly matching v1 behavior for every existing caller.',
    'NOT IMPLEMENTED: low-interest employee advances, expense-reimbursement classification, and all statutory filing (Ishema monthly declarations). This engine prepares payroll and accounting outputs only — it does not file with RRA/RSSB.',
    'Source parameters come from a user-supplied implementation-reference document (itself citing RRA/RSSB), not independently re-fetched directly this pass. Should be reconfirmed against RRA\'s own PAYE guidance and RSSB\'s current rate notices before this pack is marked VERIFIED_BASIC_RULES.',
    'exec_cash_fringe_benefit (v4, new): a cash allowance/benefit (e.g. an executive cash perk) is ordinary employment income under RRA\'s PAYE rules, and — per RRA/RSSB\'s own published pension-base formula ("Basic Salary + BIK House + BIK Others + Cash Allowance House + Cash Allowance Others") — also part of the RSSB pension contribution base. This engine adds it to the PAYE taxable base, to the RSSB pension and maternity bases (both employee and employer sides), and to net_pay (it is cash the employee actually receives, unlike vehicle_benefit/accommodation_benefit, which are non-cash and PAYE-base-only). It is NOT added to oh_contribution_base by default (Occupational Hazards has its own authority-defined base this pack could not source numerically — a caller who knows OH should include it must pass an explicit oh_contribution_base), to rama_basic_salary (a separately-declared figure not derived from gross_pay). It IS picked up automatically by the CBHI net-salary formula (gross_pay + exec_cash_fringe_benefit - PAYE - pension - maternity - RAMA) when cbhi_applicable is true, since that formula already starts from total cash pay — but CBHI\'s base itself remains UNVERIFIED against real Ishema output regardless (see the CBHI limitations entry above), so combining both features compounds that existing uncertainty rather than adding a new one. This field was not part of the user-supplied implementation reference the rest of this pack was built from; it follows RRA/RSSB\'s general employment-income and pension-base definitions (see evidence) and should be reconfirmed the same way as the rest of this pack before VERIFIED_BASIC_RULES.'
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

export function calculateRwPayroll(input: RwPayrollRunInput): RwPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_RW;
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

    if (employee.employee_type !== 'REGULAR' && employee.employee_type !== 'CASUAL') {
      const error = new Error(`employee_type for ${employeeId} must be REGULAR or CASUAL`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.employee_type === 'REGULAR' && typeof employee.first_employer !== 'boolean') {
      const error = new Error(`first_employer must be true or false for REGULAR employee ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.rama_member !== 'boolean') {
      const error = new Error(`rama_member must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.rama_member && (typeof employee.rama_basic_salary !== 'number' || employee.rama_basic_salary < 0)) {
      const error = new Error(`rama_basic_salary is required and must be non-negative for ${employeeId} when rama_member is true`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const ohBase = requireNonNegativeMoney(employee.oh_contribution_base ?? grossPay, `oh_contribution_base for ${employeeId}`);
    const execCashFringeBenefit = requireNonNegativeMoney(employee.exec_cash_fringe_benefit ?? 0, `exec_cash_fringe_benefit for ${employeeId}`);

    // A cash allowance/benefit is ordinary employment income (unlike
    // vehicle/accommodation BIK below, it is actually paid in cash) — it is
    // part of the PAYE, pension and maternity bases. See the
    // exec_cash_fringe_benefit evidence/limitations entries.
    const cashGrossPay = money(grossPay + execCashFringeBenefit);

    // --- Benefit in kind (v2; PAYE base only — see limitations). Computed
    // off the cash salary/allowance total, consistent with the source's
    // "% of employment income" phrasing. ---
    const benefitInKind = money(
      (employee.vehicle_benefit ? 0.10 : 0) * cashGrossPay +
      (employee.accommodation_benefit ? 0.20 : 0) * cashGrossPay
    );
    const payeTaxableIncome = money(cashGrossPay + benefitInKind);

    // --- PAYE ---
    let paye: number;
    if (employee.employee_type === 'CASUAL') {
      paye = money(Math.max(0, payeTaxableIncome - p.paye.casual_threshold) * p.paye.casual_rate_above);
    } else if (employee.first_employer) {
      paye = bracketLookup(payeTaxableIncome, p.paye.brackets);
    } else {
      paye = money(payeTaxableIncome * p.paye.non_first_employer_flat_rate);
    }
    paye = Math.ceil(paye); // RRA rounding rule: round up to whole RWF

    // --- RSSB pension (base includes the cash fringe benefit — see
    // exec_cash_fringe_benefit evidence: RRA/RSSB's own pension-base
    // formula explicitly includes "Cash Allowance ... Others") ---
    const employeePension = money(cashGrossPay * p.rssb.pension_employee_rate);
    const employerPension = money(cashGrossPay * p.rssb.pension_employer_rate);

    // --- Occupational Hazards (employer-only). Base defaults to gross_pay
    // ONLY (not cashGrossPay) unless oh_contribution_base is explicitly
    // supplied — OH's own base is not numerically specified in the source,
    // so this engine does not guess whether it includes a cash fringe. ---
    const employerOh = money(ohBase * p.rssb.oh_employer_rate);

    // --- Maternity (same base as pension — see above) ---
    const employeeMaternity = money(cashGrossPay * p.rssb.maternity_employee_rate);
    const employerMaternity = money(cashGrossPay * p.rssb.maternity_employer_rate);

    // --- RAMA ---
    const employeeRama = employee.rama_member ? money((employee.rama_basic_salary as number) * p.rama.employee_rate) : 0;
    const employerRama = employee.rama_member ? money((employee.rama_basic_salary as number) * p.rama.employer_rate) : 0;

    // --- CBHI (unverified net-salary base; opt-in only — see limitations) ---
    const cbhiApplicable = employee.cbhi_applicable === true;
    const netSalaryForCbhi = Math.max(0, money(cashGrossPay - paye - employeePension - employeeMaternity - employeeRama));
    const employeeCbhi = cbhiApplicable ? money(netSalaryForCbhi * p.cbhi.employee_rate) : 0;

    const netPay = money(cashGrossPay - paye - employeePension - employeeMaternity - employeeRama - employeeCbhi);
    const employerFundedTotal = money(cashGrossPay + employerPension + employerOh + employerMaternity + employerRama);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      exec_cash_fringe_benefit: execCashFringeBenefit,
      benefit_in_kind: benefitInKind,
      paye,
      employee_pension: employeePension,
      employer_pension: employerPension,
      employer_oh: employerOh,
      employee_maternity: employeeMaternity,
      employer_maternity: employerMaternity,
      employee_rama: employeeRama,
      employer_rama: employerRama,
      employee_cbhi: employeeCbhi,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    exec_cash_fringe_benefit: sum(employees.map(e => e.exec_cash_fringe_benefit)),
    benefit_in_kind: sum(employees.map(e => e.benefit_in_kind)),
    paye: sum(employees.map(e => e.paye)),
    employee_pension: sum(employees.map(e => e.employee_pension)),
    employer_pension: sum(employees.map(e => e.employer_pension)),
    employer_oh: sum(employees.map(e => e.employer_oh)),
    employee_maternity: sum(employees.map(e => e.employee_maternity)),
    employer_maternity: sum(employees.map(e => e.employer_maternity)),
    employee_rama: sum(employees.map(e => e.employee_rama)),
    employer_rama: sum(employees.map(e => e.employer_rama)),
    employee_cbhi: sum(employees.map(e => e.employee_cbhi)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: RwJournalLine[] = [
    // SALARY_EXPENSE reflects total cash pay (gross_pay plus any
    // exec_cash_fringe_benefit) — the fringe amount is actual cash paid to
    // the employee and flows through paye/pension/maternity/net_pay exactly
    // like the rest of gross_pay, so it belongs in the same expense line.
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: money(totals.gross_pay + totals.exec_cash_fringe_benefit) },
    { side: 'DEBIT', account_role: 'EMPLOYER_RSSB_EXPENSE', amount: money(totals.employer_pension + totals.employer_oh + totals.employer_maternity + totals.employer_rama) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_PAYABLE', amount: totals.paye },
    { side: 'CREDIT', account_role: 'RSSB_PENSION_PAYABLE', amount: money(totals.employee_pension + totals.employer_pension) },
    { side: 'CREDIT', account_role: 'RSSB_OH_PAYABLE', amount: totals.employer_oh },
    { side: 'CREDIT', account_role: 'RSSB_MATERNITY_PAYABLE', amount: money(totals.employee_maternity + totals.employer_maternity) },
    { side: 'CREDIT', account_role: 'RAMA_PAYABLE', amount: money(totals.employee_rama + totals.employer_rama) },
    { side: 'CREDIT', account_role: 'CBHI_PAYABLE', amount: totals.employee_cbhi }
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  return {
    rule_pack_id: p.id,
    country_code: 'RW',
    currency: 'RWF',
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

export function payrollEngineSelfTestRW() {
  // Golden test: RRA's own published worked example. RWF300,000 taxable
  // (first employer) => RWF54,000 PAYE.
  const firstEmployer = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R1', gross_pay: 300000, employee_type: 'REGULAR', first_employer: true, rama_member: false }]
  });

  // Golden test: same RWF300,000 pay, non-first employer => flat 30% = RWF90,000.
  const secondEmployer = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R2', gross_pay: 300000, employee_type: 'REGULAR', first_employer: false, rama_member: false }]
  });

  // Golden test: pension. RWF500,000 gross => RWF30,000 employee + RWF30,000 employer.
  // Golden test: maternity. RWF500,000 gross => RWF1,500 employee + RWF1,500 employer.
  const pensionMaternity = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R3', gross_pay: 500000, employee_type: 'REGULAR', first_employer: true, rama_member: false }]
  });

  // Golden test: RAMA. Member with RWF400,000 basic salary => RWF30,000 employee + RWF30,000 employer.
  const rama = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R4', gross_pay: 500000, employee_type: 'REGULAR', first_employer: true, rama_member: true, rama_basic_salary: 400000 }]
  });

  // v2 test: vehicle benefit. RWF300,000 gross + 10% vehicle BIK (30,000)
  // -> PAYE taxable 330,000 -> bracket [200000,24000,0.30]: 24000 +
  // 0.30*(330000-200000) = 63,000.
  const vehicleBik = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R5', gross_pay: 300000, employee_type: 'REGULAR', first_employer: true, rama_member: false, vehicle_benefit: true }]
  });
  // v2 test: both benefits. 300,000 + 30% (10%+20%) BIK (90,000) -> 390,000
  // -> 24000 + 0.30*(390000-200000) = 81,000.
  const bothBik = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R6', gross_pay: 300000, employee_type: 'REGULAR', first_employer: true, rama_member: false, vehicle_benefit: true, accommodation_benefit: true }]
  });

  // v4 test: exec_cash_fringe_benefit. gross_pay 300,000 + cash fringe
  // 50,000 = 350,000 cash-pay base -> bracket [200000,24000,0.30]:
  // 24,000 + 0.30*(350,000-200,000) = 69,000 PAYE. Pension = 350,000*6% =
  // 21,000 each side (proving the fringe is IN the pension base, per the
  // source's own "Cash Allowance ... Others" pension-base formula).
  // Maternity = 350,000*0.3% = 1,050 each side. OH stays on the
  // oh_contribution_base default (gross_pay only, 300,000) = 6,000 —
  // proving the fringe does NOT leak into OH by default. net_pay =
  // 350,000 - 69,000 - 21,000 - 1,050 = 258,950 (no RAMA/CBHI here).
  const execFringe = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'R7', gross_pay: 300000, exec_cash_fringe_benefit: 50000, employee_type: 'REGULAR', first_employer: true, rama_member: false }]
  });

  const e1 = firstEmployer.employees[0];
  const e2 = secondEmployer.employees[0];
  const e3 = pensionMaternity.employees[0];
  const e4 = rama.employees[0];
  const e5 = vehicleBik.employees[0];
  const e6 = bothBik.employees[0];
  const e7 = execFringe.employees[0];

  const ok =
    e1.paye === 54000 && firstEmployer.controls.journal_balanced &&
    e2.paye === 90000 && secondEmployer.controls.journal_balanced &&
    e3.employee_pension === 30000 && e3.employer_pension === 30000 &&
    e3.employee_maternity === 1500 && e3.employer_maternity === 1500 && pensionMaternity.controls.journal_balanced &&
    e4.employee_rama === 30000 && e4.employer_rama === 30000 && rama.controls.journal_balanced &&
    e5.benefit_in_kind === 30000 && e5.paye === 63000 && vehicleBik.controls.journal_balanced &&
    e6.benefit_in_kind === 90000 && e6.paye === 81000 && bothBik.controls.journal_balanced &&
    e1.benefit_in_kind === 0 &&
    e7.paye === 69000 && e7.employee_pension === 21000 && e7.employer_pension === 21000 &&
    e7.employee_maternity === 1050 && e7.employer_maternity === 1050 &&
    e7.employer_oh === 6000 && e7.net_pay === 258950 && execFringe.controls.journal_balanced;

  return { ok, firstEmployer, secondEmployer, pensionMaternity, rama, vehicleBik, bothBik, execFringe };
}
