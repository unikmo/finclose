import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStatementReview } from '../lib/statement-prep.ts';
import { renderEntriesCsv } from '../lib/review-pack.ts';

const CSV = 'date,amount,counterparty,description\n2026-03-02,-12.00,Google Ireland,GSUITE\n2026-03-03,-800.00,Zxqv Trading,work';
const base = { company_name: 'Test OÜ', jurisdiction: 'EE', vat_registered: true, period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };

function status(fn: () => unknown): number | undefined {
  try { fn(); } catch (error) { return (error as { status?: number }).status; }
  return undefined;
}

test('a valid request returns a pack, markdown, csv and intake report', () => {
  const result = prepareStatementReview(base, 1);
  assert.equal(result.pack.status, 'PREPARED_NOT_APPROVED');
  assert.equal(result.intake.imported, 2);
  assert.ok(result.markdown.includes('# Review pack: Test OÜ'));
  assert.ok(result.entries_csv.startsWith('date,amount'));
});

test('bad requests fail with a 4xx status and a clear reason', () => {
  assert.equal(status(() => prepareStatementReview({ ...base, company_name: '' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, jurisdiction: 'XX' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, period_start: '2026-02-30' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, period_start: '2026-04-01' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, csv_text: '' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, currency: 'EURO' })), 400);
  assert.equal(status(() => prepareStatementReview({ ...base, csv_text: 'x'.repeat(2_000_001) })), 413);
  assert.equal(status(() => prepareStatementReview({ ...base, csv_text: 'foo,bar\n1,2' })), 422);
});

test('exported CSV neutralises spreadsheet formulas in bank-supplied text', () => {
  const evil = 'date,amount,counterparty,description\n2026-03-02,-12.00,"=HYPERLINK(""http://x"")",+cmd|calc';
  const result = prepareStatementReview({ ...base, csv_text: evil });
  const csv = renderEntriesCsv(result.pack);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
  assert.ok(csv.includes("'+cmd|calc"));
  assert.ok(!/(^|,)=HYPERLINK/.test(csv));
});
