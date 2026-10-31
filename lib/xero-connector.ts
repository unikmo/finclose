import crypto from 'node:crypto';
import type { JournalView } from './chart-of-accounts';
import { openSecret, sealSecret, xeroConfigured, connectorsEnabled, type Connection, type ConnectionStore } from './connectors';

// Xero connector: OAuth 2.0 authorisation-code flow with PKCE, token refresh, and "push the
// proposed journal as DRAFT manual journals". It never posts: Xero keeps a draft until a person
// approves it there. Everything here ran only against a mock of Xero (tests/xero-connector.test.ts);
// endpoint paths and field names are from Xero's public developer documentation as recalled and are
// UNVERIFIED against the live service. Scopes are configurable (XERO_SCOPES) because Xero has been
// changing its scope model.

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const API_BASE = 'https://api.xero.com/api.xro/2.0';
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

const b64url = (buffer: Buffer) => buffer.toString('base64url');

function requireReady(env: NodeJS.ProcessEnv) {
  if (!connectorsEnabled(env)) throw httpError('connectors are switched off on this server', 403);
  if (!xeroConfigured(env)) throw httpError('Xero is not configured on this server', 503);
}

function stateKey(env: NodeJS.ProcessEnv) {
  return crypto.createHash('sha256').update(`xero-state:${env.FINCLOSE_TOKEN_KEY}`).digest();
}
const sign = (payload: string, env: NodeJS.ProcessEnv) => b64url(crypto.createHmac('sha256', stateKey(env)).update(payload).digest());
// The PKCE verifier is derived from the state's nonce, so nothing has to be stored between the two requests.
const verifierFor = (nonce: string, env: NodeJS.ProcessEnv) => b64url(crypto.createHmac('sha256', stateKey(env)).update(`pkce:${nonce}`).digest());

export function startXeroAuthorisation(args: { company_id: string; user_id: string }, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  requireReady(env);
  const nonce = b64url(crypto.randomBytes(16));
  const payload = b64url(Buffer.from(JSON.stringify({ c: args.company_id, u: args.user_id, n: nonce, e: now + STATE_LIFETIME_MS })));
  const state = `${payload}.${sign(payload, env)}`;
  const challenge = b64url(crypto.createHash('sha256').update(verifierFor(nonce, env)).digest());
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: String(env.XERO_CLIENT_ID),
    redirect_uri: String(env.XERO_REDIRECT_URI),
    scope: String(env.XERO_SCOPES || 'offline_access accounting.transactions'),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();
  return { url: url.toString(), state };
}

export function verifyXeroState(state: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): { company_id: string; user_id: string; nonce: string } {
  const [payload, mac] = String(state).split('.');
  if (!payload || !mac) throw httpError('the sign-in link is not valid', 400);
  const expected = Buffer.from(sign(payload, env));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw httpError('the sign-in link is not valid', 400);
  let data: { c: string; u: string; n: string; e: number };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw httpError('the sign-in link is not valid', 400); }
  if (!data.e || now > data.e) throw httpError('the sign-in link has expired; start again', 400);
  return { company_id: data.c, user_id: data.u, nonce: data.n };
}

async function tokenRequest(fetchFn: FetchLike, form: Record<string, string>, env: NodeJS.ProcessEnv) {
  const basic = Buffer.from(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`).toString('base64');
  const response = await fetchFn(TOKEN_URL, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  if (!response.ok) throw httpError(`Xero refused the sign-in (code ${response.status}). Connect again.`, 502);
  const body = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!body.access_token || !body.refresh_token) throw httpError('Xero returned an unexpected sign-in reply', 502);
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_in: Number(body.expires_in) || 1800 };
}

export async function completeXeroAuthorisation(
  store: ConnectionStore,
  fetchFn: FetchLike,
  input: { code: string; state: string; acting_user_id: string },
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): Promise<Connection> {
  requireReady(env);
  const state = verifyXeroState(input.state, env, now);
  if (state.user_id !== input.acting_user_id) throw httpError('this sign-in link was started by someone else', 403);
  if (!input.code) throw httpError('Xero did not send a code', 400);
  const tokens = await tokenRequest(fetchFn, { grant_type: 'authorization_code', code: input.code, redirect_uri: String(env.XERO_REDIRECT_URI), code_verifier: verifierFor(state.nonce, env) }, env);
  const response = await fetchFn(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' } });
  if (!response.ok) throw httpError(`Xero would not list the organisations (code ${response.status})`, 502);
  const tenants = (await response.json()) as { tenantId?: string; tenantName?: string; tenantType?: string }[];
  const organisations = (Array.isArray(tenants) ? tenants : []).filter(t => t.tenantId && (!t.tenantType || t.tenantType === 'ORGANISATION'));
  if (organisations.length === 0) throw httpError('no Xero organisation was shared with FinClose', 409);
  if (organisations.length > 1) throw httpError('more than one Xero organisation was shared. Connect again and tick only the one for this company', 409);
  const connection: Connection = {
    company_id: state.company_id,
    provider: 'xero',
    tenant_id: organisations[0].tenantId!,
    tenant_name: String(organisations[0].tenantName || '').slice(0, 120),
    sealed_refresh_token: sealSecret(tokens.refresh_token, env),
    sealed_access_token: sealSecret(tokens.access_token, env),
    access_expires_at: now + tokens.expires_in * 1000,
    connected_by: input.acting_user_id,
    connected_at: now
  };
  await store.put(connection);
  return connection;
}

async function liveAccessToken(store: ConnectionStore, fetchFn: FetchLike, connection: Connection, env: NodeJS.ProcessEnv, now: number): Promise<string> {
  if (connection.access_expires_at - now > REFRESH_MARGIN_MS) return openSecret(connection.sealed_access_token, env);
  const tokens = await tokenRequest(fetchFn, { grant_type: 'refresh_token', refresh_token: openSecret(connection.sealed_refresh_token, env) }, env);
  // Xero rotates the refresh token: the new one replaces the old one at once, or the connection is lost.
  await store.put({ ...connection, sealed_refresh_token: sealSecret(tokens.refresh_token, env), sealed_access_token: sealSecret(tokens.access_token, env), access_expires_at: now + tokens.expires_in * 1000 });
  return tokens.access_token;
}

// Used by the read adapter (xero-ledger.ts): a valid access token and the connected organisation.
export async function xeroAccess(store: ConnectionStore, fetchFn: FetchLike, companyId: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<{ token: string; tenantId: string }> {
  requireReady(env);
  const connection = await store.get(companyId, 'xero');
  if (!connection) throw httpError('this company is not connected to Xero', 409);
  return { token: await liveAccessToken(store, fetchFn, connection, env, now), tenantId: connection.tenant_id };
}

export type PushResult ={ already_pushed: boolean; journals: { date: string; external_id: string | null }[]; organisation: string };

// One DRAFT manual journal per day, each balanced on its own. Re-pushing the same pack content is a
// no-op: the pack hash identifies the content, and a changed pack has a new hash.
export async function pushJournalAsDraft(
  store: ConnectionStore,
  fetchFn: FetchLike,
  args: { company_id: string; journal: JournalView; pack_hash: string; narration: string },
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): Promise<PushResult> {
  requireReady(env);
  const connection = await store.get(args.company_id, 'xero');
  if (!connection) throw httpError('this company is not connected to Xero', 409);
  if (!args.journal.balanced || args.journal.lines.length === 0) throw httpError('the proposed journal is empty or does not balance, so it was not sent', 409);
  const earlier = (await store.listPushed(args.company_id, 'xero')).find(p => p.pack_hash === args.pack_hash);
  if (earlier) return { already_pushed: true, journals: [{ date: '', external_id: earlier.external_id }], organisation: connection.tenant_name };

  const byDay = new Map<string, JournalView['lines']>();
  for (const l of args.journal.lines) byDay.set(l.date, [...(byDay.get(l.date) || []), l]);
  const journals = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, lines]) => ({
    Narration: `${args.narration} ${date} [${args.pack_hash.slice(0, 12)}]`.slice(0, 250),
    Date: date,
    Status: 'DRAFT',
    LineAmountTypes: 'NoTax',
    JournalLines: lines.map(l => ({ LineAmount: Number(((l.debit_cents - l.credit_cents) / 100).toFixed(2)), AccountCode: l.account_code, Description: l.memo.slice(0, 250), TaxType: 'NONE' }))
  }));
  for (const j of journals) {
    const sum = Math.round(j.JournalLines.reduce((s, l) => s + l.LineAmount * 100, 0));
    if (sum !== 0) throw httpError(`the lines for ${j.Date} do not balance, so nothing was sent`, 409);
  }

  const token = await liveAccessToken(store, fetchFn, connection, env, now);
  const response = await fetchFn(`${API_BASE}/ManualJournals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'xero-tenant-id': connection.tenant_id, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ManualJournals: journals })
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 200);
    throw httpError(`Xero did not accept the journal (code ${response.status}): ${detail}`, response.status === 401 ? 409 : 502);
  }
  const body = (await response.json()) as { ManualJournals?: { ManualJournalID?: string }[] };
  const created = body.ManualJournals || [];
  const ids = journals.map((j, i) => ({ date: j.Date, external_id: created[i]?.ManualJournalID || null }));
  await store.recordPush(args.company_id, 'xero', { pack_hash: args.pack_hash, external_id: ids.map(i => i.external_id).filter(Boolean).join(',') || 'unknown', pushed_at: now });
  return { already_pushed: false, journals: ids, organisation: connection.tenant_name };
}
