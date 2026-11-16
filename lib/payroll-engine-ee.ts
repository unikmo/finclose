// Estonia (EE) payroll rule pack — 2026 v1.
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW.
// This pack models ordinary cash remuneration under an Estonian employment
// contract for payments made in calendar year 2026. It is deliberately
// fail-closed outside 2026 and for inputs that require legal/employment facts
// the engine cannot infer safely.
//
// Official 2026 basis checked against the Estonian Tax and Customs Board
// (EMTA) and the current Income Tax Act:
// - withheld income tax: 22%;
// - basic exemption: up to EUR 700/month, or EUR 776/month for a person who
//   has reached pensionable age in the tax year;
// - social tax: 33%; 2026 statutory monthly minimum base EUR 886;
// - unemployment insurance: 1.6% employee / 0.8% employer;
// - funded pension (II pillar): 0%, 2%, 4% or 6%, based on the employee's
//   current Pension Registry status/election;
// - employee unemployment insurance and funded-pension contributions are
//   deducted before calculating withheld income tax.
//
// The pack prepares payroll/accounting output only. It does not submit TSD,
// register employment, query the Pension Registry, make salary/tax payments,
// or determine cross-border social-security/A1 status.

export type EeFundedPensionRate = 0 | 0.02 | 0.04 | 0.06;

export type EeEmployeeInput = {
  employee_id: string;
  name?: string;

  // Cash employment remuneration paid in this run. This v1 pack supports
  // ordinary employment-contract remuneration only (TSD Annex 1 payment type
  // 10 shape), not redundancy/termination awards, sickness-benefit special
  // cases, board-member fees, fringe benefits or non-resident special cases.
  gross_pay: number;

  // Amount of the employee's written basic-exemption application to apply to
  // THIS payment/month. Caller must already account for any amount consumed by
  // another payment in the same calendar month. 0 is valid.
  basic_exemption_amount: number;

  // True only when the employee has reached pensionable age for the relevant
  // tax year. The 2026 monthly ceiling is then EUR 776 instead of EUR 700.
  pensionable_age_for_tax_year: boolean;

  // Current II-pillar rate from the Pension Registry: 0, 2%, 4% or 6%.
  // FinClose never infers pension participation or rate from age.
  funded_pension_rate: EeFundedPensionRate;

  // Employee UI withholding stops in specified pension/early/flexible-pension
  // cases. Employer UI remains payable for ordinary employment remuneration.
  employee_unemployment_insurance_applicable: boolean;

  // Exact statutory minimum SOCIAL-TAX BASE applicable to this employee for
  // the month, before comparing with actual gross pay.
  //
  // Use 886 for a standard full-month employee when this employer bears the
  // full 2026 minimum obligation; use the legally applicable prorated/adjusted
  // amount for partial-month or multi-employer cases; use 0 when an exception
  // means social tax is due only on actual remuneration.
  //
  // This is caller-supplied deliberately: Estonian minimum-social-tax rules
  // contain multiple statutory exceptions and multi-employer/proration rules
  // that cannot be inferred safely from payroll amount alone.
  minimum_social_tax_base: number;
};

export type EePayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: EeEmployeeInput[];
};

export type EeJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_SOCIAL_TAX_EXPENSE'
    | 'EMPLOYER_UNEMPLOYMENT_INSURANCE_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'INCOME_TAX_PAYABLE'
    | 'FUNDED_PENSION_PAYABLE'
    | 'SOCIAL_TAX_PAYABLE'
    | 'UNEMPLOYMENT_INSURANCE_PAYABLE';
  amount: number;
};

export type EeEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  basic_exemption_requested: number;
  basic_exemption_applied: number;
  funded_pension_rate: EeFundedPensionRate;
  funded_pension: number;
  employee_unemployment_insurance: number;
  employer_unemployment_insurance: number;
  income_tax_base: number;
  income_tax: number;
  social_tax_base: number;
  employer_social_tax: number;
  net_pay: number;
  employer_funded_total: number;
};

export type EePayrollRunResult = {
  rule_pack_id: string;
  country_code: 'EE';
  currency: 'EUR';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: EeEmployeeResult[];
  totals: {
    gross_pay: number;
    basic_exemption_applied: number;
    funded_pension: number;
    employee_unemployment_insurance: number;
    employer_unemployment_insurance: number;
    income_tax: number;
    employer_social_tax: number;
    net_pay: number;
    employer_funded_total: number;
  };
  journal: EeJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_EE = {
  id: 'EE-2026-EMPLOYMENT-V1-DRAFT',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'EUR',
  income_tax_rate: 0.22,
  standard_basic_exemption_monthly: 700,
  pensionable_age_basic_exemption_monthly: 776,
  social_tax_rate: 0.33,
  social_tax_minimum_monthly_base: 886,
  employee_unemployment_insurance_rate: 0.016,
  employer_unemployment_insurance_rate: 0.008,
  funded_pension_rates: [0, 0.02, 0.04, 0.06] as const,
  evidence: [
    {
      authority: 'Estonian Tax and Customs Board (EMTA)',
      instrument: 'Tax rates — 2026 income tax, social tax, unemployment insurance, funded pension and minimum social-tax base',
      url: 'https://www.emta.ee/en/private-client/taxes-and-payment/declaration-income/tax-rates'
    },
    {
      authority: 'Estonian Tax and Customs Board (EMTA)',
      instrument: 'Calculation of basic exemption — 2026 EUR 700 monthly exemption, EUR 776 at pensionable age, written-application rules',
      url: 'https://www.emta.ee/en/private-client/taxes-and-payment/tax-incentives/calculation-basic-exemption'
    },
    {
      authority: 'Estonian Tax and Customs Board (EMTA)',
      instrument: 'Social tax — 33% rate, 2026 EUR 886 minimum monthly base, exceptions and proration guidance',
      url: 'https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/social-tax'
    },
    {
      authority: 'Estonian Tax and Customs Board (EMTA)',
      instrument: 'Unemployment insurance premiums — employee and employer treatment including pension cases',
      url: 'https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/unemployment-insurance-premiums'
    },
    {
      authority: 'Riigi Teataja',
      instrument: 'Income Tax Act, current 2026 text — §42 deductions before withholding; employee UI and mandatory funded-pension contributions deductible before withheld income tax',
      url: 'https://www.riigiteataja.ee/en/tolge/pdf/515042026001'
    },
    {
      authority: 'Estonian Tax and Customs Board (EMTA)',
      instrument: 'Income from employment — ordinary salary labour taxes and TSD payment-type boundary',
      url: 'https://www.emta.ee/en/private-client/taxes-and-payment/taxable-income/income-employment'
    }
  ],
  limitations: [
    'DRAFT_NEEDS_LEGAL_REVIEW: official 2026 sources were checked, but this pack has not yet been independently validated against an e-MTA/TSD calculation or a real Estonian payroll golden fixture. It must not be marked VERIFIED_BASIC_RULES until that review is complete.',
    'Only ordinary cash remuneration under an employment contract is modeled. Redundancy/termination compensation, employer sickness-benefit special treatment, board/member remuneration, contracts under the law of obligations, fringe benefits, stock/options, garnishments and other payment types are outside v1.',
    'The caller supplies the basic_exemption_amount for the payment month. FinClose does not infer whether another employer, the Social Insurance Board or another payment in the same month has already consumed part of the employee\'s monthly exemption.',
    'The caller supplies pensionable_age_for_tax_year. For pensioners, the Social Insurance Board may already apply the EUR 776 exemption to pension; only an unused amount supported by the employee\'s application should be supplied to this payroll run.',
    'The caller supplies funded_pension_rate from the current Pension Registry position. In 2026 the withholding obligation/rate can change on 1 January, 1 May and 1 September; FinClose does not query the registry itself.',
    'The caller explicitly states whether employee unemployment insurance withholding applies. Employer unemployment insurance remains calculated at 0.8% for ordinary employment remuneration in this v1 pack.',
    'The caller supplies minimum_social_tax_base. This is intentional because the EUR 886 full-month minimum has statutory exceptions, partial-month proration and multi-employer rules; the engine uses max(gross pay, supplied minimum base) and does not guess those legal facts.',
    'Cross-border/posted-worker/A1/social-security-agreement cases are not calculated. This pack assumes Estonian labour taxes apply to the ordinary employment remuneration supplied.',
    'Minimum-wage compliance is not enforced by this payroll calculator. Estonia\'s minimum wage changed during 2026 and working-time facts belong to employment compliance rather than the tax arithmetic modeled here.',
    'Only pay dates from 2026-01-01 through 2026-12-31 are accepted. Estonia taxes salary on a cash basis, so a December 2026 salary paid in January 2027 requires 2027 rates and is rejected until a 2027 rule pack is implemented.',
    'This engine prepares payroll and balanced accounting output only. It does not register employment, submit form TSD, query pension status, approve payroll, initiate salary/tax payments or file statutory returns.'
  ]
} as const;

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fail(message: string, status = 400): never {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  throw error;
}

function requireIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) {
    fail(field + ' must be YYYY-MM-DD');
  }
}

function requireNonNegativeMoney(value: unknown, field: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(field + ' must be a non-negative number');
  return money(n);
}

function sum(values: number[]) {
  return money(values.reduce((total, value) => total + value, 0));
}

function isFundedPensionRate(value: number): value is EeFundedPensionRate {
  return value === 0 || value === 0.02 || value === 0.04 || value === 0.06;
}

export function calculateEePayroll(input: EePayrollRunInput): EePayrollRunResult {
  requireIsoDate(input.pay_period_start, 'pay_period_start');
  requireIsoDate(input.pay_period_end, 'pay_period_end');
  requireIsoDate(input.pay_date, 'pay_date');

  if (input.pay_period_start > input.pay_period_end) fail('pay_period_start must not be after pay_period_end');
  if (input.pay_date < '2026-01-01' || input.pay_date > '2026-12-31') {
    fail('Estonia payroll v1 supports only payments made in calendar year 2026; Estonia salary taxation is cash-based, so use a rule pack for the actual payment year');
  }
  if (!Array.isArray(input.employees) || input.employees.length === 0) fail('at least one employee is required');

  const seen = new Set<string>();
  const employees = input.employees.map(employee => {
    const employeeId = String(employee.employee_id || '').trim();
    if (!employeeId) fail('employee_id is required');
    if (seen.has(employeeId)) fail('duplicate employee_id: ' + employeeId);
    seen.add(employeeId);

    const grossPay = requireNonNegativeMoney(employee.gross_pay, 'gross_pay for ' + employeeId);
    const requestedExemption = requireNonNegativeMoney(employee.basic_exemption_amount, 'basic_exemption_amount for ' + employeeId);
    const minimumSocialTaxBase = requireNonNegativeMoney(employee.minimum_social_tax_base, 'minimum_social_tax_base for ' + employeeId);

    if (typeof employee.pensionable_age_for_tax_year !== 'boolean') {
      fail('pensionable_age_for_tax_year must be true or false for ' + employeeId);
    }
    if (typeof employee.employee_unemployment_insurance_applicable !== 'boolean') {
      fail('employee_unemployment_insurance_applicable must be true or false for ' + employeeId);
    }

    const fundedRate = Number(employee.funded_pension_rate);
    if (!isFundedPensionRate(fundedRate)) {
      fail('funded_pension_rate must be 0, 0.02, 0.04 or 0.06 for ' + employeeId);
    }

    const exemptionCeiling = employee.pensionable_age_for_tax_year
      ? PAYROLL_RULE_PACK_EE.pensionable_age_basic_exemption_monthly
      : PAYROLL_RULE_PACK_EE.standard_basic_exemption_monthly;
    if (requestedExemption > exemptionCeiling) {
      fail('basic_exemption_amount exceeds the 2026 monthly ceiling of EUR ' + exemptionCeiling + ' for ' + employeeId);
    }
    if (minimumSocialTaxBase > PAYROLL_RULE_PACK_EE.social_tax_minimum_monthly_base) {
      fail('minimum_social_tax_base cannot exceed the 2026 statutory monthly base of EUR 886 for ' + employeeId);
    }

    const basicExemptionApplied = money(Math.min(requestedExemption, grossPay));
    const fundedPension = money(grossPay * fundedRate);
    const employeeUi = employee.employee_unemployment_insurance_applicable
      ? money(grossPay * PAYROLL_RULE_PACK_EE.employee_unemployment_insurance_rate)
      : 0;
    const employerUi = money(grossPay * PAYROLL_RULE_PACK_EE.employer_unemployment_insurance_rate);

    // Income Tax Act §42: withheld employee UI and mandatory funded-pension
    // contributions are deducted from the payment before withheld income tax.
    // Basic exemption is then included as an additional permitted deduction.
    const incomeTaxBase = money(Math.max(0, grossPay - employeeUi - fundedPension - basicExemptionApplied));
    const incomeTax = money(incomeTaxBase * PAYROLL_RULE_PACK_EE.income_tax_rate);

    const socialTaxBase = money(Math.max(grossPay, minimumSocialTaxBase));
    const employerSocialTax = money(socialTaxBase * PAYROLL_RULE_PACK_EE.social_tax_rate);

    const netPay = money(grossPay - employeeUi - fundedPension - incomeTax);
    const employerFundedTotal = money(grossPay + employerUi + employerSocialTax);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      basic_exemption_requested: requestedExemption,
      basic_exemption_applied: basicExemptionApplied,
      funded_pension_rate: fundedRate,
      funded_pension: fundedPension,
      employee_unemployment_insurance: employeeUi,
      employer_unemployment_insurance: employerUi,
      income_tax_base: incomeTaxBase,
      income_tax: incomeTax,
      social_tax_base: socialTaxBase,
      employer_social_tax: employerSocialTax,
      net_pay: netPay,
      employer_funded_total: employerFundedTotal
    };
  });

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    basic_exemption_applied: sum(employees.map(e => e.basic_exemption_applied)),
    funded_pension: sum(employees.map(e => e.funded_pension)),
    employee_unemployment_insurance: sum(employees.map(e => e.employee_unemployment_insurance)),
    employer_unemployment_insurance: sum(employees.map(e => e.employer_unemployment_insurance)),
    income_tax: sum(employees.map(e => e.income_tax)),
    employer_social_tax: sum(employees.map(e => e.employer_social_tax)),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_funded_total: sum(employees.map(e => e.employer_funded_total))
  };

  const journal: EeJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_SOCIAL_TAX_EXPENSE', amount: totals.employer_social_tax },
    { side: 'DEBIT', account_role: 'EMPLOYER_UNEMPLOYMENT_INSURANCE_EXPENSE', amount: totals.employer_unemployment_insurance },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'INCOME_TAX_PAYABLE', amount: totals.income_tax },
    { side: 'CREDIT', account_role: 'FUNDED_PENSION_PAYABLE', amount: totals.funded_pension },
    { side: 'CREDIT', account_role: 'SOCIAL_TAX_PAYABLE', amount: totals.employer_social_tax },
    {
      side: 'CREDIT',
      account_role: 'UNEMPLOYMENT_INSURANCE_PAYABLE',
      amount: money(totals.employee_unemployment_insurance + totals.employer_unemployment_insurance)
    }
  ].filter(line => line.amount !== 0) as EeJournalLine[];

  const journalDebits = sum(journal.filter(line => line.side === 'DEBIT').map(line => line.amount));
  const journalCredits = sum(journal.filter(line => line.side === 'CREDIT').map(line => line.amount));

  return {
    rule_pack_id: PAYROLL_RULE_PACK_EE.id,
    country_code: 'EE',
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
    limitations: [...PAYROLL_RULE_PACK_EE.limitations]
  };
}

export function payrollEngineSelfTestEE() {
  const standard = calculateEePayroll({
    pay_period_start: '2026-06-01',
    pay_period_end: '2026-06-30',
    pay_date: '2026-06-30',
    employees: [{
      employee_id: 'EE001',
      gross_pay: 2000,
      basic_exemption_amount: 700,
      pensionable_age_for_tax_year: false,
      funded_pension_rate: 0.02,
      employee_unemployment_insurance_applicable: true,
      minimum_social_tax_base: 886
    }]
  });
  const s = standard.employees[0];

  const sixPercent = calculateEePayroll({
    pay_period_start: '2026-09-01',
    pay_period_end: '2026-09-30',
    pay_date: '2026-09-30',
    employees: [{
      employee_id: 'EE002',
      gross_pay: 3000,
      basic_exemption_amount: 700,
      pensionable_age_for_tax_year: false,
      funded_pension_rate: 0.06,
      employee_unemployment_insurance_applicable: true,
      minimum_social_tax_base: 886
    }]
  });
  const p6 = sixPercent.employees[0];

  const pensioner = calculateEePayroll({
    pay_period_start: '2026-03-01',
    pay_period_end: '2026-03-31',
    pay_date: '2026-03-31',
    employees: [{
      employee_id: 'EE003',
      gross_pay: 500,
      basic_exemption_amount: 500,
      pensionable_age_for_tax_year: true,
      funded_pension_rate: 0,
      employee_unemployment_insurance_applicable: false,
      minimum_social_tax_base: 0
    }]
  });
  const pr = pensioner.employees[0];

  const lowWageMinimum = calculateEePayroll({
    pay_period_start: '2026-02-01',
    pay_period_end: '2026-02-28',
    pay_date: '2026-02-28',
    employees: [{
      employee_id: 'EE004',
      gross_pay: 500,
      basic_exemption_amount: 0,
      pensionable_age_for_tax_year: false,
      funded_pension_rate: 0,
      employee_unemployment_insurance_applicable: true,
      minimum_social_tax_base: 886
    }]
  });
  const lw = lowWageMinimum.employees[0];

  let rejected2027 = false;
  try {
    calculateEePayroll({
      pay_period_start: '2026-12-01',
      pay_period_end: '2026-12-31',
      pay_date: '2027-01-05',
      employees: [{
        employee_id: 'EE2027',
        gross_pay: 2000,
        basic_exemption_amount: 700,
        pensionable_age_for_tax_year: false,
        funded_pension_rate: 0.02,
        employee_unemployment_insurance_applicable: true,
        minimum_social_tax_base: 886
      }]
    });
  } catch {
    rejected2027 = true;
  }

  return {
    ok:
      s.employee_unemployment_insurance === 32 &&
      s.employer_unemployment_insurance === 16 &&
      s.funded_pension === 40 &&
      s.basic_exemption_applied === 700 &&
      s.income_tax_base === 1228 &&
      s.income_tax === 270.16 &&
      s.employer_social_tax === 660 &&
      s.net_pay === 1657.84 &&
      s.employer_funded_total === 2676 &&
      standard.controls.journal_balanced &&
      p6.funded_pension === 180 &&
      p6.employee_unemployment_insurance === 48 &&
      p6.income_tax_base === 2072 &&
      p6.income_tax === 455.84 &&
      p6.net_pay === 2316.16 &&
      sixPercent.controls.journal_balanced &&
      pr.employee_unemployment_insurance === 0 &&
      pr.employer_unemployment_insurance === 4 &&
      pr.income_tax === 0 &&
      pr.employer_social_tax === 165 &&
      pr.net_pay === 500 &&
      pensioner.controls.journal_balanced &&
      lw.social_tax_base === 886 &&
      lw.employer_social_tax === 292.38 &&
      lw.employee_unemployment_insurance === 8 &&
      lw.income_tax === 108.24 &&
      lw.net_pay === 383.76 &&
      lowWageMinimum.controls.journal_balanced &&
      rejected2027,
    standard,
    sixPercent,
    pensioner,
    lowWageMinimum
  };
}
