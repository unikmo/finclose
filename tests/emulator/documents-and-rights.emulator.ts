import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Document store (Firestore metadata + Cloud Storage bytes), company erase/export, and the TTL
// timestamp field, against the Firestore and Storage emulators. The emulators do NOT delete
// documents when ttl_at passes and do NOT enforce indexes or rules, so those stay unverified here.

assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'run through `firebase emulators:exec`, never against a real project');

const app = initializeApp({ projectId: 'demo-finclose', storageBucket: 'demo-finclose.appspot.com' });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const { FirebaseDocumentStore } = await import('../../lib/document-store-firebase.ts');
const { FirestorePackStore } = await import('../../lib/pack-store-firestore.ts');
const { uploadDocument, reviewDocument } = await import('../../lib/document-intake.ts');
const { createPack, getPack, recordCorrection, recordOwnerAnswer, signOffPack } = await import('../../lib/pack-lifecycle.ts');
const { eraseCompanyData, exportCompanyData, purgeExpired, purgeAllExpired } = await import('../../lib/data-rights.ts');
const { checkSharedRateLimit } = await import('../../lib/rate-limit-shared.ts');

const docs = new FirebaseDocumentStore(db, bucket as never);
const packs = new FirestorePackStore(db);
const actor = { user_id: 'u1' };
const PDF = Buffer.from('%PDF-1.4 emulator invoice');
const quarantined = { status: 'QUARANTINED' as const, security_review_status: 'AWAITING_MANUAL_REVIEW' as const };
const request = { company_name: 'Emu OU', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31', csv_text: 'date,amount,counterparty,description\n2026-03-05,-5.00,Vercel Inc,Hosting\n2026-03-06,-3.00,LHV,Monthly fee' };

test('document bytes and metadata round-trip, duplicates are stored once, review is one-way', async () => {
  const up = await uploadDocument(docs, { company_id: 'd1', organization_id: 'o', actor, filename: 'inv.pdf', bytes: PDF }, quarantined);
  assert.equal(up.record.status, 'QUARANTINED');
  assert.ok(up.record.storage_path.includes('/quarantine/'));
  assert.deepEqual(await docs.readBytes(up.record), PDF);
  const again = await uploadDocument(docs, { company_id: 'd1', organization_id: 'o', actor, filename: 'copy.pdf', bytes: PDF }, quarantined);
  assert.equal(again.duplicate, true);
  assert.equal((await docs.listByCompany('d1')).length, 1);
  assert.equal((await docs.listByCompany('d2')).length, 0);
  const reviewed = await reviewDocument(docs, up.record.document_id, 'd1', { user_id: 'reviewer' }, 'CLEAN', 'ok', 'MANUAL_REVIEW');
  assert.equal((await docs.get(up.record.document_id))?.status, 'CLEAN');
  assert.equal(reviewed.reviewed_by, 'reviewer');
  await assert.rejects(reviewDocument(docs, up.record.document_id, 'd1', { user_id: 'r2' }, 'REJECTED', '', 'MANUAL_REVIEW'), /immutable/);
});

test('stored documents carry a real timestamp ttl_at that the app never sees', async () => {
  const [up] = await docs.listByCompany('d1');
  const raw = (await db.collection('finclose_prod_documents').doc(up.document_id).get()).data()!;
  assert.ok(raw.ttl_at instanceof Timestamp);
  assert.equal(raw.ttl_at.toMillis(), up.expires_at);
  assert.equal('ttl_at' in up, false);
});

test('pack, input and rate-limit documents also carry ttl_at timestamps', async () => {
  const created = await createPack(packs, { company_id: 'p1', organization_id: 'o', actor, request });
  const meta = (await db.collection('finclose_prod_review_packs').doc(created.record.pack_id).get()).data()!;
  const input = (await db.collection('finclose_prod_review_pack_inputs').doc(created.record.pack_id).get()).data()!;
  assert.ok(meta.ttl_at instanceof Timestamp && input.ttl_at instanceof Timestamp);
  const loaded = await getPack(packs, created.record.pack_id, 'p1');
  assert.equal('ttl_at' in loaded.record, false);
  await checkSharedRateLimit(db, 'ttl-check', 5, 60_000);
  const limits = await db.collection('finclose_prod_rate_limits').where('key', '==', 'ttl-check').get();
  assert.ok(limits.docs[0].data().ttl_at instanceof Timestamp);
});

test('export, erase and purge work on Firestore and Storage, for one company only', async () => {
  const mine = await createPack(packs, { company_id: 'e1', organization_id: 'o', actor, request });
  const theirs = await createPack(packs, { company_id: 'e2', organization_id: 'o', actor, request });
  const tx = mine.result.pack.entries[0];
  await recordCorrection(packs, mine.record.pack_id, 'e1', actor, { transaction_id: tx.transaction_id, category_code: 'SOFTWARE', vat_treatment: 'NO_VAT', remember: true });
  const d1 = await uploadDocument(docs, { company_id: 'e1', organization_id: 'o', actor, filename: 'a.pdf', bytes: Buffer.from('%PDF-1.4 e1') }, quarantined);
  await uploadDocument(docs, { company_id: 'e2', organization_id: 'o', actor, filename: 'a.pdf', bytes: Buffer.from('%PDF-1.4 e2') }, quarantined);

  const exported = await exportCompanyData(packs, docs, 'e1');
  assert.equal(exported.packs.length, 1);
  assert.equal(exported.documents.length, 1);
  assert.equal(exported.learned_rules.length, 1);
  assert.equal((exported.packs[0].statement_request as { company_name: string }).company_name, 'Emu OU');

  const receipt = await eraseCompanyData(packs, docs, 'e1', 'e1');
  assert.deepEqual([receipt.packs, receipt.documents, receipt.learned_rules], [1, 1, 1]);
  await assert.rejects(getPack(packs, mine.record.pack_id, 'e1'), /not found/);
  assert.equal((await db.collection('finclose_prod_review_pack_inputs').doc(mine.record.pack_id).get()).exists, false);
  assert.equal((await bucket.file(d1.record.storage_path).exists())[0], false);
  assert.equal(await packs.learnedRules('e1').then(r => r.length), 0);
  assert.equal((await getPack(packs, theirs.record.pack_id, 'e2')).record.company_id, 'e2');
  assert.equal((await docs.listByCompany('e2')).length, 1);

  assert.deepEqual(await purgeExpired(packs, docs, 'e2', Date.now() + 200 * 86_400_000), { packs: 1, documents: 1 });
  assert.equal((await docs.listByCompany('e2')).length, 0);
});

test('a company account map is stored per company on Firestore, reset cleanly, and erased with the company', async () => {
  const map = { CLOUD: { code: '5200', name: 'Server costs' } };
  assert.equal(await packs.accountOverrides('m1'), null);
  await packs.setAccountOverrides('m1', map);
  await packs.setAccountOverrides('m2', { CLOUD: { code: '5300', name: 'Other' } });
  assert.deepEqual(await packs.accountOverrides('m1'), map);
  assert.equal((await exportCompanyData(packs, docs, 'm1')).account_overrides?.CLOUD.code, '5200');
  const receipt = await eraseCompanyData(packs, docs, 'm1', 'm1');
  assert.equal(receipt.account_map, true);
  assert.equal(await packs.accountOverrides('m1'), null);
  assert.equal((await packs.accountOverrides('m2'))?.CLOUD.code, '5300');
  await packs.setAccountOverrides('m2', null);
  assert.equal(await packs.accountOverrides('m2'), null);
});

test('sign-off extends the pack, its stored statement and its receipts on Firestore; the scheduled purge then spares them', async () => {
  const created = await createPack(packs, { company_id: 'r1', organization_id: 'o', actor, request });
  const plain = await createPack(packs, { company_id: 'r2', organization_id: 'o', actor, request });
  const up = await uploadDocument(docs, { company_id: 'r1', organization_id: 'o', actor, filename: 'r.pdf', bytes: Buffer.from('%PDF-1.4 r1') }, { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const });
  const orphan = await uploadDocument(docs, { company_id: 'r2', organization_id: 'o', actor, filename: 'o.pdf', bytes: Buffer.from('%PDF-1.4 r2') }, { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const });
  const tx = created.result.pack.entries[0].transaction_id;
  const answered = await recordOwnerAnswer(packs, created.record.pack_id, 'r1', actor, { transaction_id: tx, document_ids: [up.record.document_id] }, docs);
  const signed = await signOffPack(packs, created.record.pack_id, 'r1', actor, { pack_hash: answered.result.pack.pack_hash, note: 'accepting open items for the test', accept_open_items: true }, true, docs);

  const inputRaw = (await db.collection('finclose_prod_review_pack_inputs').doc(created.record.pack_id).get()).data()!;
  assert.equal(inputRaw.expires_at, signed.record.expires_at);
  assert.equal(inputRaw.ttl_at.toMillis(), signed.record.expires_at, 'the stored statement carries the longer expiry too');
  assert.equal((await docs.get(up.record.document_id))!.expires_at, signed.record.expires_at);
  const docRaw = (await db.collection('finclose_prod_documents').doc(up.record.document_id).get()).data()!;
  assert.equal(docRaw.ttl_at.toMillis(), signed.record.expires_at);

  const expiredPacks = await packs.listExpired(Date.now() + 100 * 86_400_000, 50);
  assert.ok(expiredPacks.some(p => p.pack_id === plain.record.pack_id));
  assert.ok(!expiredPacks.some(p => p.pack_id === created.record.pack_id), 'the signed-off pack is not due');

  // Scoped to this test's own companies: the emulator is shared with test files running in parallel, and an unscoped
  // purge 100 days ahead would delete their packs mid-test.
  const mine = new Set(['r1', 'r2']);
  const scopedPacks = Object.assign(Object.create(packs), { listExpired: async (n: number, l: number) => (await packs.listExpired(n, l)).filter(r => mine.has(r.company_id)) });
  const scopedDocs = Object.assign(Object.create(docs), { listExpired: async (n: number, l: number) => (await docs.listExpired(n, l)).filter(r => mine.has(r.company_id)) });
  const result = await purgeAllExpired(scopedPacks, scopedDocs, Date.now() + 100 * 86_400_000, 500);
  assert.equal(result.failed, 0);
  assert.ok(result.packs >= 1 && result.documents >= 1);
  assert.equal(await packs.get(plain.record.pack_id), null);
  assert.equal((await bucket.file(orphan.record.storage_path).exists())[0], false, 'file bytes are deleted, not just the metadata');
  assert.ok(await packs.get(created.record.pack_id));
  assert.equal((await bucket.file(up.record.storage_path).exists())[0], true);
});

after(async () => {
  await Promise.all(getApps().map(a => deleteApp(a)));
});
