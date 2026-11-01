import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestorePackStore } from '../../lib/pack-store-firestore.ts';
import { createPack, deletePack, getPack, listPacks, recordCorrection, recordOwnerAnswer } from '../../lib/pack-lifecycle.ts';

// Runs the saved-pack lifecycle against the real Firestore emulator.
// Start with: npm run test:emulator   (needs Java and firebase-tools)
// Not covered: composite-index requirements (the emulator does not enforce them)
// and security rules (the Admin SDK bypasses them).

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'run through `firebase emulators:exec`, never against a real project');
const db = getFirestore(initializeApp({ projectId: 'demo-finclose' }));
const store = new FirestorePackStore(db);

const CSV = ['date,amount,counterparty,description', '2026-03-03,-800.00,Zxqv Trading,work', '2026-03-05,-3.50,Coffee House Cafe,Coffee', '2026-03-05,-3.50,Coffee House Cafe,Coffee'].join('\n');
const request = { company_name: 'Test OÜ', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };
const actor = { user_id: 'u1' };
let n = 0;
const company = () => `emu_c_${Date.now()}_${n++}`;
const make = (c: string) => createPack(store, { company_id: c, organization_id: 'o1', actor, request });

test('create, reload from Firestore, same hash, never approved', async () => {
  const c = company();
  const created = await make(c);
  const loaded = await getPack(store, created.record.pack_id, c);
  assert.equal(loaded.result.pack.pack_hash, created.result.pack.pack_hash);
  assert.equal(loaded.result.pack.status, 'PREPARED_NOT_APPROVED');
  assert.equal((await listPacks(store, c)).length, 1);
});

test('tenant isolation: another company gets not found for every operation', async () => {
  const a = company(), b = company();
  const { record, result } = await make(a);
  const id = result.pack.entries[0].transaction_id;
  await assert.rejects(getPack(store, record.pack_id, b), /not found/);
  await assert.rejects(recordOwnerAnswer(store, record.pack_id, b, actor, { transaction_id: id, note: 'x' }), /not found/);
  await assert.rejects(deletePack(store, record.pack_id, b), /not found/);
  assert.equal((await listPacks(store, b)).length, 0);
});

test('versioning and supersede persist', async () => {
  const c = company();
  const first = await make(c);
  const second = await make(c);
  assert.equal(second.record.version, 2);
  assert.equal((await getPack(store, first.record.pack_id, c)).record.status, 'SUPERSEDED');
  const list = await listPacks(store, c);
  assert.deepEqual(list.map(r => r.version), [2, 1]);
});

test('answers and remembered corrections persist; learning stays inside the company', async () => {
  const c = company(), other = company();
  const { record, result } = await make(c);
  const big = result.pack.entries.find(e => e.amount_cents === -80000)!;
  await recordOwnerAnswer(store, record.pack_id, c, actor, { transaction_id: big.transaction_id, document_ids: ['doc_1'] });
  const corrected = await recordCorrection(store, record.pack_id, c, actor, { transaction_id: big.transaction_id, category_code: 'CLOUD', vat_treatment: 'NEEDS_INVOICE_REVIEW', remember: true });
  assert.equal(corrected.record.revision, 3);
  const reloaded = await getPack(store, record.pack_id, c);
  assert.equal(reloaded.result.pack.entries.find(e => e.transaction_id === big.transaction_id)?.category_code, 'CLOUD');
  assert.ok(reloaded.record.events.some(e => e.type === 'CORRECTION'));
  assert.equal((await make(c)).result.pack.entries.find(e => e.amount_cents === -80000)?.category_code, 'CLOUD');
  assert.notEqual((await make(other)).result.pack.entries.find(e => e.amount_cents === -80000)?.category_code, 'CLOUD');
});

test('concurrent edits: exactly one wins, the other gets 409', async () => {
  const c = company();
  const { record, result } = await make(c);
  const ids = result.pack.entries.map(e => e.transaction_id);
  const outcomes = await Promise.allSettled([
    recordOwnerAnswer(store, record.pack_id, c, actor, { transaction_id: ids[0], note: 'a' }),
    recordOwnerAnswer(store, record.pack_id, c, actor, { transaction_id: ids[1], note: 'b' })
  ]);
  const ok = outcomes.filter(o => o.status === 'fulfilled').length;
  assert.equal(ok, 1);
  const failed = outcomes.find(o => o.status === 'rejected') as PromiseRejectedResult;
  assert.equal((failed.reason as { status?: number }).status, 409);
});

test('expiry hides the pack; delete removes both documents', async () => {
  const c = company();
  const { record } = await make(c);
  const hit = await store.get(record.pack_id);
  await store.update({ ...hit!.record, revision: hit!.record.revision + 1, expires_at: Date.now() - 1 }, hit!.record.revision);
  await assert.rejects(getPack(store, record.pack_id, c), /retention/);
  assert.equal((await listPacks(store, c)).length, 0);
  const fresh = await make(c);
  await deletePack(store, fresh.record.pack_id, c);
  assert.equal(await store.get(fresh.record.pack_id), null);
  assert.equal((await db.collection('finclose_prod_review_pack_inputs').doc(fresh.record.pack_id).get()).exists, false);
});

test('a duplicate insert of the same pack id is refused, not overwritten', async () => {
  const c = company();
  const { record } = await make(c);
  const hit = await store.get(record.pack_id);
  await assert.rejects(store.insert(hit!.record, hit!.input));
});
