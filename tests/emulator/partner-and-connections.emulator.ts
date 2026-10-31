import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// The Firestore stores for the partner layer and the accounting-package connections, against the
// Firestore emulator. Rules and indexes are not enforced by the emulator; these queries use
// single-field equality only, which needs no composite index.

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'run through `firebase emulators:exec`, never against a real project');

const app = initializeApp({ projectId: 'demo-finclose' });
const db = getFirestore(app);

const { FirestorePartnerStore } = await import('../../lib/partner-store-firestore.ts');
const { FirestoreConnectionStore } = await import('../../lib/connection-store-firestore.ts');
const { acceptStaffInvitation, inviteStaff, validateBranding, validateCustomDeadline, validatePlan, validateSettings } = await import('../../lib/partner-layer.ts');
const { sealSecret, openSecret } = await import('../../lib/connectors.ts');
const { eraseCompanyData } = await import('../../lib/data-rights.ts');
const { FirestorePackStore } = await import('../../lib/pack-store-firestore.ts');
const { FirebaseDocumentStore } = await import('../../lib/document-store-firebase.ts');

const partners = new FirestorePartnerStore(db);
const connections = new FirestoreConnectionStore(db);
const env = { FINCLOSE_TOKEN_KEY: 'k'.repeat(40) } as NodeJS.ProcessEnv;

after(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

test('invitations round-trip through Firestore, are found by hash, and a replay is refused', async () => {
  const firm = `firm_${Date.now()}`;
  const { token } = await inviteStaff(partners, { firm_id: firm, actor_user_id: 'boss', actor_role: 'PARTNER', email: 'Ann@Firm.example', role: 'ACCOUNTANT', active_staff: 1 });
  const stored = await partners.listInvitations(firm);
  assert.equal(stored.length, 1);
  assert.ok(!JSON.stringify(stored).includes(token), 'only the hash is stored');
  const joined: string[] = [];
  const user = { user_id: 'u-ann', email: 'ann@firm.example', email_verified: true };
  const result = await acceptStaffInvitation(partners, { token, user }, async (f, _u, role) => { joined.push(`${f}:${role}`); });
  assert.deepEqual(result, { firm_id: firm, role: 'ACCOUNTANT' });
  assert.deepEqual(joined, [`${firm}:ACCOUNTANT`]);
  await assert.rejects(() => acceptStaffInvitation(partners, { token, user }, async () => undefined), /already been used/);
  assert.equal((await partners.listInvitations(firm))[0].status, 'ACCEPTED');
});

test('plan, branding, settings and deadlines persist per firm and do not leak between firms', async () => {
  const a = `firm_a_${Date.now()}`;
  const b = `firm_b_${Date.now()}`;
  await partners.putPlan(validatePlan(a, { price_cents_per_client_month: 700, max_clients: 5 }));
  await partners.putBranding(validateBranding(a, { display_name: 'Acme', accent_color: '#112233' }));
  await partners.putSettings(validateSettings(a, { close_due_day: 15 }));
  const deadline = validateCustomDeadline(a, { company_id: 'c1', title: 'Annual report', due_date: '2026-06-30' }, 'boss');
  await partners.putDeadline(deadline);
  assert.equal((await partners.getPlan(a))?.price_cents_per_client_month, 700);
  assert.equal((await partners.getBranding(a))?.display_name, 'Acme');
  assert.equal((await partners.getSettings(a))?.close_due_day, 15);
  assert.equal((await partners.listDeadlines(a)).length, 1);
  assert.equal(await partners.getPlan(b), null);
  assert.equal(await partners.getBranding(b), null);
  assert.deepEqual(await partners.listDeadlines(b), []);
  await partners.deleteDeadline(a, deadline.deadline_id);
  assert.deepEqual(await partners.listDeadlines(a), []);
});

test('connections keep only sealed tokens, record pushes, and are removed by erase', async () => {
  const company = `co_${Date.now()}`;
  await connections.put({
    company_id: company, provider: 'xero', tenant_id: 't1', tenant_name: 'Emu OU',
    sealed_refresh_token: sealSecret('refresh-secret', env), sealed_access_token: sealSecret('access-secret', env),
    access_expires_at: Date.now() + 1000, connected_by: 'u1', connected_at: Date.now()
  });
  const raw = JSON.stringify((await db.collection('finclose_prod_connections').get()).docs.map(d => d.data()));
  assert.ok(!raw.includes('refresh-secret') && !raw.includes('access-secret'), 'no plain token in the database');
  assert.equal(openSecret((await connections.get(company, 'xero'))!.sealed_refresh_token, env), 'refresh-secret');
  await connections.recordPush(company, 'xero', { pack_hash: 'h'.repeat(64), external_id: 'mj-1', pushed_at: Date.now() });
  assert.equal((await connections.listPushed(company, 'xero')).length, 1);

  const receipt = await eraseCompanyData(new FirestorePackStore(db), new FirebaseDocumentStore(db, { file: () => ({ save: async () => undefined, download: async () => [Buffer.alloc(0)], delete: async () => undefined }) } as never), company, company, Date.now(), connections);
  assert.equal(receipt.connections, 1);
  assert.equal(await connections.get(company, 'xero'), null);
  assert.deepEqual(await connections.listPushed(company, 'xero'), []);
});
