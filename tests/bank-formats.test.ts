import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBankStatementCsv } from '../lib/statement-intake.ts';
import { decodeStatementBytes } from '../lib/statement-decode.ts';
import { scoreLabelledCsv } from '../lib/rule-accuracy.ts';

// The files in tests/fixtures/banks are SYNTHETIC: invented rows laid out in the column headers each
// bank or service documents or is reported to use. They prove the parser handles that layout. They
// do NOT prove a real export from that bank parses; docs/bank-formats.md records how well each layout is sourced.
const read = (name: string) => fs.readFileSync(new URL(`./fixtures/banks/${name}`, import.meta.url));
const sum = (txs: { amount_cents: number }[]) => txs.reduce((s, t) => s + t.amount_cents, 0);

test('LHV (headers from LHV\'s own format page): signed amounts, D/C flag, counterparty and archival id', () => {
  const r = parseBankStatementCsv(read('lhv-en.csv').toString('utf8'));
  assert.equal(r.rejected.length, 0);
  assert.equal(r.transactions.length, 3);
  assert.deepEqual(r.transactions.map(t => t.amount_cents), [-12400, -250, 50000]);
  assert.equal(r.transactions[0].counterparty, 'Telia Eesti AS');
  assert.equal(r.transactions[0].description, 'Mobile plan March');
  assert.equal(r.transactions[0].reference, '2026030200001'); // no reference number given: archival id used
  assert.equal(r.transactions[2].reference, '12');
  assert.equal(r.detected.columns.indicator, 'Debit/Credit (D/C)');
});

test('Estonian-style semicolon export: preamble skipped, balance and turnover lines rejected, thousands spaces and decimal commas read', () => {
  const r = parseBankStatementCsv(read('swedbank-style-et.csv').toString('utf8'));
  assert.equal(r.detected.header_line, 3);
  assert.match(r.warnings.join(' '), /2 line\(s\) above/);
  assert.deepEqual(r.transactions.map(t => [t.date, t.amount_cents]), [['2026-03-03', -2000], ['2026-03-05', 120050]]);
  assert.equal(r.transactions[0].source_row, 5); // line number in the uploaded file, not in the trimmed text
  assert.equal(r.transactions[1].counterparty, 'Klient OÜ');
  const reasons = r.rejected.map(x => x.reason);
  assert.equal(reasons.filter(x => /row type/.test(x)).length, 3);
  assert.equal(r.rejected.length, 3);
});

test('Wise (headers per an open-source importer): day-month-year dates, payee for money out, payer for money in', () => {
  const r = parseBankStatementCsv(read('wise.csv').toString('utf8'));
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.transactions.map(t => [t.date, t.amount_cents, t.counterparty]), [
    ['2026-03-03', -1299, 'Notion Labs'],
    ['2026-03-05', -25000, 'Freelancer Ltd'],
    ['2026-03-09', 150000, 'Customer GmbH']
  ]);
  assert.equal(r.transactions[1].reference, 'Invoice 7');
  assert.ok(!r.warnings.some(w => /fee column/.test(w)), 'Total fees is informational on Wise and is not booked again');
});

test('Revolut-style (headers UNVERIFIED): completed date wins, pending and reverted rows are rejected with a reason, fee becomes its own row', () => {
  const r = parseBankStatementCsv(read('revolut-unverified.csv').toString('utf8'));
  assert.deepEqual(r.transactions.map(t => [t.date, t.amount_cents, t.description]), [
    ['2026-03-03', -4000, 'Google Ads'],
    ['2026-03-06', -30000, 'Payment to Supplier SIA'],
    ['2026-03-06', -150, 'Bank fee: Payment to Supplier SIA'],
    ['2026-03-08', 20000, 'Top-Up by *1234']
  ]);
  assert.deepEqual(r.rejected.map(x => x.reason), ['status pending: no money moved', 'status reverted: no money moved']);
  assert.match(r.warnings.join(' '), /fee column/);
  assert.equal(new Set(r.transactions.map(t => t.transaction_id)).size, 4);
});

test('Stripe balance report (columns from Stripe docs): fees split out so the bank payout reconciles', () => {
  const r = parseBankStatementCsv(read('stripe-balance.csv').toString('utf8'));
  assert.equal(r.rejected.length, 0);
  assert.equal(r.transactions[0].currency, 'EUR');
  const fees = r.transactions.filter(t => /^Bank fee:/.test(t.description));
  assert.deepEqual(fees.map(t => t.amount_cents), [-320, -175]);
  // Gross plus fee rows equals the sum of the report's net column: 96.80 + 48.25 - 20.00 - 125.05 = 0.
  assert.equal(sum(r.transactions), 0);
});

test('re-uploading the same file adds nothing; ids are the same across parses', () => {
  const text = read('revolut-unverified.csv').toString('utf8');
  const first = parseBankStatementCsv(text);
  const again = parseBankStatementCsv(text, { known_transaction_ids: new Set(first.transactions.map(t => t.transaction_id)) });
  assert.equal(again.transactions.length, 0);
  assert.equal(again.skipped_already_imported, 4);
});

test('file encodings: UTF-8, UTF-8 with BOM, UTF-16 and Windows-1257 all read to the same text', () => {
  const plain = 'Date;Summa;Selgitus\r\n03.03.2026;-5,00;Café Lõuna\r\n';
  assert.equal(decodeStatementBytes(Buffer.from(plain, 'utf8')).text, plain);
  assert.equal(decodeStatementBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(plain, 'utf8')])).text.replace(/^﻿/, ''), plain);
  assert.equal(decodeStatementBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(plain, 'utf16le')])).text, plain);
  const old = decodeStatementBytes(read('windows-1257.csv'));
  assert.match(old.encoding, /WINDOWS-1257/);
  assert.match(old.text, /Café Lõuna|Caf. L.una/);
  const tx = parseBankStatementCsv(old.text).transactions[0];
  assert.equal(tx.amount_cents, -500);
  assert.ok(tx.description.includes('Lõuna'), `got ${tx.description}`);
});

test('the accuracy harness still finds the label column when the file has lines above the header', () => {
  const csv = ['Account statement,EE00', '', 'date,amount,counterparty,description,expected_category', '2026-03-03,-20.00,Vercel Inc,Hosting,CLOUD'].join('\n');
  const r = scoreLabelledCsv(csv, 'EE');
  assert.equal(r.rows, 1);
  assert.equal(r.correct, 1);
});

test('unreadable-looking inputs still fail loudly rather than importing garbage', () => {
  const r = parseBankStatementCsv('Some title\nnothing useful here\n1,2,3');
  assert.equal(r.transactions.length, 0);
  assert.ok(r.warnings.length > 0);
});
