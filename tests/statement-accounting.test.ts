import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStatementReview } from '../lib/statement-prep.ts';
import { checkBalanceContinuity } from '../lib/statement-accounting.ts';

const base = { company_name: 'Test OÜ', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31' };
const run = (rows: string[], extra: Record<string, unknown> = {}) =>
  prepareStatementReview({ ...base, csv_text: ['date,amount,counterparty,description', ...rows].join('\n'), ...extra }, 1);
const codes = (r: ReturnType<typeof run>) => r.pack.exceptions.map(e => e.code);

test('an own-account transfer pair is excluded from income and expense', () => {
  const r = run(['2026-03-02,-1000.00,Test OÜ,internal transfer to savings', '2026-03-03,1000.00,Test OÜ,transfer from main']);
  assert.equal(r.pack.summary.transfer_count, 2);
  assert.equal(r.pack.summary.inflow_cents, 0);
  assert.equal(r.pack.summary.outflow_cents, 0);
  assert.ok(!codes(r).includes('TRANSFER_UNMATCHED'));
});

test('a transfer with no other leg asks for the other statement', () => {
  const r = run(['2026-03-02,-1000.00,Test OÜ,internal transfer to savings']);
  assert.ok(codes(r).includes('TRANSFER_UNMATCHED'));
});

test('equal and opposite amounts with no sign of one owner are asked about, not assumed', () => {
  const r = run(['2026-03-02,-300.00,Alpha Ltd,work', '2026-03-03,300.00,Beta Ltd,work']);
  assert.ok(codes(r).includes('POSSIBLE_TRANSFER'));
  assert.equal(r.pack.summary.transfer_count, 0);
});

test('a refund nets against the earlier payment and is not income', () => {
  const r = run(['2026-03-02,-120.00,Slack,subscription', '2026-03-10,120.00,Slack,refund']);
  const refund = r.pack.entries.find(e => e.amount_cents === 12000);
  assert.equal(refund?.category_code, 'SOFTWARE');
  assert.ok(refund?.document_ids.length === 0);
  assert.ok(!codes(r).includes('MISSING_DOCUMENT') || r.pack.exceptions.filter(e => e.code === 'MISSING_DOCUMENT').every(e => (e.evidence?.amount_cents ?? 0) < 0));
});

test('refund wording with nothing to net against is raised', () => {
  const r = run(['2026-03-10,50.00,Mystery Shop,refund order 4']);
  assert.ok(codes(r).includes('REFUND_UNMATCHED'));
});

test('other currencies are never summed with the base currency', () => {
  const r = prepareStatementReview({ ...base, csv_text: 'date,amount,currency,counterparty,description\n2026-03-02,-10.00,EUR,Slack,sub\n2026-03-03,-99.00,USD,Slack,sub', currency: 'EUR' }, 1);
  assert.equal(r.pack.summary.outflow_cents, 1000);
  assert.equal(r.pack.summary.foreign_currency_count, 1);
  assert.ok(codes(r).includes('FX_REVIEW'));
});

test('balance continuity: matches pass, a gap is a HIGH exception that blocks readiness', () => {
  const rows = ['2026-03-05,-5.00,LHV,Monthly fee'];
  const ok = run(rows, { opening_balance: '100.00', closing_balance: '95.00' });
  assert.ok(!codes(ok).includes('BALANCE_MISMATCH'));
  const bad = run(rows, { opening_balance: '100.00', closing_balance: '80.00' });
  assert.ok(codes(bad).includes('BALANCE_MISMATCH'));
  assert.equal(bad.pack.summary.accountant_ready, false);
  assert.throws(() => run(rows, { opening_balance: '100.00' }), /both opening_balance and closing_balance/);
});

test('checkBalanceContinuity returns null when balances are not given', () => {
  assert.equal(checkBalanceContinuity([], { period: { start: '2026-03-01', end: '2026-03-31' }, base_currency: 'EUR' }), null);
});

test('reviewer overrides and dismissed duplicates change the next pack', () => {
  const rows = ['2026-03-03,-800.00,Zxqv Trading,work', '2026-03-05,-3.50,Cafe,Coffee', '2026-03-05,-3.50,Cafe,Coffee'];
  const first = run(rows);
  const target = first.pack.entries.find(e => e.amount_cents === -80000)!;
  const dup = first.pack.exceptions.find(e => e.code === 'POSSIBLE_DUPLICATE')!;
  const second = prepareStatementReview({ ...base, csv_text: ['date,amount,counterparty,description', ...rows].join('\n') }, 1, {
    overrides: { [target.transaction_id]: { category_code: 'PROFESSIONAL_FEES', vat_treatment: 'NEEDS_INVOICE_REVIEW' } },
    dismissed_duplicates: [dup.transaction_id!],
    document_links: { [target.transaction_id]: ['doc1'] }
  });
  assert.equal(second.pack.entries.find(e => e.transaction_id === target.transaction_id)?.category_code, 'PROFESSIONAL_FEES');
  assert.ok(!second.pack.exceptions.some(e => e.code === 'POSSIBLE_DUPLICATE'));
  assert.ok(!second.pack.exceptions.some(e => e.code === 'UNCATEGORISED' && e.transaction_id === target.transaction_id));
});
