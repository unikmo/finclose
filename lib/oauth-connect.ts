import crypto from 'node:crypto';
import { connectorsEnabled, openSecret, sealSecret, type Connection, type ConnectionStore, type ProviderId } from './connectors';

// One OAuth 2.0 code-flow implementation for the US-market systems (QuickBooks Online, FreshBooks,
// Zoho Books). Xero keeps its own file because it was written first and uses PKCE. Tokens are sealed
// at rest exactly as for Xero (connectors.ts). The state parameter is HMAC-signed so nothing is
// stored between the redirect out and the redirect back.
//
// What was checked and what was not:
//  - FreshBooks: authorize URL, token URL, client secret in the request body, one-time refresh
//    tokens, and the bills scope name come from FreshBooks' own pages (read 2026-10-31). The call
//    that finds the account id is from memory.
//  - QuickBooks and Zoho Books: URLs, scopes and the way the organisation is found are from memory
//    (Zoho's documentation refused to load). Nothing has run against a real service.

export type OAuthProviderId = Extract<ProviderId, 'quickbooks' | 'freshbooks' | 'zohobooks'>;

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type OAuthProvider = {
  id: OAuthProviderId;
  name: string;
  env_prefix: string; // <PREFIX>_CLIENT_ID, _CLIENT_SECRET, _REDIRECT_URI
  authorize_url(env: NodeJS.ProcessEnv): string;
  token_url(env: NodeJS.ProcessEnv): string;
  scopes(env: NodeJS.ProcessEnv): string;
  scope_separator: ' ' | ',';
  client_auth: 'basic' | 'body';
  extra_authorize_params?: Record<string, string>;
  resolve_tenant(fetchFn: FetchLike, accessToken: string, callback: URLSearchParams, env: NodeJS.ProcessEnv): Promise<{ tenant_id: string; tenant_name: string }>;
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

async function getJson(fetchFn: FetchLike, url: string, headers: Record<string, string>, what: string) {
  const response = await fetchFn(url, { headers: { Accept: 'application/json', ...headers } });
  if (!response.ok) throw httpError(`${what} did not answer (code ${response.status})`, 502);
  return obj(await response.json());
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  quickbooks: {
    id: 'quickbooks', name: 'QuickBooks Online', env_prefix: 'QUICKBOOKS',
    authorize_url: () => 'https://appcenter.intuit.com/connect/oauth2',
    token_url: () => 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scopes: env => String(env.QUICKBOOKS_SCOPES || 'com.intuit.quickbooks.accounting'),
    scope_separator: ' ', client_auth: 'basic',
    // QuickBooks sends the company (realm) id back on the redirect itself.
    async resolve_tenant(_fetch, _token, callback) {
      const realm = String(callback.get('realmId') || '');
      if (!/^\d{5,20}$/.test(realm)) throw httpError('QuickBooks did not say which company was connected', 502);
      return { tenant_id: realm, tenant_name: `QuickBooks company ${realm}` };
    }
  },
  freshbooks: {
    id: 'freshbooks', name: 'FreshBooks', env_prefix: 'FRESHBOOKS',
    authorize_url: () => 'https://auth.freshbooks.com/oauth/authorize/',
    token_url: () => 'https://api.freshbooks.com/auth/oauth/token',
    scopes: env => String(env.FRESHBOOKS_SCOPES || 'user:profile:read user:bills:read user:invoices:read user:expenses:read'),
    scope_separator: ' ', client_auth: 'body',
    async resolve_tenant(fetchFn, token) {
      const me = await getJson(fetchFn, 'https://api.freshbooks.com/auth/api/v1/users/me', { Authorization: `Bearer ${token}` }, 'FreshBooks');
      const memberships = (Array.isArray(obj(me.response).business_memberships) ? (obj(me.response).business_memberships as unknown[]) : []).map(m => obj(obj(m).business));
      const accounts = memberships.filter(b => b.account_id);
      if (accounts.length === 0) throw httpError('FreshBooks did not list a business account for this sign-in', 409);
      if (accounts.length > 1) throw httpError('this FreshBooks sign-in has more than one business. Connect again with a user that has only the one for this company', 409);
      return { tenant_id: String(accounts[0].account_id), tenant_name: String(accounts[0].name || 'FreshBooks business').slice(0, 120) };
    }
  },
  zohobooks: {
    id: 'zohobooks', name: 'Zoho Books', env_prefix: 'ZOHO',
    authorize_url: env => `${String(env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com')}/oauth/v2/auth`,
    token_url: env => `${String(env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com')}/oauth/v2/token`,
    scopes: env => String(env.ZOHO_SCOPES || 'ZohoBooks.accountants.READ,ZohoBooks.bills.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ,ZohoBooks.banking.READ'),
    scope_separator: ',', client_auth: 'body',
    extra_authorize_params: { access_type: 'offline', prompt: 'consent' },
    async resolve_tenant(fetchFn, token, _cb, env) {
      const base = String(env.ZOHO_API_URL || 'https://www.zohoapis.com');
      const body = await getJson(fetchFn, `${base}/books/v3/organizations`, { Authorization: `Zoho-oauthtoken ${token}` }, 'Zoho Books');
      const orgs = (Array.isArray(body.organizations) ? (body.organizations as unknown[]) : []).map(obj).filter(o => o.organization_id);
      if (orgs.length === 0) throw httpError('Zoho Books did not list an organisation for this sign-in', 409);
      if (orgs.length > 1) throw httpError('this Zoho sign-in has more than one organisation. Connect again with a user that has only the one for this company', 409);
      return { tenant_id: String(orgs[0].organization_id), tenant_name: String(orgs[0].name || 'Zoho organisation').slice(0, 120) };
    }
  }
};

export const isOAuthProvider = (id: string): id is OAuthProviderId => Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, id);

const envName = (p: OAuthProvider, suffix: string) => `${p.env_prefix}_${suffix}`;
export function oauthConfigured(p: OAuthProvider, env: NodeJS.ProcessEnv = process.env) {
  return Boolean(String(env[envName(p, 'CLIENT_ID')] || '').trim() && String(env[envName(p, 'CLIENT_SECRET')] || '').trim() && String(env[envName(p, 'REDIRECT_URI')] || '').trim() && String(env.FINCLOSE_TOKEN_KEY || '').length >= 32);
}
function requireReady(p: OAuthProvider, env: NodeJS.ProcessEnv) {
  if (!connectorsEnabled(env)) throw httpError('connectors are switched off on this server', 403);
  if (!oauthConfigured(p, env)) throw httpError(`${p.name} is not configured on this server`, 503);
}

const b64url = (b: Buffer) => b.toString('base64url');
const stateKey = (p: OAuthProvider, env: NodeJS.ProcessEnv) => crypto.createHash('sha256').update(`oauth-state:${p.id}:${env.FINCLOSE_TOKEN_KEY}`).digest();
const signState = (p: OAuthProvider, payload: string, env: NodeJS.ProcessEnv) => b64url(crypto.createHmac('sha256', stateKey(p, env)).update(payload).digest());
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

export function startOAuth(p: OAuthProvider, args: { company_id: string; user_id: string }, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  requireReady(p, env);
  const payload = b64url(Buffer.from(JSON.stringify({ c: args.company_id, u: args.user_id, n: b64url(crypto.randomBytes(12)), e: now + STATE_LIFETIME_MS })));
  const state = `${payload}.${signState(p, payload, env)}`;
  const url = new URL(p.authorize_url(env));
  url.search = new URLSearchParams({
    response_type: 'code', client_id: String(env[envName(p, 'CLIENT_ID')]), redirect_uri: String(env[envName(p, 'REDIRECT_URI')]),
    scope: p.scopes(env), state, ...(p.extra_authorize_params || {})
  }).toString();
  return { url: url.toString(), state };
}

export function verifyOAuthState(p: OAuthProvider, state: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): { company_id: string; user_id: string } {
  const [payload, mac] = String(state).split('.');
  if (!payload || !mac) throw httpError('the sign-in link is not valid', 400);
  const expected = Buffer.from(signState(p, payload, env));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw httpError('the sign-in link is not valid', 400);
  let data: { c: string; u: string; e: number };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw httpError('the sign-in link is not valid', 400); }
  if (!data.e || now > data.e) throw httpError('the sign-in link has expired; start again', 400);
  return { company_id: data.c, user_id: data.u };
}

async function tokenRequest(p: OAuthProvider, fetchFn: FetchLike, form: Record<string, string>, env: NodeJS.ProcessEnv) {
  const id = String(env[envName(p, 'CLIENT_ID')]), secret = String(env[envName(p, 'CLIENT_SECRET')]);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const fields = { ...form };
  if (p.client_auth === 'basic') headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  else { fields.client_id = id; fields.client_secret = secret; }
  const response = await fetchFn(p.token_url(env), { method: 'POST', headers, body: new URLSearchParams(fields).toString() });
  if (!response.ok) throw httpError(`${p.name} refused the sign-in (code ${response.status}). Connect again.`, 502);
  const body = obj(await response.json());
  if (!body.access_token) throw httpError(`${p.name} returned an unexpected sign-in reply`, 502);
  return { access_token: String(body.access_token), refresh_token: body.refresh_token ? String(body.refresh_token) : '', expires_in: Number(body.expires_in) || 3600 };
}

export async function completeOAuth(
  p: OAuthProvider, store: ConnectionStore, fetchFn: FetchLike,
  input: { callback: URLSearchParams; acting_user_id: string }, env: NodeJS.ProcessEnv = process.env, now = Date.now()
): Promise<Connection> {
  requireReady(p, env);
  const state = verifyOAuthState(p, String(input.callback.get('state') || ''), env, now);
  if (state.user_id !== input.acting_user_id) throw httpError('this sign-in link was started by someone else', 403);
  const code = String(input.callback.get('code') || '');
  if (!code) throw httpError(`${p.name} did not send a code`, 400);
  const tokens = await tokenRequest(p, fetchFn, { grant_type: 'authorization_code', code, redirect_uri: String(env[envName(p, 'REDIRECT_URI')]) }, env);
  if (!tokens.refresh_token) throw httpError(`${p.name} did not allow lasting access. Connect again and accept the offline access it asks for`, 502);
  const tenant = await p.resolve_tenant(fetchFn, tokens.access_token, input.callback, env);
  const connection: Connection = {
    company_id: state.company_id, provider: p.id, tenant_id: tenant.tenant_id, tenant_name: tenant.tenant_name,
    sealed_refresh_token: sealSecret(tokens.refresh_token, env), sealed_access_token: sealSecret(tokens.access_token, env),
    access_expires_at: now + tokens.expires_in * 1000, connected_by: input.acting_user_id, connected_at: now
  };
  await store.put(connection);
  return connection;
}

// A valid access token and the connected organisation. Refresh tokens that rotate (FreshBooks, and
// QuickBooks when it sends a new one) are saved at once; Zoho keeps the old one.
export async function oauthAccess(p: OAuthProvider, store: ConnectionStore, fetchFn: FetchLike, companyId: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<{ token: string; tenantId: string }> {
  requireReady(p, env);
  const connection = await store.get(companyId, p.id);
  if (!connection) throw httpError(`this company is not connected to ${p.name}`, 409);
  if (connection.access_expires_at - now > REFRESH_MARGIN_MS) return { token: openSecret(connection.sealed_access_token, env), tenantId: connection.tenant_id };
  const old = openSecret(connection.sealed_refresh_token, env);
  const tokens = await tokenRequest(p, fetchFn, { grant_type: 'refresh_token', refresh_token: old }, env);
  await store.put({ ...connection, sealed_refresh_token: sealSecret(tokens.refresh_token || old, env), sealed_access_token: sealSecret(tokens.access_token, env), access_expires_at: now + tokens.expires_in * 1000 });
  return { token: tokens.access_token, tenantId: connection.tenant_id };
}
