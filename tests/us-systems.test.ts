import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryConnectionStore, openSecret, providerStatuses } from '../lib/connectors.ts';
import { OAUTH_PROVIDERS, completeOAuth, oauthAccess, startOAuth, verifyOAuthState } from '../lib/oauth-connect.ts';
import { FreshBooksLedgerSource } from '../lib/freshbooks-ledger.ts';
import { ZohoLedgerSource } from '../lib/zoho-ledger.ts';
import { reviewLedger } from '../lib/ledger-review.ts';

const env = {
  FINCLOSE_CONNECTORS_ENABLED: 'true', FINCLOSE_TOKEN_KEY: 'k'.repeat(40),
  QUICKBOOKS_CLIENT_ID: 'qid', QUICKBOOKS_CLIENT_SECRET: 'qsecret', QUICKBOOKS_REDIRECT_URI: 'https://app.test/api/connectors/oauth/quickbooks',
  FRESHBOOKS_CLIENT_ID: 'fid', FRESHBOOKS_CLIENT_SECRET: 'fsecret', FRESHBOOKS_REDIRECT_URI: 'https://app.test/api/connectors/oauth/freshbooks',
  ZOHO_CLIENT_ID: 'zid', ZOHO_CLIENT_SECRET: 'zsecret', ZOHO_REDIRECT_URI: 'https://app.test/api/connectors/oauth/zohobooks'
} as NodeJS.ProcessEnv;

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };
function mock(handlers: Record<string, (c: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const call = { url, ...init };
    calls.push(call);
    const key = Object.keys(handlers).find(k => url.startsWith(k));
    const reply = key ? handlers[key](call) : { status: 404, body: {} };
    const status = reply.status ?? 200;
    return { ok: status < 300, status, json: async () => reply.body };
  };
  return { fetchFn, calls };
}

const handlersFor = (extra: Record<string, (c: Call) => { status?: number; body: unknown }> = {}) => ({
  'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer': () => ({ body: { access_token: 'qb-access', refresh_token: 'qb-refresh', expires_in: 3600 } }),
  'https://api.freshbooks.com/auth/oauth/token': (c: Call) => ({ body: { access_token: c.body?.includes('refresh_token=') ? 'fb-access-2' : 'fb-access', refresh_token: c.body?.includes('refresh_token=') ? 'fb-refresh-2' : 'fb-refresh', expires_in: 43200 } }),
  'https://api.freshbooks.com/auth/api/v1/users/me': () => ({ body: { response: { business_memberships: [{ business: { account_id: 'AbC123', name: 'Test LLC' } }] } } }),
  'https://accounts.zoho.com/oauth/v2/token': (c: Call) => ({ body: c.body?.includes('refresh_token=') ? { access_token: 'z-access-2', expires_in: 3600 } : { access_token: 'z-access', refresh_token: 'z-refresh', expires_in: 3600 } }),
  'https://www.zohoapis.com/books/v3/organizations': () => ({ body: { organizations: [{ organization_id: '9001', name: 'Zoho Test Inc' }] } }),
  ...extra
});

const callbackFor = (url: string, extra: Record<string, string> = {}) => {
  const state = new URL(url).searchParams.get('state')!;
  return new URLSearchParams({ code: 'the-code', state, ...extra });
};

test('each US provider signs in, seals its tokens and finds its organisation', async () => {
  const store = new InMemoryConnectionStore();
  const { fetchFn } = mock(handlersFor());
  const cases: [keyof typeof OAUTH_PROVIDERS, Record<string, string>, string][] = [
    ['quickbooks', { realmId: '123145678901' }, '123145678901'],
    ['freshbooks', {}, 'AbC123'],
    ['zohobooks', {}, '9001']
  ];
  for (const [id, extra, tenant] of cases) {
    const provider = OAUTH_PROVIDERS[id];
    const started = startOAuth(provider, { company_id: 'co1', user_id: 'u1' }, env);
    const url = new URL(started.url);
    assert.equal(url.searchParams.get('client_id'), id === 'quickbooks' ? 'qid' : id === 'freshbooks' ? 'fid' : 'zid');
    const connection = await completeOAuth(provider, store, fetchFn, { callback: callbackFor(started.url, extra), acting_user_id: 'u1' }, env);
    assert.equal(connection.tenant_id, tenant);
    const stored = (await store.get('co1', id))!;
    assert.ok(!JSON.stringify(stored).includes('-refresh') && !JSON.stringify(stored).includes('-access'), 'tokens are sealed at rest');
    assert.ok(openSecret(stored.sealed_refresh_token, env).endsWith('refresh'));
  }
});

test('sign-in state cannot be reused across providers, by another user, or after it expires', async () => {
  const store = new InMemoryConnectionStore();
  const { fetchFn } = mock(handlersFor());
  const qb = startOAuth(OAUTH_PROVIDERS.quickbooks, { company_id: 'co1', user_id: 'u1' }, env, 1_000);
  assert.throws(() => verifyOAuthState(OAUTH_PROVIDERS.freshbooks, qb.state, env, 2_000), /not valid/);
  assert.throws(() => verifyOAuthState(OAUTH_PROVIDERS.quickbooks, qb.state, env, 1_000 + 11 * 60_000), /expired/);
  await assert.rejects(() => completeOAuth(OAUTH_PROVIDERS.quickbooks, store, fetchFn, { callback: callbackFor(qb.url, { realmId: '123145678901' }), acting_user_id: 'someone-else' }, env, 2_000), /someone else/);
  assert.equal(await store.get('co1', 'quickbooks'), null);
  assert.throws(() => startOAuth(OAUTH_PROVIDERS.zohobooks, { company_id: 'c', user_id: 'u' }, { ...env, ZOHO_CLIENT_ID: '' }), /not configured/);
  assert.throws(() => startOAuth(OAUTH_PROVIDERS.zohobooks, { company_id: 'c', user_id: 'u' }, { ...env, FINCLOSE_CONNECTORS_ENABLED: 'false' }), /switched off/);
});

test('a sign-in that returns more than one business is refused instead of guessing', async () => {
  const store = new InMemoryConnectionStore();
  const { fetchFn } = mock(handlersFor({
    'https://api.freshbooks.com/auth/api/v1/users/me': () => ({ body: { response: { business_memberships: [{ business: { account_id: 'A' } }, { business: { account_id: 'B' } }] } } }),
    'https://www.zohoapis.com/books/v3/organizations': () => ({ body: { organizations: [{ organization_id: '1' }, { organization_id: '2' }] } })
  }));
  for (const id of ['freshbooks', 'zohobooks'] as const) {
    const s = startOAuth(OAUTH_PROVIDERS[id], { company_id: 'co1', user_id: 'u1' }, env);
    await assert.rejects(() => completeOAuth(OAUTH_PROVIDERS[id], store, fetchFn, { callback: callbackFor(s.url), acting_user_id: 'u1' }, env), /more than one/);
  }
});

test('expired tokens are refreshed and the new refresh token is kept (FreshBooks rotates, Zoho keeps the old one)', async () => {
  const store = new InMemoryConnectionStore();
  const { fetchFn } = mock(handlersFor());
  const t0 = 1_000_000;
  for (const id of ['freshbooks', 'zohobooks'] as const) {
    const s = startOAuth(OAUTH_PROVIDERS[id], { company_id: 'co1', user_id: 'u1' }, env, t0);
    await completeOAuth(OAUTH_PROVIDERS[id], store, fetchFn, { callback: callbackFor(s.url), acting_user_id: 'u1' }, env, t0);
    const fresh = await oauthAccess(OAUTH_PROVIDERS[id], store, fetchFn, 'co1', env, t0 + 1000);
    assert.ok(fresh.token.endsWith('access'), 'still valid: no refresh');
    const later = await oauthAccess(OAUTH_PROVIDERS[id], store, fetchFn, 'co1', env, t0 + 13 * 3600_000);
    assert.ok(later.token.endsWith('access-2'));
    const stored = (await store.get('co1', id))!;
    assert.equal(openSecret(stored.sealed_refresh_token, env), id === 'freshbooks' ? 'fb-refresh-2' : 'z-refresh');
  }
  await assert.rejects(() => oauthAccess(OAUTH_PROVIDERS.quickbooks, store, fetchFn, 'nobody', env), /not connected/);
});

test('provider statuses say what each US system really is', () => {
  const states = (e: NodeJS.ProcessEnv) => Object.fromEntries(providerStatuses(e).map(p => [p.id, p.state]));
  assert.equal(states(env).quickbooks, 'READ_ADAPTER_UNTESTED_LIVE');
  assert.equal(states(env).freshbooks, 'READ_ADAPTER_UNTESTED_LIVE');
  assert.equal(states(env).zohobooks, 'READ_ADAPTER_UNTESTED_LIVE');
  assert.equal(states({ FINCLOSE_CONNECTORS_ENABLED: 'true' } as NodeJS.ProcessEnv).freshbooks, 'CODED_NEEDS_CREDENTIALS');
  assert.equal(states({} as NodeJS.ProcessEnv).zohobooks, 'CODED_NOT_ENABLED');
  assert.ok(providerStatuses(env).filter(p => ['quickbooks', 'freshbooks', 'zohobooks'].includes(p.id)).every(p => p.can_push === false));
});

test('FreshBooks reader pages, keeps only the period, flags missing receipts, and only reads', async () => {
  const calls: { url: string; method?: string; auth?: string }[] = [];
  const fetchFn = async (url: string, init: { method?: string; headers?: Record<string, string> } = {}) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization });
    const u = new URL(url);
    const page = Number(u.searchParams.get('page'));
    const name = u.pathname.split('/').pop()!;
    const bodies: Record<string, Record<number, unknown[]>> = {
      bills: { 1: [{ id: 11, bill_number: 'B-1', issue_date: '2026-03-01', due_date: '2026-03-15', total_amount: { amount: '250.00', code: 'USD' }, tax_amount: { amount: '0.00', code: 'USD' }, outstanding: { amount: '250.00', code: 'USD' }, attachment: null, vendor: { vendor_name: 'Acme Supply' } }, { id: 12, bill_number: 'OLD', issue_date: '2024-01-01', total_amount: { amount: '5.00', code: 'USD' }, outstanding: { amount: '0.00' } }] },
      invoices: { 1: [{ invoiceid: 21, invoice_number: '0001', create_date: '2026-04-01', due_date: '2026-04-30', amount: { amount: '900.00', code: 'USD' }, outstanding: { amount: '0.00', code: 'USD' }, organization: 'Client Co', display_status: 'paid' }], 2: [{ invoiceid: 22, invoice_number: '0002', create_date: '2026-05-01', due_date: '2026-05-31', amount: { amount: '100.00', code: 'USD' }, outstanding: { amount: '100.00', code: 'USD' }, organization: 'Slow Payer', display_status: 'sent' }] },
      expenses: { 1: [{ expenseid: 31, date: '2026-06-01', amount: { amount: '42.10', code: 'USD' }, vendor: 'Staples', has_receipt: false }] }
    };
    const rows = bodies[name]?.[page] || [];
    return { ok: true, status: 200, json: async () => ({ response: { result: { [name]: rows, page, pages: name === 'invoices' ? 2 : 1, per_page: 100, total: rows.length } } }) };
  };
  const snap = await new FreshBooksLedgerSource({ fetchFn, auth: async () => ({ token: 'tok', tenantId: 'AbC123' }) }).snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.ok(calls.every(c => !c.method || c.method === 'GET'));
  assert.ok(calls.every(c => c.url.includes('/accounting/account/AbC123/') && c.auth === 'Bearer tok'));
  assert.equal(snap.invoices.length, 4, 'one old bill dropped; two invoices from two pages; one bill; one expense');
  assert.equal(snap.invoices.find(i => i.number === 'B-1')!.partner_name, 'Acme Supply');
  assert.equal(snap.invoices.find(i => i.number === '0002')!.outstanding_cents, 10000);
  const review = reviewLedger(snap);
  assert.ok(review.proposals.some(p => p.rule === 'MISSING_DOCUMENT' && /Staples/.test(p.summary)));
  assert.ok(review.proposals.some(p => p.rule === 'OVERDUE_UNPAID' && /Slow Payer/.test(p.summary)));
  assert.ok(review.checks_not_run.some(c => /journal entries/.test(c)));
});

test('Zoho Books reader sends the organisation and token the way Zoho expects (as recalled), pages, and only reads', async () => {
  const calls: { url: string; method?: string; auth?: string }[] = [];
  const fetchFn = async (url: string, init: { method?: string; headers?: Record<string, string> } = {}) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization });
    const u = new URL(url);
    const page = Number(u.searchParams.get('page'));
    const name = u.pathname.replace('/books/v3/', '');
    const bodies: Record<string, unknown> = {
      chartofaccounts: { chartofaccounts: [{ account_id: '1', account_name: 'Checking', account_type: 'bank' }, { account_id: '2', account_name: 'Sales', account_type: 'income' }] },
      'settings/taxes': { taxes: [{ tax_id: 't1', tax_percentage: 8.25 }] },
      bills: page === 1 ? { bills: [{ bill_id: 'b1', bill_number: 'X1', vendor_name: 'Vendor', date: '2026-02-01', due_date: '2026-02-10', total: 100, tax_total: 0, balance: 100, status: 'open' }], page_context: { has_more_page: true } } : { bills: [{ bill_id: 'b2', bill_number: 'X2', vendor_name: 'Vendor', date: '2026-02-02', total: 20, balance: 0, status: 'void' }], page_context: { has_more_page: false } },
      invoices: { invoices: [{ invoice_id: 'i1', invoice_number: 'INV-1', customer_name: 'Customer', date: '2026-03-01', due_date: '2026-03-31', total: 500, balance: 0, status: 'paid' }], page_context: { has_more_page: false } }
    };
    return { ok: true, status: 200, json: async () => bodies[name] || {} };
  };
  const snap = await new ZohoLedgerSource({ fetchFn, auth: async () => ({ token: 'ztok', tenantId: '9001' }) }).snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.ok(calls.every(c => !c.method || c.method === 'GET'));
  assert.ok(calls.every(c => c.auth === 'Zoho-oauthtoken ztok' && new URL(c.url).searchParams.get('organization_id') === '9001'));
  assert.equal(snap.accounts.find(a => a.code === '1')!.type, 'ASSET');
  assert.equal(snap.vat_codes[0].rate_percent, 8.25);
  assert.deepEqual(snap.invoices.map(i => i.number).sort(), ['INV-1', 'X1'], 'the void bill is left out');
  assert.equal(snap.invoices.find(i => i.number === 'X1')!.total_cents, 10000);
  assert.ok(reviewLedger(snap).checks_not_run.some(c => /memory of Zoho/.test(c)));
});
