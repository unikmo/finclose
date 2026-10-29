import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { InMemoryPackStore } from '../lib/pack-store.ts';
import { InMemoryDocumentStore } from '../lib/document-store.ts';
import { uploadDocument } from '../lib/document-intake.ts';
import { createPack, getPack, recordOwnerAnswer, signOffPack } from '../lib/pack-lifecycle.ts';
import { purgeAllExpired } from '../lib/data-rights.ts';
import { DAY_MS, retentionPolicy } from '../lib/retention.ts';
import { checkCronAuth } from '../lib/cron-auth.ts';

const CSV = ['date,amount,counterparty,description', '2026-03-03,-20.00,Vercel Inc,Hosting', '2026-03-10,500.00,Client OU,Invoice 12'].join('\n');
const request = { company_name: 'Test OU', jurisdiction: 'EE', vat_registered: false, period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };
const actor = { user_id: 'u1' };
const received = { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const };
const signArgs = (hash: string) => ({ pack_hash: hash, note: 'accepting open items for the test', accept_open_items: true });

test('retention periods have sensible defaults and ignore bad settings', () => {
  assert.deepEqual(retentionPolicy({}), { open_pack_days: 90, signed_off_pack_days: 365, document_days: 90 });
  assert.equal(retentionPolicy({ FINCLOSE_SIGNED_OFF_RETENTION_DAYS: '2555' }).signed_off_pack_days, 2555);
  for (const bad of ['0', '-5', '1.5', 'abc', '99999', ' ']) assert.equal(retentionPolicy({ FINCLOSE_PACK_RETENTION_DAYS: bad }).open_pack_days, 90, bad);
});

test('linking a receipt and signing off lengthen retention of the pack and its receipts, never shorten it', async () => {
  const packs = new InMemoryPackStore();
  const docs = new InMemoryDocumentStore();
  const created = await createPack(packs, { company_id: 'c1', organization_id: 'o', actor, request });
  const id = created.record.pack_id;
  const up = await uploadDocument(docs, { company_id: 'c1', organization_id: 'o', actor, filename: 'a.pdf', bytes: Buffer.from('%PDF-1.4 a') }, received);
  const tx = created.result.pack.entries[0].transaction_id;
  // Make the receipt look old: it would expire a day from now, well before the pack.
  const stored = (docs as unknown as { docs: Map<string, { record: { expires_at: number } }> }).docs.get(up.record.document_id)!;
  stored.record.expires_at = Date.now() + DAY_MS;

  const answered = await recordOwnerAnswer(packs, id, 'c1', actor, { transaction_id: tx, document_ids: [up.record.document_id] }, docs);
  assert.equal((await docs.get(up.record.document_id))!.expires_at, answered.record.expires_at, 'linking keeps the receipt as long as the open pack');

  const signed = await signOffPack(packs, id, 'c1', actor, signArgs(answered.result.pack.pack_hash), true, docs);
  assert.ok(signed.record.expires_at >= Date.now() + 364 * DAY_MS);
  assert.equal((await getPack(packs, id, 'c1')).record.expires_at, signed.record.expires_at);
  assert.equal((await docs.get(up.record.document_id))!.expires_at, signed.record.expires_at);

  await docs.extendExpiry(up.record.document_id, 1); // an earlier time is ignored
  assert.equal((await docs.get(up.record.document_id))!.expires_at, signed.record.expires_at);
});

test('the scheduled purge removes only what is expired, across companies, and reports when more is left', async () => {
  const packs = new InMemoryPackStore();
  const docs = new InMemoryDocumentStore();
  const a = await createPack(packs, { company_id: 'a', organization_id: 'o', actor, request });
  const b = await createPack(packs, { company_id: 'b', organization_id: 'o', actor, request });
  await uploadDocument(docs, { company_id: 'a', organization_id: 'o', actor, filename: 'a.pdf', bytes: Buffer.from('%PDF-1.4 a') }, received);
  await uploadDocument(docs, { company_id: 'b', organization_id: 'o', actor, filename: 'b.pdf', bytes: Buffer.from('%PDF-1.4 b') }, received);
  assert.deepEqual(await purgeAllExpired(packs, docs), { packs: 0, documents: 0, failed: 0, more: false });
  const later = Date.now() + 100 * DAY_MS; // past the 90-day default
  assert.deepEqual(await purgeAllExpired(packs, docs, later, 1), { packs: 1, documents: 1, failed: 0, more: true });
  assert.deepEqual(await purgeAllExpired(packs, docs, later, 1), { packs: 1, documents: 1, failed: 0, more: true });
  assert.deepEqual(await purgeAllExpired(packs, docs, later, 1), { packs: 0, documents: 0, failed: 0, more: false });
  assert.equal(await packs.get(a.record.pack_id), null);
  assert.equal(await packs.get(b.record.pack_id), null);
});

test('a signed-off pack survives a purge that removes an ordinary one', async () => {
  const packs = new InMemoryPackStore();
  const docs = new InMemoryDocumentStore();
  const keep = await createPack(packs, { company_id: 'k', organization_id: 'o', actor, request });
  const signed = await signOffPack(packs, keep.record.pack_id, 'k', actor, signArgs(keep.result.pack.pack_hash), true, docs);
  const plain = await createPack(packs, { company_id: 'p', organization_id: 'o', actor, request });
  const result = await purgeAllExpired(packs, docs, Date.now() + 100 * DAY_MS);
  assert.equal(result.packs, 1);
  assert.ok(await packs.get(signed.record.pack_id));
  assert.equal(await packs.get(plain.record.pack_id), null);
});

test('purge authorisation: closed without a secret, bearer token required, short secrets ignored', () => {
  const secret = 'a-long-enough-secret-value';
  assert.equal(checkCronAuth(`Bearer ${secret}`, {}), 'not_configured');
  assert.equal(checkCronAuth('Bearer short', { CRON_SECRET: 'short' }), 'not_configured');
  assert.equal(checkCronAuth(null, { CRON_SECRET: secret }), 'unauthorised');
  assert.equal(checkCronAuth('Bearer nope', { CRON_SECRET: secret }), 'unauthorised');
  assert.equal(checkCronAuth(secret, { CRON_SECRET: secret }), 'unauthorised', 'the Bearer prefix is required');
  assert.equal(checkCronAuth(`Bearer ${secret}`, { CRON_SECRET: secret }), 'ok');
  assert.equal(checkCronAuth(`Bearer ${secret}-2`, { CRON_SECRET: 'x'.repeat(20), FINCLOSE_CRON_TOKEN: `${secret}-2` }), 'ok');
});

test('the purge route answers 503, 401 and 200 as configured', async () => {
  const saved = { CRON_SECRET: process.env.CRON_SECRET, FINCLOSE_CRON_TOKEN: process.env.FINCLOSE_CRON_TOKEN, FINCLOSE_RUNTIME_MODE: process.env.FINCLOSE_RUNTIME_MODE };
  process.env.FINCLOSE_RUNTIME_MODE = 'LAB';
  delete process.env.CRON_SECRET;
  delete process.env.FINCLOSE_CRON_TOKEN;
  try {
    const { GET } = await import('../app/api/maintenance/purge/route.ts');
    const call = (token?: string) => GET(new NextRequest('http://localhost/api/maintenance/purge', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
    assert.equal((await call('anything-at-all-123456')).status, 503);
    process.env.CRON_SECRET = 'route-test-secret-0123456789';
    assert.equal((await call()).status, 401);
    assert.equal((await call('wrong-wrong-wrong-wrong')).status, 401);
    const ok = await call('route-test-secret-0123456789');
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(await ok.json()).sort(), ['documents', 'failed', 'more', 'packs']);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
