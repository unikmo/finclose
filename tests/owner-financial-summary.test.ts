import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOwnerFinancialStatement,
  renderOwnerFinancialStatementMarkdown
} from '../lib/owner-financial-summary';

const base = {
  company_name: 'Example OÜ',
  period: { start: '2026-10-01', end: '2026-10-31' },
  currency: 'EUR',
  books_status: 'ACCOUNTANT_SIGNED_OFF' as const,
  source: { close_id: 'close-2026-10', evidence_hash: 'abc123' },
  profit_and_loss: {
    sales_cents: 1000000,
    cost_of_sales_cents: 200000,
    operating_expenses_cents: 500000,
    other_income_cents: 50000,
    other_expenses_cents: 30000,
    income_tax_expense_cents: 20000
  },
  balance_sheet: {
    cash_cents: 800000,
    receivables_cents: 400000,
    other_current_assets_cents: 100000,
    fixed_assets_cents: 700000,
    payables_cents: 300000,
    tax_liabilities_cents: 100000,
    payroll_liabilities_cents: 50000,
    loans_cents: 400000,
    equity_cents: 1150000
  },
  prior_period: {
    label: 'September',
    sales_cents: 900000,
    net_profit_cents: 250000,
    cash_cents: 750000,
    receivables_cents: 350000,
    payables_cents: 280000
  }
};

test('owner statement calculates profit and financial position from final figures', () => {
  const result = buildOwnerFinancialStatement(base);

  assert.equal(result.status, 'FINAL');
  assert.equal(result.performance.gross_profit_cents, 800000);
  assert.equal(result.performance.net_profit_cents, 300000);
  assert.equal(result.position.total_assets_cents, 2000000);
  assert.equal(result.position.total_liabilities_cents, 850000);
  assert.equal(result.position.equity_cents, 1150000);
  assert.equal(result.position.accounting_equation_difference_cents, 0);
  assert.match(result.headline, /profit of 3,000.00 EUR/);
  assert.ok(result.attention.some(x => /Customers still owe/.test(x)));
  assert.ok(result.changes.some(x => /Sales was 1,000.00 EUR higher than September/.test(x)));
});

test('owner statement explains a loss without calling bank movements profit', () => {
  const input = {
    ...base,
    profit_and_loss: {
      sales_cents: 400000,
      operating_expenses_cents: 500000
    },
    balance_sheet: {
      cash_cents: 200000,
      receivables_cents: 0,
      payables_cents: 100000,
      tax_liabilities_cents: 0,
      equity_cents: 100000
    },
    prior_period: undefined
  };
  const result = buildOwnerFinancialStatement(input);
  assert.equal(result.performance.net_profit_cents, -100000);
  assert.match(result.headline, /loss of 1,000.00 EUR/);
  assert.ok(result.limitations.some(x => /Bank inflows and outflows are never treated as sales/.test(x)));
});

test('owner statement refuses unbalanced finished-book figures', () => {
  assert.throws(() => buildOwnerFinancialStatement({
    ...base,
    balance_sheet: { ...base.balance_sheet, equity_cents: 1149999 }
  }), /do not balance/);
});

test('owner statement requires final books and valid currency/date inputs', () => {
  assert.throws(() => buildOwnerFinancialStatement({
    ...base,
    books_status: 'DRAFT' as never
  }), /only be final/);

  assert.throws(() => buildOwnerFinancialStatement({
    ...base,
    currency: 'EURO'
  }), /3-letter code/);
});

test('owner statement markdown is owner-readable', () => {
  const result = buildOwnerFinancialStatement(base);
  const markdown = renderOwnerFinancialStatementMarkdown(result);
  assert.match(markdown, /How the business performed/);
  assert.match(markdown, /Where the business stands/);
  assert.match(markdown, /Customers owe you/);
  assert.match(markdown, /Taxes still to pay/);
  assert.match(markdown, /What changed/);
  assert.match(markdown, /In simple words/);
});
