import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPackStore } from '../lib/pack-store.ts';
import { InMemoryDocumentStore } from '../lib/document-store.ts';
import { assertLinkable, reviewDocument, uploadDocument } from '../lib/document-intake.ts';
import { createPack, getPack, recordCorrection, recordOwnerAnswer, signOffPack } from '../lib/pack-lifecycle.ts';
import { buildAccountMap, buildJournal, journalCsv } from '../lib/chart-of-accounts.ts';
import { buildRulePack } from '../lib/categorisation-engine.ts';
import { summariseVat } from '../lib/vat-summary.ts';
import { packPortfolioStatus } from '../lib/pack-portfolio.ts';
import { ledgerOnlyLines, unreconciledIds } from '../lib/reconciliation.ts';
import { eraseCompanyData, exportCompanyData, purgeExpired } from '../lib/data-rights.ts';

const CSV = [
  'date,amount,counterparty,description',
  '2026-03-02,-124.00,Telia Eesti,Mobile plan',
  '2026-03-03,-20.00,Vercel Inc,Hosting',
  '2026-03-04,-2.50,LHV,Monthly fee',
  '2026-03-10,500.00,Client OU,Invoice 12'
].join('\n');
const request = { company_name: 'Test OU', jurisdiction: 'EE', vat_registered: true, period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };
const actor = { user_id: 'acc1' };
const PDF = Buffer.from('%PDF-1.4 fake invoice');
const received = { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const };
const quarantined = { status: 'QUARANTINED' as const, security_review_status: 'AWAITING_MANUAL_REVIEW' as const };

async function setup(req: Record<string, unknown> = request) {
  const store = new InMemoryPackStore();
  const created = await createPack(store, { company_id: 'c1', organization_id: 'o1', actor, request: req });
  return { store, created };
}

test('every category in both rule packs has an account, and the journal balances', async () => {
  for (const j of ['EE', 'GENERIC']) {
    const map = buildAccountMap(j);
    for (const c of buildRulePack(j).categories) assert.ok(map.by_category[c.code], `${j} ${c.code} unmapped`);
  }
  const { created } = await setup();
  const view = buildJournal(created.result.pack);
  assert.equal(view.status, 'PROPOSED_NOT_POSTED');
  assert.ok(view.balanced && view.lines.length > 0);
  assert.match(journalCsv(view), /^"date","transaction_id"/);
});

test('input VAT is split out only when a clean document is linked', async () => {
  const { store, created } = await setup();
  const telia = created.result.pack.entries.find(e => e.counterparty.includes('Telia'))!;
  assert.equal(telia.vat_rate, 24);
  assert.ok(!buildJournal(created.result.pack).lines.some(l => l.account_code === '1300'));
  const docs = new InMemoryDocumentStore();
  const up = await uploadDocument(docs, { company_id: 'c1', organization_id: 'o1', actor, filename: 'telia.pdf', bytes: PDF }, received);
  const answered = await recordOwnerAnswer(store, created.record.pack_id, 'c1', actor, { transaction_id: telia.transaction_id, document_ids: [up.record.document_id] }, docs);
  const vat = summariseVat(answered.result.pack);
  assert.equal(vat.domestic_input_by_rate[0].rate, 24);
  assert.equal(vat.domestic_input_by_rate[0].vat_cents, 2400); // 124.00 gross at 24% = 24.00 VAT
  assert.equal(vat.domestic_input_by_rate[0].net_cents, 10000);
  const withVat = buildJournal(answered.result.pack).lines.filter(l => l.account_code === '1300');
  assert.equal(withVat[0].debit_cents, 2400);
  assert.equal(vat.reverse_charge.count, 1);
  assert.equal(vat.sales_bank_receipts.count, 1);
});

test('VAT is not estimated for a company that is not registered', async () => {
  const { created } = await setup({ ...request, vat_registered: false });
  const vat = summariseVat(created.result.pack);
  assert.equal(vat.vat_registered, false);
  assert.equal(vat.domestic_input_by_rate.length, 0);
});

test('a reviewer can set a reduced rate, but only from the allowed list', async () => {
  const { store, created } = await setup();
  const telia = created.result.pack.entries.find(e => e.counterparty.includes('Telia'))!;
  const done = await recordCorrection(store, created.record.pack_id, 'c1', actor, { transaction_id: telia.transaction_id, category_code: 'TELECOM', vat_treatment: 'INPUT_VAT_DOMESTIC', vat_rate: 9 });
  assert.equal(done.result.pack.entries.find(e => e.transaction_id === telia.transaction_id)?.vat_rate, 9);
  await assert.rejects(recordCorrection(store, created.record.pack_id, 'c1', actor, { transaction_id: telia.transaction_id, category_code: 'TELECOM', vat_treatment: 'INPUT_VAT_DOMESTIC', vat_rate: 17 }), /vat_rate must be one of/);
});

test('documents: quarantined files cannot back an answer until another person clears them', async () => {
  const { store, created } = await setup();
  const docs = new InMemoryDocumentStore();
  const tx = created.result.pack.entries[0].transaction_id;
  const up = await uploadDocument(docs, { company_id: 'c1', organization_id: 'o1', actor, filename: 'a.pdf', bytes: PDF }, quarantined);
  assert.equal(up.record.status, 'QUARANTINED');
  await assert.rejects(recordOwnerAnswer(store, created.record.pack_id, 'c1', actor, { transaction_id: tx, document_ids: [up.record.document_id] }, docs), /cannot be linked yet/);
  await assert.rejects(reviewDocument(docs, up.record.document_id, 'c1', actor, 'CLEAN', '', 'MANUAL_REVIEW'), /different person/);
  await assert.rejects(reviewDocument(docs, up.record.document_id, 'c1', { user_id: 'rev' }, 'CLEAN', '', 'SCANNER'), /MANUAL_REVIEW/);
  await reviewDocument(docs, up.record.document_id, 'c1', { user_id: 'rev' }, 'CLEAN', 'looks fine', 'MANUAL_REVIEW');
  await assertLinkable(docs, 'c1', [up.record.document_id]);
  await assert.rejects(reviewDocument(docs, up.record.document_id, 'c1', { user_id: 'rev2' }, 'REJECTED', '', 'MANUAL_REVIEW'), /immutable/);
  await assert.rejects(assertLinkable(docs, 'other', [up.record.document_id]), /not found for this company/);
});

test('documents: wrong types are refused, and the same file is stored once', async () => {
  const docs = new InMemoryDocumentStore();
  const args = { company_id: 'c1', organization_id: 'o1', actor };
  await assert.rejects(uploadDocument(docs, { ...args, filename: 'x.csv', bytes: Buffer.from('a,b') }, received), /PDF, PNG or JPG/);
  await assert.rejects(uploadDocument(docs, { ...args, filename: 'x.pdf', bytes: Buffer.from('not a pdf') }, received), /does not match/);
  const one = await uploadDocument(docs, { ...args, filename: 'x.pdf', bytes: PDF }, received);
  const two = await uploadDocument(docs, { ...args, filename: 'y.pdf', bytes: PDF }, received);
  assert.equal(two.duplicate, true);
  assert.equal(two.record.document_id, one.record.document_id);
});

test('sign-off: off by default, needs the hash, refuses HIGH, locks the pack', async () => {
  const { store, created } = await setup();
  const hash = created.result.pack.pack_hash;
  await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: hash }, false), /not enabled/);
  await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: 'stale' }, true), /changed since/);
  if (!created.result.pack.summary.accountant_ready) {
    await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: hash }, true), /not accountant-ready/);
    await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: hash, accept_open_items: true, note: 'short' }, true), /at least 10/);
  }
  const signed = await signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: hash, accept_open_items: true, note: 'open items accepted by accountant' }, true);
  assert.equal(signed.record.status, 'SIGNED_OFF');
  assert.equal(signed.result.pack.posting, 'NO_EXTERNAL_POSTING');
  assert.equal(packPortfolioStatus(signed.record, signed.result.pack).status, signed.result.pack.exceptions.some(e => e.severity === 'HIGH') ? 'RED' : 'GREEN');
  await assert.rejects(recordOwnerAnswer(store, created.record.pack_id, 'c1', actor, { transaction_id: signed.result.pack.entries[0].transaction_id, note: 'x' }), /signed off/);
  await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: hash }, true), /signed off/);
  await assert.rejects(signOffPack(store, created.record.pack_id, 'c2', actor, { pack_hash: hash }, true), /not found/);
});

test('sign-off is refused while a HIGH exception is open', async () => {
  const bad = { ...request, opening_balance: '1000.00', closing_balance: '5.00' }; // does not reconcile
  const { store, created } = await setup(bad);
  assert.ok(created.result.pack.exceptions.some(e => e.severity === 'HIGH'));
  await assert.rejects(signOffPack(store, created.record.pack_id, 'c1', actor, { pack_hash: created.result.pack.pack_hash, accept_open_items: true, note: 'accepting anyway please' }, true), /HIGH exception/);
  assert.equal(packPortfolioStatus(created.record, created.result.pack).status, 'RED');
  assert.equal(packPortfolioStatus(null, null).status, 'NOT_STARTED');
});

test('reconciliation matches amounts within three days, one ledger line per bank row', async () => {
  const { created } = await setup();
  const { parseBankStatementCsv } = await import('../lib/statement-intake.ts');
  const tx = parseBankStatementCsv(CSV, { currency: 'EUR', date_order: 'DMY' }).transactions;
  const ledger = [
    { ledger_id: 'L1', date: '2026-03-02', amount_cents: -12400, currency: 'EUR' },
    { ledger_id: 'L2', date: '2026-03-05', amount_cents: -2000, currency: 'EUR' },
    { ledger_id: 'L9', date: '2026-03-20', amount_cents: -999, currency: 'EUR' }
  ];
  const missing = unreconciledIds(tx, ledger);
  assert.equal(missing.length, 2); // the bank fee and the sale have no ledger line
  assert.deepEqual(ledgerOnlyLines(tx, ledger).map(l => l.ledger_id), ['L9']);
  assert.equal(created.result.pack.entries.length, 4);
});

test('export, erase and purge cover packs, documents and learned rules for one company only', async () => {
  const { store, created } = await setup();
  const docs = new InMemoryDocumentStore();
  await uploadDocument(docs, { company_id: 'c1', organization_id: 'o1', actor, filename: 'a.pdf', bytes: PDF }, received);
  await uploadDocument(docs, { company_id: 'c2', organization_id: 'o1', actor, filename: 'a.pdf', bytes: PDF }, received);
  const other = await createPack(store, { company_id: 'c2', organization_id: 'o1', actor, request });
  const big = created.result.pack.entries.find(e => e.counterparty.includes('Vercel'))!;
  await recordCorrection(store, created.record.pack_id, 'c1', actor, { transaction_id: big.transaction_id, category_code: 'SOFTWARE', vat_treatment: 'REVERSE_CHARGE_FOREIGN_SERVICE', remember: true });
  const exported = await exportCompanyData(store, docs, 'c1');
  assert.equal(exported.packs.length, 1);
  assert.equal(exported.documents.length, 1);
  assert.equal(exported.learned_rules.length, 1);
  assert.equal((exported.packs[0].statement_request as { company_name: string }).company_name, 'Test OU');
  await assert.rejects(eraseCompanyData(store, docs, 'c1', 'wrong'), /confirm must equal/);
  const receipt = await eraseCompanyData(store, docs, 'c1', 'c1');
  assert.deepEqual([receipt.packs, receipt.documents, receipt.learned_rules], [1, 1, 1]);
  assert.match(receipt.receipt_hash, /^[0-9a-f]{64}$/);
  await assert.rejects(getPack(store, created.record.pack_id, 'c1'), /not found/);
  assert.equal((await getPack(store, other.record.pack_id, 'c2')).record.company_id, 'c2'); // untouched
  assert.equal((await docs.listByCompany('c2')).length, 1);
  const later = Date.now() + 200 * 86_400_000;
  assert.deepEqual(await purgeExpired(store, docs, 'c2', later), { packs: 1, documents: 1 });
});
