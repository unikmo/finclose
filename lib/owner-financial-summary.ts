// Plain-English financial statement for the business owner.
//
// This is a companion to the finished books, not a substitute for them.
// It MUST be built from the same final accounting figures/trial balance used
// for the signed-off close. It deliberately refuses to infer profit from bank
// inflows/outflows.
//
// Money is integer minor units (cents for EUR/USD/etc.) to avoid floating-point
// ambiguity in financial output.

export type OwnerBooksStatus = 'ACCOUNTANT_SIGNED_OFF' | 'APPROVED_AND_LOCKED';

export type OwnerFinancialStatementInput = {
  company_name: string;
  period: { start: string; end: string };
  currency: string;
  books_status: OwnerBooksStatus;
  source: {
    close_id: string;
    evidence_hash?: string;
  };
  profit_and_loss: {
    sales_cents: number;
    other_income_cents?: number;
    cost_of_sales_cents?: number;
    operating_expenses_cents: number;
    other_expenses_cents?: number;
    income_tax_expense_cents?: number;
  };
  balance_sheet: {
    cash_cents: number;
    receivables_cents: number;
    other_current_assets_cents?: number;
    fixed_assets_cents?: number;
    other_assets_cents?: number;
    payables_cents: number;
    tax_liabilities_cents: number;
    payroll_liabilities_cents?: number;
    loans_cents?: number;
    other_liabilities_cents?: number;
    equity_cents: number;
  };
  prior_period?: {
    label: string;
    sales_cents?: number;
    net_profit_cents?: number;
    cash_cents?: number;
    receivables_cents?: number;
    payables_cents?: number;
  };
};

export type OwnerStatementRow = {
  key: string;
  label: string;
  amount_cents: number;
  plain_words: string;
};

export type OwnerFinancialStatement = {
  statement_version: 'OWNER-FINANCIAL-SUMMARY-V1';
  status: 'FINAL';
  company_name: string;
  period: { start: string; end: string };
  currency: string;
  source: {
    books_status: OwnerBooksStatus;
    close_id: string;
    evidence_hash: string | null;
  };
  headline: string;
  performance: {
    title: 'How the business performed';
    rows: OwnerStatementRow[];
    gross_profit_cents: number;
    net_profit_cents: number;
  };
  position: {
    title: 'Where the business stands';
    rows: OwnerStatementRow[];
    total_assets_cents: number;
    total_liabilities_cents: number;
    equity_cents: number;
    net_assets_cents: number;
    accounting_equation_difference_cents: 0;
  };
  changes: string[];
  attention: string[];
  plain_english_summary: string[];
  limitations: string[];
};

function fail(message: string): never {
  const error = new Error(message);
  (error as Error & { status?: number }).status = 400;
  throw error;
}

function requireIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) {
    fail(field + ' must be YYYY-MM-DD');
  }
}

function cleanText(value: string, field: string, max = 200) {
  const text = String(value || '').trim();
  if (!text) fail(field + ' is required');
  return text.slice(0, max);
}

function cents(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) fail(field + ' must be an integer number of minor currency units');
  return n;
}

function optionalCents(value: unknown, field: string): number {
  return value === undefined ? 0 : cents(value, field);
}

function money(value: number, currency: string): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const fraction = String(abs % 100).padStart(2, '0');
  return sign + whole + '.' + fraction + ' ' + currency;
}

function pctChange(current: number, prior: number): string | null {
  if (prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  return rounded + '% ' + (pct >= 0 ? 'higher' : 'lower');
}

function changeSentence(label: string, current: number, prior: number, currency: string, priorLabel: string) {
  const diff = current - prior;
  if (diff === 0) return label + ' was unchanged from ' + priorLabel + '.';
  const pct = pctChange(current, prior);
  return label + ' was ' + money(Math.abs(diff), currency) + ' ' + (diff > 0 ? 'higher' : 'lower') + ' than ' + priorLabel + (pct ? ' (' + pct + ')' : '') + '.';
}

export function buildOwnerFinancialStatement(input: OwnerFinancialStatementInput): OwnerFinancialStatement {
  const companyName = cleanText(input.company_name, 'company_name');
  requireIsoDate(input.period.start, 'period.start');
  requireIsoDate(input.period.end, 'period.end');
  if (input.period.start > input.period.end) fail('period.start must not be after period.end');

  const currency = String(input.currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('currency must be a 3-letter code');

  if (!['ACCOUNTANT_SIGNED_OFF', 'APPROVED_AND_LOCKED'].includes(input.books_status)) {
    fail('owner financial statement may only be final when the books are signed off or approved and locked');
  }

  const closeId = cleanText(input.source?.close_id || '', 'source.close_id', 240);
  const evidenceHash = input.source?.evidence_hash ? cleanText(input.source.evidence_hash, 'source.evidence_hash', 128) : null;

  const sales = cents(input.profit_and_loss.sales_cents, 'profit_and_loss.sales_cents');
  const otherIncome = optionalCents(input.profit_and_loss.other_income_cents, 'profit_and_loss.other_income_cents');
  const costOfSales = optionalCents(input.profit_and_loss.cost_of_sales_cents, 'profit_and_loss.cost_of_sales_cents');
  const operatingExpenses = cents(input.profit_and_loss.operating_expenses_cents, 'profit_and_loss.operating_expenses_cents');
  const otherExpenses = optionalCents(input.profit_and_loss.other_expenses_cents, 'profit_and_loss.other_expenses_cents');
  const incomeTaxExpense = optionalCents(input.profit_and_loss.income_tax_expense_cents, 'profit_and_loss.income_tax_expense_cents');

  const grossProfit = sales - costOfSales;
  const netProfit = sales + otherIncome - costOfSales - operatingExpenses - otherExpenses - incomeTaxExpense;

  const bs = input.balance_sheet;
  const cash = cents(bs.cash_cents, 'balance_sheet.cash_cents');
  const receivables = cents(bs.receivables_cents, 'balance_sheet.receivables_cents');
  const otherCurrentAssets = optionalCents(bs.other_current_assets_cents, 'balance_sheet.other_current_assets_cents');
  const fixedAssets = optionalCents(bs.fixed_assets_cents, 'balance_sheet.fixed_assets_cents');
  const otherAssets = optionalCents(bs.other_assets_cents, 'balance_sheet.other_assets_cents');
  const payables = cents(bs.payables_cents, 'balance_sheet.payables_cents');
  const taxLiabilities = cents(bs.tax_liabilities_cents, 'balance_sheet.tax_liabilities_cents');
  const payrollLiabilities = optionalCents(bs.payroll_liabilities_cents, 'balance_sheet.payroll_liabilities_cents');
  const loans = optionalCents(bs.loans_cents, 'balance_sheet.loans_cents');
  const otherLiabilities = optionalCents(bs.other_liabilities_cents, 'balance_sheet.other_liabilities_cents');
  const equity = cents(bs.equity_cents, 'balance_sheet.equity_cents');

  const totalAssets = cash + receivables + otherCurrentAssets + fixedAssets + otherAssets;
  const totalLiabilities = payables + taxLiabilities + payrollLiabilities + loans + otherLiabilities;
  const equationDifference = totalAssets - (totalLiabilities + equity);
  if (equationDifference !== 0) {
    fail('finished-book figures do not balance: assets differ from liabilities + equity by ' + money(equationDifference, currency));
  }

  const performanceRows: OwnerStatementRow[] = [
    { key: 'sales', label: 'Sales', amount_cents: sales, plain_words: 'Revenue earned from customers during this period.' },
    ...(otherIncome !== 0 ? [{ key: 'other_income', label: 'Other income', amount_cents: otherIncome, plain_words: 'Income that did not come from normal customer sales.' }] : []),
    ...(costOfSales !== 0 ? [{ key: 'cost_of_sales', label: 'Direct costs', amount_cents: costOfSales, plain_words: 'Costs directly tied to delivering the products or services sold.' }] : []),
    { key: 'operating_expenses', label: 'Operating costs', amount_cents: operatingExpenses, plain_words: 'The normal costs of running the business.' },
    ...(otherExpenses !== 0 ? [{ key: 'other_expenses', label: 'Other costs', amount_cents: otherExpenses, plain_words: 'Costs outside the normal day-to-day operating expenses.' }] : []),
    ...(incomeTaxExpense !== 0 ? [{ key: 'income_tax_expense', label: 'Income tax expense', amount_cents: incomeTaxExpense, plain_words: 'Income tax expense recorded for this period.' }] : []),
    { key: 'net_profit', label: netProfit >= 0 ? 'Profit' : 'Loss', amount_cents: netProfit, plain_words: netProfit >= 0 ? 'What remained after all recorded costs and tax expense.' : 'The amount by which recorded costs and tax expense exceeded income.' }
  ];

  const positionRows: OwnerStatementRow[] = [
    { key: 'cash', label: 'Cash', amount_cents: cash, plain_words: 'Money in the business bank and cash accounts at period end.' },
    { key: 'receivables', label: 'Customers owe you', amount_cents: receivables, plain_words: 'Sales already recorded but not yet collected from customers.' },
    ...(otherCurrentAssets !== 0 ? [{ key: 'other_current_assets', label: 'Other short-term assets', amount_cents: otherCurrentAssets, plain_words: 'Other assets expected to turn into cash or be used soon.' }] : []),
    ...(fixedAssets !== 0 ? [{ key: 'fixed_assets', label: 'Long-term assets', amount_cents: fixedAssets, plain_words: 'Equipment, property and other long-term assets after recorded depreciation.' }] : []),
    ...(otherAssets !== 0 ? [{ key: 'other_assets', label: 'Other assets', amount_cents: otherAssets, plain_words: 'Other recorded assets not included above.' }] : []),
    { key: 'payables', label: 'You owe suppliers', amount_cents: payables, plain_words: 'Bills and supplier invoices recorded but not yet paid.' },
    { key: 'tax_liabilities', label: 'Taxes still to pay', amount_cents: taxLiabilities, plain_words: 'Tax amounts recorded as payable at period end.' },
    ...(payrollLiabilities !== 0 ? [{ key: 'payroll_liabilities', label: 'Payroll still to pay', amount_cents: payrollLiabilities, plain_words: 'Salary, payroll tax, pension or social amounts recorded but not yet settled.' }] : []),
    ...(loans !== 0 ? [{ key: 'loans', label: 'Loans', amount_cents: loans, plain_words: 'Outstanding borrowing recorded by the business.' }] : []),
    ...(otherLiabilities !== 0 ? [{ key: 'other_liabilities', label: 'Other amounts you owe', amount_cents: otherLiabilities, plain_words: 'Other recorded obligations not included above.' }] : []),
    { key: 'equity', label: 'Owner value in the business', amount_cents: equity, plain_words: 'What is left for the owners after recorded liabilities are deducted from recorded assets.' }
  ];

  const headline =
    netProfit > 0
      ? 'The business made a profit of ' + money(netProfit, currency) + ' for this period.'
      : netProfit < 0
        ? 'The business made a loss of ' + money(Math.abs(netProfit), currency) + ' for this period.'
        : 'The business broke even for this period.';

  const changes: string[] = [];
  if (input.prior_period) {
    const prior = input.prior_period;
    const label = cleanText(prior.label, 'prior_period.label', 80);
    if (prior.sales_cents !== undefined) changes.push(changeSentence('Sales', sales, cents(prior.sales_cents, 'prior_period.sales_cents'), currency, label));
    if (prior.net_profit_cents !== undefined) changes.push(changeSentence('Profit', netProfit, cents(prior.net_profit_cents, 'prior_period.net_profit_cents'), currency, label));
    if (prior.cash_cents !== undefined) changes.push(changeSentence('Cash', cash, cents(prior.cash_cents, 'prior_period.cash_cents'), currency, label));
    if (prior.receivables_cents !== undefined) changes.push(changeSentence('Money customers owe you', receivables, cents(prior.receivables_cents, 'prior_period.receivables_cents'), currency, label));
    if (prior.payables_cents !== undefined) changes.push(changeSentence('Supplier bills still to pay', payables, cents(prior.payables_cents, 'prior_period.payables_cents'), currency, label));
  }

  const attention: string[] = [];
  if (netProfit < 0) attention.push('The period ended with a loss of ' + money(Math.abs(netProfit), currency) + '.');
  if (cash < 0) attention.push('Cash is negative by ' + money(Math.abs(cash), currency) + ' at period end.');
  if (receivables > 0) attention.push('Customers still owe the business ' + money(receivables, currency) + '.');
  if (payables > 0) attention.push('Supplier bills still to pay total ' + money(payables, currency) + '.');
  if (taxLiabilities > 0) attention.push('Recorded taxes still to pay total ' + money(taxLiabilities, currency) + '.');
  if (payrollLiabilities > 0) attention.push('Recorded payroll-related amounts still to pay total ' + money(payrollLiabilities, currency) + '.');
  if (loans > 0) attention.push('Outstanding loans total ' + money(loans, currency) + '.');

  const plainEnglishSummary = [
    headline,
    'Sales were ' + money(sales, currency) + ' and normal operating costs were ' + money(operatingExpenses, currency) + '.',
    'At period end the business had ' + money(cash, currency) + ' in cash and ' + money(receivables, currency) + ' still to collect from customers.',
    'Recorded liabilities total ' + money(totalLiabilities, currency) + '; after those liabilities, owner equity is ' + money(equity, currency) + '.'
  ];

  return {
    statement_version: 'OWNER-FINANCIAL-SUMMARY-V1',
    status: 'FINAL',
    company_name: companyName,
    period: { ...input.period },
    currency,
    source: {
      books_status: input.books_status,
      close_id: closeId,
      evidence_hash: evidenceHash
    },
    headline,
    performance: {
      title: 'How the business performed',
      rows: performanceRows,
      gross_profit_cents: grossProfit,
      net_profit_cents: netProfit
    },
    position: {
      title: 'Where the business stands',
      rows: positionRows,
      total_assets_cents: totalAssets,
      total_liabilities_cents: totalLiabilities,
      equity_cents: equity,
      net_assets_cents: totalAssets - totalLiabilities,
      accounting_equation_difference_cents: 0
    },
    changes,
    attention,
    plain_english_summary: plainEnglishSummary,
    limitations: [
      'This is the owner-readable companion to the finished books. It uses the same final accounting figures and does not replace the detailed ledger, statutory accounts, tax return or accountant sign-off.',
      'Bank inflows and outflows are never treated as sales, expenses or profit unless the finished accounting records classify them that way.',
      'The summary explains recorded accounting results; it does not predict future cash flow, value the company, or provide tax/investment advice.'
    ]
  };
}

export function renderOwnerFinancialStatementMarkdown(statement: OwnerFinancialStatement): string {
  const lines: string[] = [];
  lines.push('# ' + statement.company_name + ' — Owner Financial Summary');
  lines.push('');
  lines.push('**Period:** ' + statement.period.start + ' to ' + statement.period.end);
  lines.push('**Status:** Final — based on ' + (statement.source.books_status === 'ACCOUNTANT_SIGNED_OFF' ? 'accountant-signed-off books' : 'approved and locked books'));
  lines.push('');
  lines.push(statement.headline);
  lines.push('');
  lines.push('## How the business performed');
  for (const row of statement.performance.rows) lines.push('- **' + row.label + ':** ' + money(row.amount_cents, statement.currency) + ' — ' + row.plain_words);
  lines.push('');
  lines.push('## Where the business stands');
  for (const row of statement.position.rows) lines.push('- **' + row.label + ':** ' + money(row.amount_cents, statement.currency) + ' — ' + row.plain_words);
  if (statement.changes.length) {
    lines.push('');
    lines.push('## What changed');
    for (const item of statement.changes) lines.push('- ' + item);
  }
  if (statement.attention.length) {
    lines.push('');
    lines.push('## What needs your attention');
    for (const item of statement.attention) lines.push('- ' + item);
  }
  lines.push('');
  lines.push('## In simple words');
  for (const item of statement.plain_english_summary) lines.push('- ' + item);
  lines.push('');
  lines.push('---');
  lines.push(statement.limitations[0]);
  return lines.join('\n');
}
