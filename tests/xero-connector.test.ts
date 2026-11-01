import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryConnectionStore, openSecret, providerStatuses, sealSecret, xeroManualJournalCsv } from '../lib/connectors.ts';
import { completeXeroAuthorisation, pushJournalAsDraft, startXeroAuthorisation, verifyXeroState } from '../lib/xero-connector.ts';
import type { JournalView } from '../lib/chart-of-accounts.ts';

const env = {
  FINCLOSE_CONNECTORS_ENABLED: 'true', XERO_CLIENT_ID: 'cid', XERO_CLIENT_SECRET: 'secret', XERO_REDIRECT_URI: 'https://app.test/api/connectors/xero',
  FINCLOSE_TOKEN_KEY: 'k'.repeat(40)
} as NodeJS.ProcessEnv;

const journal: JournalView = {
  status: 'PROPOSED_NOT_POSTED', account_map: 'x', balanced: true, skipped: [], account_totals: [], notice: '',
  lines: [
    { transaction_id: 't1', date: '2026-03-03', account_code: '6120', account_name: 'Phone', debit_cents: 10000, credit_cents: 0, memo: 'Telia' },
    { transaction_id: 't1', date: '2026-03-03', account_code: '1300', account_name: 'Input VAT', debit_cents: 2400, credit_cents: 0, memo: 'Telia (input VAT 24%)' },
    { transaction_id: 't1', date: '2026-03-03', account_code: '1000', account_name: 'Bank', debit_cents: 0, credit_cents: 12400, memo: 'Telia' },
    { transaction_id: 't2', date: '2026-03-10', account_code: '1000', account_name: 'Bank', debit_cents: 50000, credit_cents: 0, memo: 'Client' },
    { transaction_id: 't2', date: '2026-03-10', account_code: '4000', account_name: 'Sales', debit_cents: 0, credit_cents: 50000, memo: 'Client' }
  ]
};

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };
function mockXero(handlers: Record<string, (call: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const call = { url, ...init };
    calls.push(call);
    const key = Object.keys(handlers).find(k => url.startsWith(k));
    const reply = key ? handlers[key](call) : { status: 404, body: {} };
    const status = reply.status ?? 200;
    return { ok: status < 300, status, json: async () => reply.body, text: async () => JSON.stringify(reply.body) };
  };
  return { fetchFn, calls };
}

const tokenReply = (n: number) => ({ body: { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 1800 } });
const goodHandlers = () => ({
  'https://identity.xero.com/connect/token': (c: Call) => tokenReply(c.body?.includes('refresh_token') ? 2 : 1),
  'https://api.xero.com/connections': () => ({ body: [{ tenantId: 'tenant-1', tenantName: 'Test OU', tenantType: 'ORGANISATION' }] }),
  'https://api.xero.com/api.xro/2.0/ManualJournals': (c: Call) => ({ body: { ManualJournals: JSON.parse(c.body!).ManualJournals.map((_: unknown, i: number) => ({ ManualJournalID: `mj-${i}` })) } })
});

test('provider status is honest about what works', () => {
  const states = (e: NodeJS.ProcessEnv) => Object.fromEntries(providerStatuses(e).map(p => [p.id, p.state]));
  assert.equal(states({}).xero, 'CODED_NOT_ENABLED');
  assert.equal(states({ FINCLOSE_CONNECTORS_ENABLED: 'true' }).xero, 'CODED_NEEDS_CREDENTIALS');
  assert.equal(states(env).xero, 'CODED_UNTESTED_LIVE');
  assert.equal(states(env).quickbooks, 'CODED_NEEDS_CREDENTIALS');
  assert.equal(states(env).smartaccounts, 'READ_ADAPTER_UNTESTED_LIVE');
  assert.equal(states(env).datev, 'FILE_EXPORT_UNVERIFIED');
  assert.equal(states({}).file_export, 'WORKING_FILE_EXPORT');
  assert.equal(providerStatuses({}).find(p => p.id === 'xero')!.can_push, false);
});

test('the token vault round-trips, is not plain text, and fails on a wrong key or tampering', () => {
  const sealed = sealSecret('refresh-token-value', env);
  assert.ok(!sealed.includes('refresh-token-value'));
  assert.equal(openSecret(sealed, env), 'refresh-token-value');
  assert.notEqual(sealSecret('refresh-token-value', env), sealed, 'a fresh nonce every time');
  assert.throws(() => openSecret(sealed, { ...env, FINCLOSE_TOKEN_KEY: 'z'.repeat(40) }));
  const parts = sealed.split('.');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => openSecret(parts.join('.'), env));
  assert.throws(() => sealSecret('x', { FINCLOSE_TOKEN_KEY: 'short' } as NodeJS.ProcessEnv), /32 characters/);
});

test('the sign-in link carries a signed, expiring state and a PKCE challenge', () => {
  const { url, state } = startXeroAuthorisation({ company_id: 'c1', user_id: 'u1' }, env, 1_000);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://login.xero.com/identity/connect/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.ok(!url.includes('secret'));
  assert.deepEqual({ ...verifyXeroState(state, env, 2_000), nonce: undefined }, { company_id: 'c1', user_id: 'u1', nonce: undefined });
  assert.throws(() => verifyXeroState(state, env, 1_000 + 11 * 60_000), /expired/);
  assert.throws(() => verifyXeroState(state.slice(0, -2) + 'xx', env, 2_000), /not valid/);
  assert.throws(() => verifyXeroState('garbage', env), /not valid/);
  assert.throws(() => startXeroAuthorisation({ company_id: 'c', user_id: 'u' }, {} as NodeJS.ProcessEnv), /switched off/);
  assert.throws(() => startXeroAuthorisation({ company_id: 'c', user_id: 'u' }, { FINCLOSE_CONNECTORS_ENABLED: 'true' } as NodeJS.ProcessEnv), /not configured/);
});

test('completing the sign-in stores sealed tokens, checks the verifier, and refuses another user\'s link', async () => {
  const store = new InMemoryConnectionStore();
  const { fetchFn, calls } = mockXero(goodHandlers());
  const { state, url } = startXeroAuthorisation({ company_id: 'c1', user_id: 'u1' }, env, 1_000);
  await assert.rejects(() => completeXeroAuthorisation(store, fetchFn, { code: 'abc', state, acting_user_id: 'someone-else' }, env, 2_000), /someone else/);
  const connection = await completeXeroAuthorisation(store, fetchFn, { code: 'abc', state, acting_user_id: 'u1' }, env, 2_000);
  assert.equal(connection.tenant_id, 'tenant-1');
  assert.ok(!JSON.stringify(connection).includes('refresh-1') && !JSON.stringify(connection).includes('access-1'), 'tokens are sealed');
  const tokenCall = calls.find(c => c.url.includes('/connect/token'))!;
  assert.match(tokenCall.headers!.Authorization, /^Basic /);
  const form = new URLSearchParams(tokenCall.body);
  const challenge = new URL(url).searchParams.get('code_challenge')!;
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), challenge, 'the verifier matches the challenge sent earlier');
  assert.equal((await store.get('c1', 'xero'))?.tenant_name, 'Test OU');
});

test('more than one shared organisation, or none, is refused', async () => {
  const run = async (tenants: unknown[]) => {
    const { fetchFn } = mockXero({ ...goodHandlers(), 'https://api.xero.com/connections': () => ({ body: tenants }) });
    const { state } = startXeroAuthorisation({ company_id: 'c1', user_id: 'u1' }, env, 1_000);
    return completeXeroAuthorisation(new InMemoryConnectionStore(), fetchFn, { code: 'abc', state, acting_user_id: 'u1' }, env, 2_000);
  };
  await assert.rejects(() => run([]), /no Xero organisation/);
  await assert.rejects(() => run([{ tenantId: 'a' }, { tenantId: 'b' }]), /more than one/);
});

async function connected(handlers = goodHandlers()) {
  const store = new InMemoryConnectionStore();
  const mock = mockXero(handlers);
  const { state } = startXeroAuthorisation({ company_id: 'c1', user_id: 'u1' }, env, 1_000);
  await completeXeroAuthorisation(store, mock.fetchFn, { code: 'abc', state, acting_user_id: 'u1' }, env, 2_000);
  mock.calls.length = 0;
  return { store, ...mock };
}

test('pushing sends DRAFT journals, one per day, each balanced, with the tenant header', async () => {
  const { store, fetchFn, calls } = await connected();
  const result = await pushJournalAsDraft(store, fetchFn, { company_id: 'c1', journal, pack_hash: 'a'.repeat(64), narration: 'FinClose Test OU' }, env, 3_000);
  assert.equal(result.already_pushed, false);
  assert.deepEqual(result.journals.map(j => j.date), ['2026-03-03', '2026-03-10']);
  const post = calls.find(c => c.url.endsWith('/ManualJournals'))!;
  assert.equal(post.headers!['xero-tenant-id'], 'tenant-1');
  assert.match(post.headers!.Authorization, /^Bearer access-1$/);
  const sent = JSON.parse(post.body!).ManualJournals;
  assert.equal(sent.length, 2);
  for (const j of sent) {
    assert.equal(j.Status, 'DRAFT', 'never posted');
    assert.equal(Math.round(j.JournalLines.reduce((s: number, l: { LineAmount: number }) => s + l.LineAmount * 100, 0)), 0);
  }
  assert.equal(sent[0].JournalLines[0].LineAmount, 100);
  assert.equal(sent[0].JournalLines[2].LineAmount, -124);
});

test('pushing the same pack twice sends nothing the second time', async () => {
  const { store, fetchFn, calls } = await connected();
  const args = { company_id: 'c1', journal, pack_hash: 'b'.repeat(64), narration: 'FinClose' };
  await pushJournalAsDraft(store, fetchFn, args, env, 3_000);
  const posts = () => calls.filter(c => c.url.endsWith('/ManualJournals')).length;
  assert.equal(posts(), 1);
  const again = await pushJournalAsDraft(store, fetchFn, args, env, 4_000);
  assert.equal(again.already_pushed, true);
  assert.equal(posts(), 1);
  await pushJournalAsDraft(store, fetchFn, { ...args, pack_hash: 'c'.repeat(64) }, env, 5_000);
  assert.equal(posts(), 2, 'a changed pack has a new hash and is sent');
});

test('an expired access token is refreshed, and the rotated refresh token is saved', async () => {
  const { store, fetchFn, calls } = await connected();
  const before = await store.get('c1', 'xero');
  await pushJournalAsDraft(store, fetchFn, { company_id: 'c1', journal, pack_hash: 'd'.repeat(64), narration: 'x' }, env, 2_000 + 1800 * 1000);
  const refresh = calls.find(c => new URLSearchParams(c.body).get('grant_type') === 'refresh_token')!;
  assert.equal(new URLSearchParams(refresh.body).get('refresh_token'), 'refresh-1');
  const after = await store.get('c1', 'xero');
  assert.notEqual(after!.sealed_refresh_token, before!.sealed_refresh_token);
  assert.equal(openSecret(after!.sealed_refresh_token, env), 'refresh-2');
  assert.match(calls.find(c => c.url.endsWith('/ManualJournals'))!.headers!.Authorization, /access-2$/);
});

test('nothing is sent for an unbalanced or empty journal, an unconnected company, or with connectors off', async () => {
  const { store, fetchFn, calls } = await connected();
  const args = { company_id: 'c1', journal, pack_hash: 'e'.repeat(64), narration: 'x' };
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, { ...args, journal: { ...journal, balanced: false } }, env), /does not balance/);
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, { ...args, journal: { ...journal, lines: [] } }, env), /empty/);
  const skewed = { ...journal, lines: journal.lines.map((l, i) => (i === 0 ? { ...l, debit_cents: l.debit_cents + 1 } : l)) };
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, { ...args, journal: skewed }, env), /do not balance/);
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, { ...args, company_id: 'other' }, env), /not connected/);
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, args, {} as NodeJS.ProcessEnv), /switched off/);
  assert.equal(calls.filter(c => c.url.endsWith('/ManualJournals')).length, 0);
});

test('a Xero error is reported without leaking tokens, and records no push', async () => {
  const { store, fetchFn } = await connected({ ...goodHandlers(), 'https://api.xero.com/api.xro/2.0/ManualJournals': () => ({ status: 400, body: { Message: 'Account code 6120 does not exist' } }) });
  const args = { company_id: 'c1', journal, pack_hash: 'f'.repeat(64), narration: 'x' };
  await assert.rejects(() => pushJournalAsDraft(store, fetchFn, args, env), (e: Error) => /code 400/.test(e.message) && /6120/.test(e.message) && !/access-|refresh-/.test(e.message));
  assert.deepEqual(await store.listPushed('c1', 'xero'), []);
});

test('the Xero import file has one signed row per journal line', () => {
  const csv = xeroManualJournalCsv(journal, 'FinClose Test OU');
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 6);
  assert.match(rows[0], /\*Narration/);
  assert.match(rows[1], /"03\/03\/2026".*"6120".*"100.00"/);
  assert.match(rows[3], /"-124.00"/);
});
