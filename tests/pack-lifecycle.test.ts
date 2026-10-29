import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPackStore } from '../lib/pack-store.ts';
import { createPack, deletePack, getPack, listPacks, recordCorrection, recordOwnerAnswer } from '../lib/pack-lifecycle.ts';

const CSV = [
  'date,amount,counterparty,description',
  '2026-03-03,-800.00,Zxqv Trading,work',
  '2026-03-05,-3.50,Coffee House Cafe,Coffee',
  '2026-03-05,-3.50,Coffee House Cafe,Coffee'
].join('\n');
const request = { company_name: 'Test OÜ', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };
const actor = { user_id: 'u1' };
const make = (store: InMemoryPackStore, company = 'c1') => createPack(store, { company_id: company, organization_id: 'o1', actor, request });

test('a saved pack can be reloaded with the same hash and is never approved', async () => {
  const store = new InMemoryPackStore();
  const created = await make(store);
  const loaded = await getPack(store, created.record.pack_id, 'c1');
  assert.equal(loaded.result.pack.pack_hash, created.result.pack.pack_hash);
  assert.equal(loaded.result.pack.status, 'PREPARED_NOT_APPROVED');
  assert.equal(loaded.record.version, 1);
});

test('another company cannot read, answer, correct or delete the pack', async () => {
  const store = new InMemoryPackStore();
  const { record, result } = await make(store);
  const id = result.pack.entries[0].transaction_id;
  await assert.rejects(getPack(store, record.pack_id, 'c2'), /not found/);
  await assert.rejects(recordOwnerAnswer(store, record.pack_id, 'c2', actor, { transaction_id: id, note: 'x' }), /not found/);
  await assert.rejects(recordCorrection(store, record.pack_id, 'c2', actor, { transaction_id: id, category_code: 'SOFTWARE', vat_treatment: 'NO_VAT' }), /not found/);
  await assert.rejects(deletePack(store, record.pack_id, 'c2'), /not found/);
  assert.equal((await listPacks(store, 'c2')).length, 0);
});

test('a second pack for the same period is version 2 and supersedes the first', async () => {
  const store = new InMemoryPackStore();
  const first = await make(store);
  const second = await make(store);
  assert.equal(second.record.version, 2);
  const old = await getPack(store, first.record.pack_id, 'c1');
  assert.equal(old.record.status, 'SUPERSEDED');
  await assert.rejects(recordOwnerAnswer(store, first.record.pack_id, 'c1', actor, { transaction_id: first.result.pack.entries[0].transaction_id, note: 'x' }), /superseded/);
});

test('owner answers change the pack: a document clears the missing-document exception, a confirmed duplicate clears the flag', async () => {
  const store = new InMemoryPackStore();
  const { record, result } = await make(store);
  const big = result.pack.entries.find(e => e.amount_cents === -80000)!;
  const dup = result.pack.exceptions.find(e => e.code === 'POSSIBLE_DUPLICATE')!;
  await recordOwnerAnswer(store, record.pack_id, 'c1', actor, { transaction_id: big.transaction_id, document_ids: ['doc_1'] });
  const after = await recordOwnerAnswer(store, record.pack_id, 'c1', actor, { transaction_id: dup.transaction_id!, confirm_duplicate: true });
  assert.ok(!after.result.pack.exceptions.some(e => e.code === 'MISSING_DOCUMENT' && e.transaction_id === big.transaction_id));
  assert.ok(!after.result.pack.exceptions.some(e => e.code === 'POSSIBLE_DUPLICATE'));
  assert.ok(after.record.events.some(e => e.type === 'OWNER_ANSWER'));
  assert.ok(after.result.pack.exceptions.length < result.pack.exceptions.length);
});

test('answers are validated', async () => {
  const store = new InMemoryPackStore();
  const { record } = await make(store);
  await assert.rejects(recordOwnerAnswer(store, record.pack_id, 'c1', actor, { transaction_id: 'nope', note: 'x' }), /not in this pack/);
  await assert.rejects(recordOwnerAnswer(store, record.pack_id, 'c1', actor, { transaction_id: 'nope' }), /not in this pack/);
});

test('a correction applies now; remembering it applies to the same company next time only', async () => {
  const store = new InMemoryPackStore();
  const { record, result } = await make(store);
  const unknown = result.pack.entries.find(e => e.amount_cents === -80000)!;
  const corrected = await recordCorrection(store, record.pack_id, 'c1', actor, { transaction_id: unknown.transaction_id, category_code: 'CLOUD', vat_treatment: 'NEEDS_INVOICE_REVIEW', remember: true });
  assert.equal(corrected.result.pack.entries.find(e => e.transaction_id === unknown.transaction_id)?.category_code, 'CLOUD');

  const sameCompany = await make(store, 'c1');
  assert.equal(sameCompany.result.pack.entries.find(e => e.amount_cents === -80000)?.category_code, 'CLOUD');
  assert.equal(sameCompany.result.pack.entries.find(e => e.amount_cents === -80000)?.confidence, 0.95);

  const otherCompany = await make(store, 'c2');
  assert.notEqual(otherCompany.result.pack.entries.find(e => e.amount_cents === -80000)?.category_code, 'CLOUD');
});

test('corrections reject unknown categories and VAT values', async () => {
  const store = new InMemoryPackStore();
  const { record, result } = await make(store);
  const id = result.pack.entries[0].transaction_id;
  await assert.rejects(recordCorrection(store, record.pack_id, 'c1', actor, { transaction_id: id, category_code: 'MADE_UP', vat_treatment: 'NO_VAT' }), /not in this rule pack/);
  await assert.rejects(recordCorrection(store, record.pack_id, 'c1', actor, { transaction_id: id, category_code: 'CLOUD', vat_treatment: 'BOGUS' }), /vat_treatment/);
});

test('a stale write is refused instead of silently overwriting', async () => {
  const store = new InMemoryPackStore();
  const { record } = await make(store);
  const stale = { ...record, revision: record.revision + 1 };
  await assert.rejects(store.update(stale, 99), /changed by someone else/);
});

test('expired packs are not served and delete removes the pack', async () => {
  const store = new InMemoryPackStore();
  const { record } = await make(store);
  const hit = await store.get(record.pack_id);
  await store.update({ ...hit!.record, revision: hit!.record.revision + 1, expires_at: Date.now() - 1 }, hit!.record.revision);
  await assert.rejects(getPack(store, record.pack_id, 'c1'), /retention/);
  assert.equal((await listPacks(store, 'c1')).length, 0);
  const fresh = await make(store);
  await deletePack(store, fresh.record.pack_id, 'c1');
  await assert.rejects(getPack(store, fresh.record.pack_id, 'c1'), /not found/);
});
