import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

// Real-data (PILOT) access path for the saved-pack routes, against the Realtime
// Database and Firestore emulators: company ownership, organisation roles, the
// operator switch, and the Firestore-backed rate limit shared across instances.
// Sign-in itself (Firebase Auth session cookies, release certification) is NOT
// exercised: the tests hand authoriseIdentity an already-authenticated identity.

assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_DATABASE_EMULATOR_HOST, 'run through `firebase emulators:exec`, never against a real project');
process.env.FINCLOSE_RUNTIME_MODE = 'PILOT';
process.env.FINCLOSE_STATEMENT_PREP_ENABLED = 'true';

const app = initializeApp({ projectId: 'demo-finclose', databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=demo-finclose` });
const rtdb = getDatabase(app);
const fs = getFirestore(app);

const { authoriseIdentity } = await import('../../lib/pack-route-support.ts');
const { checkSharedRateLimit } = await import('../../lib/rate-limit-shared.ts');
const { FirestorePackStore } = await import('../../lib/pack-store-firestore.ts');
const { createPack, getPack } = await import('../../lib/pack-lifecycle.ts');

const user = (id: string) => ({ kind: 'customer' as const, user: { user_id: id, email: `${id}@x.test`, name: id, email_verified: true } as never });
const noLimit = async () => {};

await rtdb.ref().update({
  'finclose_company_ownership/co1': { company_id: 'co1', organization_id: 'orgA', status: 'ACTIVE' },
  'finclose_company_ownership/co_broken': { company_id: 'co_broken', status: 'ACTIVE' },
  'finclose_organization_memberships/orgA/accountant': { user_id: 'accountant', role: 'ACCOUNTANT', status: 'ACTIVE' },
  'finclose_organization_memberships/orgA/rl_user': { user_id: 'rl_user', role: 'VIEWER', status: 'ACTIVE' },
  'finclose_organization_memberships/orgA/viewer': { user_id: 'viewer', role: 'VIEWER', status: 'ACTIVE' },
  'finclose_organization_memberships/orgA/admin': { user_id: 'admin', role: 'ADMIN', status: 'ACTIVE' },
  'finclose_organization_memberships/orgA/removed': { user_id: 'removed', role: 'OWNER', status: 'SUSPENDED' },
  'finclose_organization_memberships/orgB/outsider': { user_id: 'outsider', role: 'OWNER', status: 'ACTIVE' }
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { status?: number }).status ?? 500;
  }
};

test('lab identity is refused in real-data mode', async () => {
  assert.equal(await code(authoriseIdentity({ kind: 'lab', user: null } as never, 'co1', 'ACCOUNTANT', 60, noLimit)), 401);
});

test('missing company, unknown company and ownerless company are refused', async () => {
  assert.equal(await code(authoriseIdentity(user('accountant'), '', 'ACCOUNTANT', 60, noLimit)), 400);
  assert.equal(await code(authoriseIdentity(user('accountant'), 'nope', 'ACCOUNTANT', 60, noLimit)), 409);
  assert.equal(await code(authoriseIdentity(user('accountant'), 'co_broken', 'ACCOUNTANT', 60, noLimit)), 409);
});

test('roles: accountant may write, viewer may only read, admin may delete', async () => {
  assert.equal(await code(authoriseIdentity(user('accountant'), 'co1', 'ACCOUNTANT', 60, noLimit)), 200);
  assert.equal(await code(authoriseIdentity(user('viewer'), 'co1', 'ACCOUNTANT', 60, noLimit)), 403);
  assert.equal(await code(authoriseIdentity(user('viewer'), 'co1', 'VIEWER', 60, noLimit)), 200);
  assert.equal(await code(authoriseIdentity(user('accountant'), 'co1', 'ADMIN', 60, noLimit)), 403);
  assert.equal(await code(authoriseIdentity(user('admin'), 'co1', 'ADMIN', 60, noLimit)), 200);
});

test('another organisation and a suspended member are refused', async () => {
  assert.equal(await code(authoriseIdentity(user('outsider'), 'co1', 'VIEWER', 60, noLimit)), 403);
  assert.equal(await code(authoriseIdentity(user('removed'), 'co1', 'VIEWER', 60, noLimit)), 403);
});

test('the operator switch is required', async () => {
  process.env.FINCLOSE_STATEMENT_PREP_ENABLED = 'false';
  try {
    assert.equal(await code(authoriseIdentity(user('accountant'), 'co1', 'ACCOUNTANT', 60, noLimit)), 403);
  } finally {
    process.env.FINCLOSE_STATEMENT_PREP_ENABLED = 'true';
  }
});

test('an authorised caller can save a pack; it is invisible through another company id', async () => {
  const caller = await authoriseIdentity(user('accountant'), 'co1', 'ACCOUNTANT', 60, noLimit);
  const store = new FirestorePackStore(fs);
  const request = { company_name: 'A OÜ', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31', csv_text: 'date,amount,counterparty,description\n2026-03-05,-5.00,LHV,Monthly fee' };
  const created = await createPack(store, { company_id: caller.company_id, organization_id: caller.organization_id, actor: { user_id: caller.user_id }, request });
  assert.equal(created.record.organization_id, 'orgA');
  assert.equal(created.record.created_by, 'accountant');
  await assert.rejects(getPack(store, created.record.pack_id, 'some_other_company'), /not found/);
});

test('shared rate limit: stops exactly at the limit, even when requests are concurrent', async () => {
  const key = `t_${Date.now()}`;
  const now = Date.now();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => checkSharedRateLimit(fs, key, 5, 60_000, now)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
  assert.ok(rejected.every(r => (r.reason as { status?: number }).status === 429));
  await checkSharedRateLimit(fs, key, 5, 60_000, now + 120_000); // next window starts fresh
  await checkSharedRateLimit(fs, `${key}_other`, 5, 60_000, now); // separate key
});

test('the default limiter inside authoriseIdentity is the shared one and refuses the 4th call',async () => {
  const hits: number[] = [];
  for (let i = 0; i < 4; i += 1) hits.push(await code(authoriseIdentity(user('rl_user'), 'co1', 'VIEWER', 3)));
  assert.deepEqual(hits, [200, 200, 200, 429]);
});

// Realtime Database keeps a socket open; close every app so the run can exit.
after(async () => {
  await Promise.all(getApps().map(a => deleteApp(a)));
});
