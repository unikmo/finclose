import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPackStore } from '../lib/pack-store.ts';
import { InMemoryDocumentStore } from '../lib/document-store.ts';
import { createPack } from '../lib/pack-lifecycle.ts';
import { buildAccountMap, buildJournal } from '../lib/chart-of-accounts.ts';
import { accountMapCsv, applyOverrides, parseAccountMapCsv, validateOverrides } from '../lib/account-map-custom.ts';
import { eraseCompanyData, exportCompanyData } from '../lib/data-rights.ts';
import { renderAccuracyReport, scoreLabelledCsv } from '../lib/rule-accuracy.ts';

const request = {
  company_name: 'Test OU', jurisdiction: 'EE', vat_registered: false, period_start: '2026-03-01', period_end: '2026-03-31',
  csv_text: ['date,amount,counterparty,description', '2026-03-03,-20.00,Vercel Inc,Hosting', '2026-03-10,500.00,Client OU,Invoice 12'].join('\n')
};
const actor = { user_id: 'admin1' };

test('overrides are validated: unknown slot, bad code, bad name, and one code for two accounts', () => {
  assert.throws(() => validateOverrides({ NOPE: { code: '1', name: 'x' } }, 'EE'), /unknown category/);
  assert.throws(() => validateOverrides({ SOFTWARE: { code: '61 00', name: 'x' } }, 'EE'), /account code/);
  assert.throws(() => validateOverrides({ SOFTWARE: { code: '6100', name: '' } }, 'EE'), /account name/);
  assert.throws(() => validateOverrides({ SOFTWARE: { code: '6100', name: 'a\u0000b' } }, 'EE'), /account name/);
  assert.throws(() => validateOverrides([], 'EE'), /object/);
  // 6110 already belongs to Hosting and cloud; giving it to Software under another name must be refused.
  assert.throws(() => validateOverrides({ SOFTWARE: { code: '6110', name: 'Software' } }, 'EE'), /two different accounts/);
  // The same code with the same name for two categories is a deliberate merge and is allowed.
  assert.doesNotThrow(() => validateOverrides({ SOFTWARE: { code: '6110', name: 'Hosting and cloud services' } }, 'EE'));
  const ok = validateOverrides({ SOFTWARE: { code: '6150', name: '  Software   licences ' } }, 'EE');
  assert.deepEqual(ok, { SOFTWARE: { code: '6150', name: 'Software licences' } });
});

test('overrides change only code and name; the journal still balances and says it is customised', async () => {
  const created = await createPack(new InMemoryPackStore(), { company_id: 'c1', organization_id: 'o', actor, request });
  const base = buildAccountMap('EE');
  const map = applyOverrides('EE', { CLOUD: { code: '5200', name: 'Server costs' }, bank: { code: '2710', name: 'LHV main account' } });
  assert.equal(map.id, 'accounts-ee-default-v0+company');
  assert.equal(map.status, 'COMPANY_CUSTOMISED_NOT_STATUTORY');
  assert.equal(map.by_category.CLOUD.type, base.by_category.CLOUD.type);
  const view = buildJournal(created.result.pack, map);
  assert.ok(view.balanced);
  assert.ok(view.lines.some(l => l.account_code === '5200' && l.account_name === 'Server costs'));
  assert.ok(view.lines.some(l => l.account_code === '2710'));
  assert.ok(!view.lines.some(l => l.account_code === '1000'));
  assert.match(view.notice, /company's own account numbers/);
  assert.ok(applyOverrides('EE', null) !== null && applyOverrides('EE', {}).id === base.id);
  // Stored overrides are re-validated when applied, so a bad stored value cannot reach a journal.
  assert.throws(() => applyOverrides('EE', { SOFTWARE: { code: '6110', name: 'Software' } }));
});

test('the account map exports to CSV, round-trips, and only real changes come back as overrides', () => {
  const csv = accountMapCsv(buildAccountMap('EE'));
  assert.match(csv, /^"slot","account_code","account_name","account_type"/);
  assert.deepEqual(parseAccountMapCsv(csv, 'EE'), {});
  const edited = csv.replace('"6110","Hosting and cloud services"', '"5200","Server costs"');
  assert.deepEqual(parseAccountMapCsv(edited, 'EE'), { CLOUD: { code: '5200', name: 'Server costs' } });
  assert.throws(() => parseAccountMapCsv('slot,code\nbank,1', 'EE'), /columns/);
  assert.throws(() => parseAccountMapCsv('slot,account_code,account_name\nWAT,1,x', 'EE'), /unknown slot/);
  assert.throws(() => parseAccountMapCsv('', 'EE'), /empty/);
  // A name that begins with a formula character is exported with the guard apostrophe and read back without it.
  const guarded = accountMapCsv(applyOverrides('EE', { CLOUD: { code: '5200', name: '=Server' } }));
  assert.match(guarded, /"'=Server"/);
  assert.equal(parseAccountMapCsv(guarded, 'EE').CLOUD.name, '=Server');
});

test('account overrides are stored per company, exported, and erased with the company', async () => {
  const packs = new InMemoryPackStore();
  const docs = new InMemoryDocumentStore();
  assert.equal(await packs.accountOverrides('c1'), null);
  await packs.setAccountOverrides('c1', { CLOUD: { code: '5200', name: 'Server costs' } });
  await packs.setAccountOverrides('c2', { CLOUD: { code: '5300', name: 'Other' } });
  assert.deepEqual((await exportCompanyData(packs, docs, 'c1')).account_overrides, { CLOUD: { code: '5200', name: 'Server costs' } });
  const receipt = await eraseCompanyData(packs, docs, 'c1', 'c1');
  assert.equal(receipt.account_map, true);
  assert.equal(await packs.accountOverrides('c1'), null);
  assert.ok(await packs.accountOverrides('c2'));
  await packs.setAccountOverrides('c2', {});
  assert.equal(await packs.accountOverrides('c2'), null);
});

// SYNTHETIC: the labels below were written by the author of the rules, so this measures
// regressions and the harness itself, not how accurate the rules are on real statements.
const LABELLED = [
  'date,amount,counterparty,description,expected_category',
  '2026-03-03,-20.00,Vercel Inc,Hosting,CLOUD',
  '2026-03-04,-2.50,LHV,Monthly fee,BANK_FEES',
  '2026-03-05,-124.00,Telia Eesti,Mobile plan,TELECOM',
  '2026-03-06,-12.00,Spotify AB,Premium,SOFTWARE',
  '2026-03-07,-12.00,Spotify AB,Premium,SOFTWARE',
  '2026-03-08,-30.00,Mystery Shop,Card payment,OFFICE_SUPPLIES',
  '2026-03-09,500.00,Client OU,Invoice 12,REVENUE',
  '2026-03-10,-8.00,Corner Cafe,Lunch,TRAVEL',
  '2026-03-11,-9.99,Somewhere,No label,'
].join('\n');

test('accuracy harness scores a labelled statement and points at the merchants to write rules for', () => {
  const r = scoreLabelledCsv(LABELLED, 'EE');
  assert.equal(r.rows, 8);
  assert.equal(r.unlabelled_rows, 1);
  // Right: Vercel, LHV fee, Telia, Client invoice. Wrong: Spotify x2 and Mystery Shop (suspense), Cafe (meals, not travel).
  assert.equal(r.correct, 4);
  assert.equal(r.accuracy, 0.5);
  assert.equal(r.suspense, 3);
  assert.equal(r.suspense_rate, 0.375);
  const spotify = r.unmatched_merchants.find(u => u.merchant_key === 'spotify ab');
  assert.deepEqual(spotify, { merchant_key: 'spotify ab', count: 2, expected: ['SOFTWARE'] });
  assert.equal(r.misses.find(m => m.counterparty === 'Corner Cafe')?.got, 'MEALS');
  // Auto-accept looks only at confident rows; the 0.6 meals guess is excluded, the 0.72 invoice rule is not.
  assert.ok(r.auto_accept_precision !== null && r.auto_accept_precision <= 1);
  assert.match(renderAccuracyReport(r), /Auto-accept precision/);
});

test('accuracy harness refuses a file with no label column and warns about unknown labels', () => {
  assert.throws(() => scoreLabelledCsv('date,amount,counterparty\n2026-03-03,-1,x', 'EE'), /expected_category/);
  const r = scoreLabelledCsv('date,amount,counterparty,description,expected_category\n2026-03-03,-20.00,Vercel Inc,Hosting,NOT_A_CATEGORY', 'EE');
  assert.equal(r.correct, 0);
  assert.match(r.warnings.join(' '), /NOT_A_CATEGORY/);
});

test('sending the whole table stores only the rows that differ from the default', () => {
  const base = buildAccountMap('EE');
  const whole = Object.fromEntries(Object.entries(base.by_category).map(([k, a]) => [k, { code: a.code, name: a.name }]));
  whole.CLOUD = { code: '5200', name: 'Server costs' };
  assert.deepEqual(validateOverrides(whole, 'EE'), { CLOUD: { code: '5200', name: 'Server costs' } });
  assert.deepEqual(validateOverrides({ bank: { code: '1000', name: 'Bank' } }, 'EE'), {});
});
