import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountToCents, parseBankStatementCsv, parseStatementDate } from '../lib/statement-intake.ts';

test('amounts: EU and US formats become signed cents', () => {
  assert.equal(parseAmountToCents('1.234,56'), 123456);
  assert.equal(parseAmountToCents('1,234.56'), 123456);
  assert.equal(parseAmountToCents('-12,5'), -1250);
  assert.equal(parseAmountToCents('(12.50)'), -1250);
  assert.equal(parseAmountToCents('12.50-'), -1250);
  assert.equal(parseAmountToCents('€ 1 000,00'), 100000);
  assert.equal(parseAmountToCents('1,234'), 123400);
  assert.equal(parseAmountToCents('0,123'), 12);
  assert.equal(parseAmountToCents('1.005'), 100500);
  assert.equal(parseAmountToCents('2.675'), 267500);
  assert.equal(parseAmountToCents('10.005'), 1000500); // one separator + 3 digits is read as thousands
  assert.equal(parseAmountToCents('1.234,565'), 123457); // extra decimals round half-up
  assert.equal(parseAmountToCents('abc'), null);
  assert.equal(parseAmountToCents(''), null);
});

test('dates: ISO always works, numeric follows the chosen order and flags ambiguity', () => {
  assert.deepEqual(parseStatementDate('2026-03-05', 'DMY'), { iso: '2026-03-05', ambiguous: false });
  assert.deepEqual(parseStatementDate('05.03.2026', 'DMY'), { iso: '2026-03-05', ambiguous: true });
  assert.deepEqual(parseStatementDate('05/03/2026', 'MDY'), { iso: '2026-05-03', ambiguous: false });
  assert.deepEqual(parseStatementDate('25/03/2026', 'auto'), { iso: '2026-03-25', ambiguous: false });
  assert.deepEqual(parseStatementDate('03/25/2026', 'auto'), { iso: '2026-03-25', ambiguous: false });
  assert.equal(parseStatementDate('31.02.2026', 'DMY').iso, null);
  assert.equal(parseStatementDate('nonsense', 'DMY').iso, null);
});

test('semicolon file with split debit/credit columns and Estonian headers', () => {
  const csv = [
    'Kuupäev;Saaja/Maksja;Selgitus;Deebet;Kreedit;Valuuta',
    '03.03.2026;Google Ireland;GSUITE;12,00;;EUR',
    '04.03.2026;Acme OÜ;Invoice 2026-001;;1.500,00;EUR'
  ].join('\n');
  const result = parseBankStatementCsv(csv);
  assert.equal(result.detected.delimiter, ';');
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].amount_cents, -1200);
  assert.equal(result.transactions[0].counterparty, 'Google Ireland');
  assert.equal(result.transactions[1].amount_cents, 150000);
  assert.equal(result.rejected.length, 0);
});

test('D/K indicator makes a positive amount an outflow', () => {
  const csv = 'Date,Amount,D/K,Description\n2026-03-01,50.00,D,Rent\n2026-03-02,80.00,K,Client payment';
  // "D/K" normalises to "dk"
  const result = parseBankStatementCsv(csv);
  assert.deepEqual(result.transactions.map(tx => tx.amount_cents), [-5000, 8000]);
});

test('quoted fields, BOM and CRLF are handled', () => {
  const csv = '﻿date,amount,description\r\n2026-03-01,-9.99,"Slack, Inc. ""team"" plan"\r\n';
  const result = parseBankStatementCsv(csv);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].description, 'Slack, Inc. "team" plan');
});

test('bad rows are rejected with a reason, not dropped silently', () => {
  const csv = 'date,amount,description\n2026-03-01,-5.00,ok\nnot-a-date,-5.00,bad date\n2026-03-02,xyz,bad amount\n2026-03-03,0,zero';
  const result = parseBankStatementCsv(csv);
  assert.equal(result.transactions.length, 1);
  assert.deepEqual(result.rejected.map(r => r.reason), ['unreadable date', 'unreadable amount', 'zero amount']);
});

test('identical payments on one day are kept, with distinct ids and a duplicate flag', () => {
  const csv = 'date,amount,description\n2026-03-01,-3.50,Coffee\n2026-03-01,-3.50,Coffee';
  const result = parseBankStatementCsv(csv);
  assert.equal(result.transactions.length, 2);
  assert.notEqual(result.transactions[0].transaction_id, result.transactions[1].transaction_id);
  assert.equal(result.transactions[0].possible_duplicate_of, null);
  assert.equal(result.transactions[1].possible_duplicate_of, result.transactions[0].transaction_id);
});

test('re-uploading the same file adds nothing when known ids are supplied', () => {
  const csv = 'date,amount,description\n2026-03-01,-3.50,Coffee\n2026-03-02,-8.00,Lunch';
  const first = parseBankStatementCsv(csv);
  const known = new Set(first.transactions.map(tx => tx.transaction_id));
  const second = parseBankStatementCsv(csv, { known_transaction_ids: known });
  assert.equal(second.transactions.length, 0);
  assert.equal(second.skipped_already_imported, 2);
});

test('ambiguous numeric dates and mixed currencies produce warnings', () => {
  const csv = 'date,amount,currency,description\n04.05.2026,-1.00,EUR,a\n2026-05-06,-2.00,USD,b';
  const result = parseBankStatementCsv(csv);
  assert.ok(result.warnings.some(w => w.includes('day-first or month-first')));
  assert.ok(result.warnings.some(w => w.includes('mixes currencies')));
});

test('a file without a date or amount column fails loudly', () => {
  assert.ok(parseBankStatementCsv('foo,bar\n1,2').warnings[0].includes('no date column'));
  assert.ok(parseBankStatementCsv('date,foo\n2026-01-01,2').warnings[0].includes('no amount column'));
});
