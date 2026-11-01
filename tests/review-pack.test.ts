import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankStatementCsv } from '../lib/statement-intake.ts';
import { buildRulePack, categoriseAll } from '../lib/categorisation-engine.ts';
import { buildReviewPack, formatCents, renderEntriesCsv, renderReviewPackMarkdown } from '../lib/review-pack.ts';

const CSV = [
  'date,amount,counterparty,description',
  '2026-03-02,-12.00,Google Ireland,GSUITE',
  '2026-03-03,-800.00,Zxqv Trading,consulting work',
  '2026-03-04,2500.00,Acme OÜ,Invoice 2026-001',
  '2026-03-05,-5.00,LHV,Monthly fee',
  '2026-03-05,-3.50,Coffee House Cafe,Coffee',
  '2026-03-05,-3.50,Coffee House Cafe,Coffee',
  '2026-04-02,-20.00,Slack,subscription'
].join('\n');

function prepare(documentLinks: Record<string, string[]> = {}, vat = true) {
  const intake = parseBankStatementCsv(CSV);
  const pack = buildRulePack('EE');
  const suggestions = categoriseAll(intake.transactions, pack, [], { vat_registered: vat });
  const review = buildReviewPack({
    company: { name: 'Test OÜ', jurisdiction: 'EE', vat_registered: vat },
    period: { start: '2026-03-01', end: '2026-03-31' },
    transactions: intake.transactions,
    suggestions,
    document_links: documentLinks,
    generated_at: 1
  });
  return { intake, review };
}

test('the pack is never approved or posted', () => {
  const { review } = prepare();
  assert.equal(review.status, 'PREPARED_NOT_APPROVED');
  assert.equal(review.posting, 'NO_EXTERNAL_POSTING');
});

test('out-of-period rows are excluded from totals and reported', () => {
  const { review } = prepare();
  assert.equal(review.summary.transaction_count, 6);
  assert.ok(review.exceptions.some(e => e.code === 'OUTSIDE_PERIOD'));
  assert.equal(review.summary.inflow_cents, 250000);
  assert.equal(review.summary.outflow_cents, 1200 + 80000 + 500 + 350 + 350);
});

test('expected exceptions are raised with evidence and severity', () => {
  const { review } = prepare();
  const codes = review.exceptions.map(e => e.code);
  assert.ok(codes.includes('UNCATEGORISED') === false, 'consulting matches the professional-fees rule');
  assert.ok(codes.includes('POSSIBLE_DUPLICATE'));
  const missing = review.exceptions.filter(e => e.code === 'MISSING_DOCUMENT');
  const high = missing.find(e => e.evidence?.amount_cents === -80000);
  assert.equal(high?.severity, 'HIGH'); // 800.00 is above the 500.00 threshold
  const low = missing.find(e => e.evidence?.amount_cents === -1200);
  assert.equal(low?.severity, 'LOW');
  assert.equal(review.exceptions[0].severity, 'HIGH'); // sorted most serious first
});

test('uploading documents removes the missing-document exceptions and raises readiness', () => {
  const before = prepare();
  const links: Record<string, string[]> = {};
  for (const tx of before.intake.transactions) links[tx.transaction_id] = [`doc_${tx.transaction_id}`];
  const after = prepare(links);
  assert.equal(after.review.exceptions.filter(e => e.code === 'MISSING_DOCUMENT').length, 0);
  assert.ok(after.review.summary.readiness_percent > before.review.summary.readiness_percent);
});

test('owner questions are generated for missing documents and duplicates', () => {
  const { review } = prepare();
  assert.ok(review.owner_questions.some(q => q.question.includes('upload the invoice or receipt for 800.00 EUR')));
  // an unknown merchant asks one combined question, not two
  const unknown = parseBankStatementCsv('date,amount,counterparty,description\n2026-03-03,-42.00,Zxqv Trading,work');
  const unknownPack = buildReviewPack({
    company: { name: 'A', jurisdiction: 'EE', vat_registered: false },
    period: { start: '2026-03-01', end: '2026-03-31' },
    transactions: unknown.transactions,
    suggestions: categoriseAll(unknown.transactions, buildRulePack('EE'))
  });
  assert.equal(unknownPack.owner_questions.length, 1);
  assert.ok(unknownPack.owner_questions[0].question.startsWith('What was the 42.00 EUR payment to'));
  assert.ok(review.owner_questions.some(q => q.question.includes('Were both real?')));
});

test('a company without VAT registration gets no VAT queries', () => {
  const { review } = prepare({}, false);
  assert.equal(review.exceptions.filter(e => e.code === 'VAT_REVIEW').length, 0);
});

test('readiness: all-clean pack is accountant-ready, one HIGH exception blocks it', () => {
  const intake = parseBankStatementCsv('date,amount,counterparty,description\n2026-03-05,-5.00,LHV,Monthly fee');
  const suggestions = categoriseAll(intake.transactions, buildRulePack('EE'));
  const clean = buildReviewPack({ company: { name: 'A', jurisdiction: 'EE', vat_registered: false }, period: { start: '2026-03-01', end: '2026-03-31' }, transactions: intake.transactions, suggestions });
  assert.equal(clean.summary.readiness_percent, 100);
  assert.equal(clean.summary.accountant_ready, true);

  const dirty = buildReviewPack({ company: { name: 'A', jurisdiction: 'EE', vat_registered: false }, period: { start: '2026-03-01', end: '2026-03-31' }, transactions: intake.transactions, suggestions, unreconciled_transaction_ids: [intake.transactions[0].transaction_id] });
  assert.equal(dirty.summary.accountant_ready, false);
  assert.ok(dirty.summary.readiness_percent < 100);
});

test('the pack hash is stable for the same input and changes when content changes', () => {
  const a = prepare().review;
  const b = prepare().review;
  assert.equal(a.pack_hash, b.pack_hash);
  const links = { [a.entries[0].transaction_id]: ['doc_1'] };
  assert.notEqual(prepare(links).review.pack_hash, a.pack_hash);
});

test('markdown and CSV exports contain the key content and escape correctly', () => {
  const { review } = prepare();
  const md = renderReviewPackMarkdown(review);
  assert.ok(md.includes('# Review pack: Test OÜ'));
  assert.ok(md.includes('PREPARED_NOT_APPROVED'));
  assert.ok(md.includes('## Questions the owner still has to answer'));
  const csv = renderEntriesCsv(review);
  assert.equal(csv.trim().split('\n').length, review.entries.length + 1);
  assert.ok(csv.startsWith('date,amount,currency'));
});

test('formatCents', () => {
  assert.equal(formatCents(123456, 'EUR'), '1,234.56 EUR');
  assert.equal(formatCents(-5), '-0.05');
  assert.equal(formatCents(0), '0.00');
});
