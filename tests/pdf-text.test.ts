import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStatementFromPdf, groupIntoRows } from '../lib/pdf-text.ts';
import { parseBankStatementCsv } from '../lib/statement-intake.ts';
import { makeTextPdf, statementPdf } from './fixtures/make-pdf.ts';

const X = [50, 120, 330, 410, 490];
const status = (code: number) => (e: Error & { status?: number }) => e.status === code;

test('a headed debit/credit/balance table becomes a CSV the normal intake reads', async () => {
  const pdf = statementPdf([
    ['03.03.2026', 'Vercel Inc hosting', '20,00', '', '1 180,00'],
    ['10.03.2026', 'Client OU invoice 12', '', '500,00', '1 680,00'],
    ['', 'second line of the description', '', '', '']
  ], X, 760, 14, ['Date', 'Description', 'Debit', 'Credit', 'Balance']);
  const result = await extractStatementFromPdf(pdf);
  assert.equal(result.layout, 'HEADED_TABLE');
  assert.equal(result.rows_read, 2);
  const intake = parseBankStatementCsv(result.csv_text, { currency: 'EUR', date_order: 'DMY' });
  assert.equal(intake.transactions.length, 2, JSON.stringify(intake.rejected));
  assert.deepEqual(intake.transactions.map(t => t.amount_cents), [-2000, 50000]);
  assert.deepEqual(intake.transactions.map(t => t.date), ['2026-03-03', '2026-03-10']);
  assert.match(intake.transactions[1].description, /Client OU invoice 12 second line/);
  assert.ok(result.warnings.some(w => /less reliable than a CSV/.test(w)));
});

test('a single amount column keeps its sign', async () => {
  const pdf = statementPdf([
    ['2026-03-03', 'Coffee', '-4.50', '995.50'],
    ['2026-03-04', 'Refund', '12.00', '1007.50']
  ], [50, 120, 380, 470], 760, 14, ['Date', 'Details', 'Amount', 'Balance']);
  const result = await extractStatementFromPdf(pdf);
  const intake = parseBankStatementCsv(result.csv_text, { currency: 'EUR', date_order: 'DMY' });
  assert.deepEqual(intake.transactions.map(t => t.amount_cents), [-450, 1200]);
});

test('opening and closing balance lines are offered as hints, not applied', async () => {
  const pdf = statementPdf([
    ['', 'Opening balance', '', '', '1 200,00'],
    ['03.03.2026', 'Vercel Inc', '20,00', '', '1 180,00'],
    ['', 'Closing balance', '', '', '1 180,00']
  ], X, 760, 14, ['Date', 'Description', 'Debit', 'Credit', 'Balance']);
  const result = await extractStatementFromPdf(pdf);
  assert.equal(result.hints.opening_balance, '1 200,00');
  assert.equal(result.hints.closing_balance, '1 180,00');
  assert.equal(result.rows_read, 1);
});

test('without headings it guesses, says so, and drops lines it cannot read', async () => {
  const pdf = statementPdf([
    ['03.03.2026', 'Vercel Inc', '-20,00'],
    ['04.03.2026', 'Odd line with no amount', ''],
    ['05.03.2026', 'Client OU', '500,00', '1 480,00']
  ], [50, 120, 400, 480]);
  const result = await extractStatementFromPdf(pdf);
  assert.equal(result.layout, 'UNHEADED_GUESS');
  assert.equal(result.rows_read, 2);
  assert.ok(result.warnings.some(w => /No column headings/.test(w)));
  assert.ok(result.warnings.some(w => /left out/.test(w)));
});

test('a PDF with no text layer is refused with the reason', async () => {
  await assert.rejects(() => extractStatementFromPdf(makeTextPdf([[]])), (e: Error & { status?: number }) => e.status === 422 && /no text layer/.test(e.message));
});

test('a PDF with text but no transactions is refused', async () => {
  await assert.rejects(() => extractStatementFromPdf(makeTextPdf([[{ x: 50, y: 700, text: 'Terms and conditions apply.' }]])), status(422));
});

test('not a PDF, a damaged PDF and a page-limit breach are refused cleanly', async () => {
  await assert.rejects(() => extractStatementFromPdf(Buffer.from('hello')), status(415));
  await assert.rejects(() => extractStatementFromPdf(Buffer.from('%PDF-1.4\nthis is not a pdf at all')), status(422));
  const many = makeTextPdf(Array.from({ length: 101 }, () => [{ x: 50, y: 700, text: 'x' }]));
  await assert.rejects(() => extractStatementFromPdf(many), status(413));
});

test('fragments on one baseline join into cells; far-apart ones stay separate', () => {
  const rows = groupIntoRows([
    { str: 'Vercel', transform: [1, 0, 0, 1, 120, 700], width: 30, height: 9 },
    { str: 'Inc', transform: [1, 0, 0, 1, 154, 700], width: 14, height: 9 },
    { str: '20,00', transform: [1, 0, 0, 1, 330, 700], width: 25, height: 9 }
  ], 1);
  assert.deepEqual(rows[0].cells.map(c => c.text), ['Vercel Inc', '20,00']);
});
