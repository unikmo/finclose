// Tanzania — Zanzibar (TZ/Zanzibar) payroll rule pack — v1.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current Zanzibar payroll expertise has checked this against TRA's own
// PAYE guidance, ZSSF's own current contribution notice, and the Zanzibar
// Revenue Board's Vocational Training Levy guidance directly (two genuine
// source conflicts are NOT resolved this pass — see limitations).
//
// DELIBERATE v1 SCOPE: ZANZIBAR EMPLOYMENT ONLY, rejected (not
// approximated) for mainland Tanzania. Although PAYE is a Union matter (see
// evidence) and therefore uses the SAME national bracket table on both
// sides of the channel, mainland Tanzania has its OWN, DIFFERENT National
// Social Security Fund (NSSF) contribution rates and its OWN, DIFFERENT
// Skills Development Levy (3.5% of gross emoluments, 10+ employee
// threshold, administered by TRA) — neither of those mainland figures was
// sourced this pass, so a mainland Tanzania employee run is REJECTED with
// an explicit error rather than silently reusing Zanzibar's ZSSF/levy
// figures. jurisdiction is therefore a required, non-defaulted field (same
// "mandatory, not silently skipped" pattern as this codebase's US Maryland
// county requirement and Rwanda's employee_type/first_employer
// requirement) and only accepts 'ZANZIBAR' in this pack.
//
// Covers, for Zanzibar employment only:
//   - PAYE (Union matter, administered by TRA, same national bracket table
//     island-wide — see evidence).
//   - ZSSF (Zanzibar Social Security Fund) — a Zanzibar-only scheme,
//     distinct from mainland NSSF, administered under the Zanzibar Social
//     Security Fund Act No. 2 of 1998.
//   - The Zanzibar Vocational Training Levy (the island's own
//     employer-only "skills levy", distinct from mainland SDL) under the
//     Vocational Training Act No. 8 of 2006 as amended by the Zanzibar
//     Finance Act 2023.
// NOT IMPLEMENTED AT ALL in v1, rejected outright: mainland Tanzania (see
// above), benefits-in-kind valuation, any Workers Compensation Fund
// equivalent (mainland's WCF is a mainland-only institution — no Zanzibar
// equivalent was found this pass; this is a disclosed absence, not a
// confirmed "none exists"), and all statutory filing with TRA/ZRB/ZSSF.
// This engine prepares payroll and accounting outputs only.

export type TzJurisdiction = 'ZANZIBAR';

export type TzEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number; // monthly cash salary — the base for both PAYE and ZSSF
  jurisdiction: TzJurisdiction; // required; only 'ZANZIBAR' accepted in v1 — see header
};

export type TzPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: TzEmployeeInput[];
  // Total headcount across the WHOLE employer (not just this run) that the
  // Vocational Training Levy's 5-employee threshold is evaluated against.
  // Optional: if omitted, this engine falls back to employees.length for
  // THIS run and flags that as a limitation, since a partial run (e.g. one
  // department's payroll processed separately) would then understate the
  // employer's real total headcount and could wrongly skip the levy.
  total_employer_headcount?: number;
};

export type TzJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_ZSSF_EXPENSE'
    | 'EMPLOYER_VOCATIONAL_LEVY_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'PAYE_PAYABLE'
    | 'ZSSF_PAYABLE'
    | 'VOCATIONAL_LEVY_PAYABLE';
  amount: number;
};

export type TzEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  paye: number;
  employee_zssf: number;
  employer_zssf: number;
  net_pay: number;
  employer_funded_total: number;
};

export type TzPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'TZ';
  currency: 'TZS';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: TzEmployeeResult[];
  totals: {
    gross_pay: number;
    paye: number;
    employee_zssf: number;
    employer_zssf: number;
    vocational_levy: number;
    net_pay: number;
    employer_funded_total: number;
  };
  vocational_levy_applied: boolean;
  journal: TzJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_TZ = {
  id: 'TZ-ZANZIBAR-2026-PAYE-ZSSF-VOCATIONAL-LEVY-DRAFT-V1',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'TZS',
  // PAYE is a Union matter (the Constitution reserves tax on income to the
  // Union; TRA administers it island-wide on the same bracket table) — see
  // evidence. Monthly bands, TZS.
  paye: {
    brackets: [[0, 0, 0], [270000, 0, 0.08], [520000, 20000, 0.20], [760000, 68000, 0.25], [1000000, 128000, 0.30]] as Array<[number, number, number]>
  },
  // ZSSF: source conflict NOT resolved this pass (see limitations). This
  // pack uses ZSSF's own live contribution-calculator figures (7%/13%,
  // gross monthly wage base) as the primary-source value, over a 2023
  // secondary-source claim of a 14% employer rate (a stated +1% employment
  // injury benefit addition) that this pass could not independently
  // confirm against ZSSF's own current published rate.
  zssf: { employee_rate: 0.07, employer_rate: 0.13 },
  // Zanzibar Vocational Training Levy: Finance Act 2023 (passed by the
  // House of Representatives of Zanzibar, 21 Jun 2023), amending s.27 of
  // the Vocational Training Act No. 8 of 2006, effective 1 Jul 2023.
  // Employer-only, on total gross monthly emoluments. Employers with 5+
  // employees pay; employers with 3-5 employees file a nil return instead
  // (modeled here as: below 5 -> levy is 0, consistent with "nil"). A
  // secondary source claims 5% rather than 4% -- NOT resolved this pass
  // (see limitations); this pack uses the more directly-sourced 4% figure
  // (traceable to the specific Act, section, and effective date).
  vocational_levy: { rate: 0.04, minimum_headcount: 5 },
  evidence: [
    { authority: 'Constitution of the United Republic of Tanzania / Worldwide Tax Summaries (PwC)', instrument: 'Income tax is a Union matter: the Tanzania Revenue Authority (TRA) administers PAYE under the Income Tax Act island-wide (including Zanzibar) on the SAME resident bracket table — Zanzibar\'s own Zanzibar Revenue Board (ZRB) administers only non-Union taxes (e.g. VAT, stamp duty)', url: 'https://taxsummaries.pwc.com/tanzania/individual/taxes-on-personal-income' },
    { authority: 'Worldwide Tax Summaries (PwC) — Tanzania resident PAYE table', instrument: 'Monthly resident bands: 0-270,000 @0%; 270,000-520,000 @8%; 520,000-760,000 @20% (base 20,000); 760,000-1,000,000 @25% (base 68,000); 1,000,000+ @30% (base 128,000)', url: 'https://taxsummaries.pwc.com/tanzania/individual/taxes-on-personal-income' },
    { authority: 'Zanzibar Social Security Fund (ZSSF) — official contribution calculator', instrument: 'Employer deducts 7% of gross monthly wage from the employee and adds 13% of gross monthly wage, total 20%, both on the gross monthly wage base', url: 'https://members.zssf.or.tz/calculator/contribution-calculator' },
    { authority: 'Zanzibar Social Security Fund Act No. 2 of 1998 (as amended)', instrument: 'Establishes ZSSF as the Zanzibar-only social security scheme, distinct from mainland NSSF', url: 'https://members.zssf.or.tz/site/about' },
    { authority: 'Zanzibar Finance Act 2023 (House of Representatives of Zanzibar, passed 21 Jun 2023), amending Vocational Training Act No. 8 of 2006 s.27', instrument: 'Vocational Training Levy of 4% of total gross monthly emoluments, payable by employers with 5+ employees; employers with 3-5 employees file a nil return every six months; effective 1 Jul 2023', url: 'https://www.payspace.com/blog/zanzibar-skills-development-levy-amendments/' },
    { authority: 'Worldwide Tax Summaries (PwC) — mainland Tanzania other taxes (for contrast, NOT used by this pack)', instrument: 'Mainland Skills Development Levy is 3.5% of gross cash emoluments, employers with 10+ employees — confirms the mainland figure genuinely differs from Zanzibar\'s 4%/5-employee levy above, supporting this pack\'s refusal to reuse one figure for both jurisdictions', url: 'https://taxsummaries.pwc.com/tanzania/individual/other-taxes' }
  ],
  limitations: [
    'v1 initial build, Zanzibar employment ONLY. A payroll run for a mainland-Tanzania employee is explicitly REJECTED (jurisdiction must be ZANZIBAR) rather than silently reusing Zanzibar\'s ZSSF (7%/13%) or Vocational Training Levy (4%) figures — mainland Tanzania has its own, different NSSF rates (not sourced this pass) and its own Skills Development Levy (3.5%, 10+ employee threshold, administered by TRA, per the contrast citation above), not approximated here.',
    'UNRESOLVED SOURCE CONFLICT — ZSSF employer rate: this pack uses 13% (employer) / 7% (employee) of gross monthly wage, taken directly from ZSSF\'s own live contribution calculator. A 2023 secondary source (payroll-vendor blog) claims the employer rate increased to 14% that year, citing a +1% employment injury benefit addition, but this pass could not independently confirm that change against any ZSSF primary publication (the calculator may already reflect it, may not, or may describe a different base) — reconfirm directly against ZSSF before this pack is marked VERIFIED_BASIC_RULES.',
    'UNRESOLVED SOURCE CONFLICT — Vocational Training Levy rate: this pack uses 4% (traceable to the Zanzibar Finance Act 2023\'s specific amendment of Vocational Training Act s.27, effective 1 Jul 2023). One secondary tax-guide source states 5% without citing a specific instrument or effective date; not resolved this pass.',
    'The Vocational Training Levy\'s 5-employee threshold is evaluated against total_employer_headcount, an OPTIONAL run-level input. If omitted, this engine falls back to the number of employees actually present in THIS run, which understates true headcount (and could wrongly report "nil"/no levy) for a partial run, e.g. one department or one pay group processed separately from the rest of the employer\'s staff.',
    'No Zanzibar-specific equivalent of mainland Tanzania\'s Workers Compensation Fund (WCF, 0.5% of cash emoluments) was found this pass. This is a disclosed absence of sourcing, NOT a confirmed finding that no such scheme exists for Zanzibar employers — treat WCF as an open question, not as "does not apply."',
    'NOT IMPLEMENTED: benefits-in-kind valuation, any pension/provident scheme beyond ZSSF, and all statutory filing (TRA PAYE returns, ZSSF contribution schedules, ZRB Vocational Training Levy returns). This engine prepares payroll and accounting outputs only — it does not file with TRA/ZSSF/ZRB.',
    'PAYE bracket table sourced from Worldwide Tax Summaries (PwC), not independently re-fetched from TRA\'s own published Income Tax Act schedule this pass — though corroborated by a second, independent tax-guide source citing the identical thresholds and base amounts.'
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

export function calculateTzPayroll(input: TzPayrollRunInput): TzPayrollRunResult {
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

  const p = PAYROLL_RULE_PACK_TZ;
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

    if (employee.jurisdiction !== 'ZANZIBAR') {
      const error = new Error(`jurisdiction for ${employeeId} must be ZANZIBAR -- this pack does not implement mainland Tanzania (different NSSF/SDL figures, not sourced); see lib/payroll-engine-tz.ts limitations`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);

    const paye = bracketLookup(grossPay, p.paye.brackets);
    const employeeZssf = money(grossPay * p.zssf.employee_rate);
    const employerZssf = money(grossPay * p.zssf.employer_rate);
    const netPay = money(grossPay - paye - employeeZssf);
    const employerFundedTotal = money(grossPay + employerZssf);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      paye,
      employee_zssf: employeeZssf,
      employer_zssf: employerZssf,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  function sum(values: number[]) {
    return money(values.reduce((a, b) => a + b, 0));
  }

  const totalGrossPay = sum(employees.map(e => e.gross_pay));
  const effectiveHeadcount = input.total_employer_headcount ?? employees.length;
  const vocationalLevyApplied = effectiveHeadcount >= p.vocational_levy.minimum_headcount;
  const vocationalLevy = vocationalLevyApplied ? money(totalGrossPay * p.vocational_levy.rate) : 0;

  const totals = {
    gross_pay: totalGrossPay,
    paye: sum(employees.map(e => e.paye)),
    employee_zssf: sum(employees.map(e => e.employee_zssf)),
    employer_zssf: sum(employees.map(e => e.employer_zssf)),
    vocational_levy: vocationalLevy,
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: money(sum(employees.map(e => e.employer_funded_total)) + vocationalLevy)
  };

  const journal: TzJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_ZSSF_EXPENSE', amount: totals.employer_zssf },
    ...(vocationalLevyApplied ? [{ side: 'DEBIT', account_role: 'EMPLOYER_VOCATIONAL_LEVY_EXPENSE', amount: vocationalLevy } as TzJournalLine] : []),
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'PAYE_PAYABLE', amount: totals.paye },
    { side: 'CREDIT', account_role: 'ZSSF_PAYABLE', amount: money(totals.employee_zssf + totals.employer_zssf) },
    ...(vocationalLevyApplied ? [{ side: 'CREDIT', account_role: 'VOCATIONAL_LEVY_PAYABLE', amount: vocationalLevy } as TzJournalLine] : [])
  ];

  const journalDebits = money(journal.filter(l => l.side === 'DEBIT').reduce((a, l) => a + l.amount, 0));
  const journalCredits = money(journal.filter(l => l.side === 'CREDIT').reduce((a, l) => a + l.amount, 0));

  const limitations = [...p.limitations];
  if (input.total_employer_headcount === undefined) {
    limitations.push(`total_employer_headcount was not supplied for this run -- fell back to this run's own employee count (${employees.length}) to evaluate the Vocational Training Levy's 5-employee threshold, which understates true headcount for a partial run.`);
  }

  return {
    rule_pack_id: p.id,
    country_code: 'TZ',
    currency: 'TZS',
    status: 'PREPARED',
    pay_period_start: input.pay_period_start,
    pay_period_end: input.pay_period_end,
    pay_date: input.pay_date,
    employees,
    totals,
    vocational_levy_applied: vocationalLevyApplied,
    journal,
    controls: {
      journal_balanced: Math.abs(journalDebits - journalCredits) < 0.005,
      journal_debits: journalDebits,
      journal_credits: journalCredits,
      employee_count: employees.length
    },
    limitations
  };
}

export function payrollEngineSelfTestTZ() {
  // Golden test: PAYE bracket 2 (8%). 300,000 gross -> 0 + 0.08*(300,000-270,000) = 2,400.
  // ZSSF: employee 7%*300,000=21,000; employer 13%*300,000=39,000.
  // Net = 300,000 - 2,400 - 21,000 = 276,600.
  const bracket2 = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'Z1', gross_pay: 300000, jurisdiction: 'ZANZIBAR' }],
    total_employer_headcount: 2
  });

  // Golden test: PAYE bracket 4 (25%). 900,000 gross -> 68,000 + 0.25*(900,000-760,000) = 103,000.
  // ZSSF: employee 63,000; employer 117,000. Net = 900,000-103,000-63,000 = 734,000.
  const bracket4 = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'Z2', gross_pay: 900000, jurisdiction: 'ZANZIBAR' }],
    total_employer_headcount: 2
  });

  // Golden test: PAYE top bracket (30%). 1,200,000 gross -> 128,000 + 0.30*(1,200,000-1,000,000) = 188,000.
  const topBracket = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'Z3', gross_pay: 1200000, jurisdiction: 'ZANZIBAR' }],
    total_employer_headcount: 1
  });

  // Golden test: tax-free threshold. 200,000 gross (below 270,000) -> PAYE = 0.
  const belowThreshold = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'Z4', gross_pay: 200000, jurisdiction: 'ZANZIBAR' }],
    total_employer_headcount: 1
  });

  // Golden test: Vocational Training Levy gates on headcount, not on this
  // run's own employee count. Two employees, 500,000 each (1,000,000 total
  // gross), total_employer_headcount=5 -> levy = 4% * 1,000,000 = 40,000,
  // applied. Same run with total_employer_headcount omitted (falls back to
  // this run's own count of 2, below the 5-employee threshold) -> no levy.
  const levyApplies = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'Z5', gross_pay: 500000, jurisdiction: 'ZANZIBAR' },
      { employee_id: 'Z6', gross_pay: 500000, jurisdiction: 'ZANZIBAR' }
    ],
    total_employer_headcount: 5
  });
  const levyFallback = calculateTzPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'Z7', gross_pay: 500000, jurisdiction: 'ZANZIBAR' },
      { employee_id: 'Z8', gross_pay: 500000, jurisdiction: 'ZANZIBAR' }
    ]
  });

  const e1 = bracket2.employees[0];
  const e2 = bracket4.employees[0];
  const e3 = topBracket.employees[0];
  const e4 = belowThreshold.employees[0];

  const ok =
    e1.paye === 2400 && e1.employee_zssf === 21000 && e1.employer_zssf === 39000 && e1.net_pay === 276600 && bracket2.controls.journal_balanced &&
    e2.paye === 103000 && e2.employee_zssf === 63000 && e2.employer_zssf === 117000 && e2.net_pay === 734000 && bracket4.controls.journal_balanced &&
    e3.paye === 188000 && topBracket.controls.journal_balanced &&
    e4.paye === 0 && belowThreshold.controls.journal_balanced &&
    levyApplies.vocational_levy_applied === true && levyApplies.totals.vocational_levy === 40000 && levyApplies.controls.journal_balanced &&
    levyFallback.vocational_levy_applied === false && levyFallback.totals.vocational_levy === 0 && levyFallback.controls.journal_balanced;

  return { ok, bracket2, bracket4, topBracket, belowThreshold, levyApplies, levyFallback };
}
