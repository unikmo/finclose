import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { OAUTH_PROVIDERS } from '../lib/oauth-connect';

// Sign-in to the client's accounting system from the client's OWN computer, with no app secret.
// Only providers whose documentation describes PKCE for desktop apps are here:
//  - Xero: PKCE "native app" flow; no client secret at any point (Xero developer blog, "Introducing PKCE").
//  - Zoho Books: "mobile and desktop apps" flow; PKCE replaces the client secret (Zoho OAuth docs).
// QuickBooks Online and FreshBooks are NOT here: their token calls need a client secret and neither
// provider's pages we could read describe a secretless flow. Shipping our secret to client computers
// would leak it, so those two stay on the hosted path until the providers confirm in writing.
//
// The tokens are kept in a file only for this user on this computer (mode 0600 where the system has
// modes). They never go to FinClose.

export type LocalProviderId = 'xero' | 'zohobooks';
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const LOCAL_PROVIDERS: Record<LocalProviderId, {
  name: string; client_id_env: string;
  authorize_url(env: NodeJS.ProcessEnv): string; token_url(env: NodeJS.ProcessEnv): string;
  scopes(env: NodeJS.ProcessEnv): string; separator: ' ' | ','; extra?: Record<string, string>;
  tenant(fetchFn: FetchLike, token: string, env: NodeJS.ProcessEnv): Promise<{ tenant_id: string; tenant_name: string }>;
}> = {
  xero: {
    name: 'Xero', client_id_env: 'FINCLOSE_XERO_CLIENT_ID',
    authorize_url: () => 'https://login.xero.com/identity/connect/authorize',
    token_url: () => 'https://identity.xero.com/connect/token',
    scopes: env => String(env.FINCLOSE_XERO_SCOPES || 'offline_access accounting.transactions.read accounting.settings.read accounting.reports.read'),
    separator: ' ',
    async tenant(fetchFn, token) {
      const res = await fetchFn('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Xero would not list the organisations (code ${res.status})`);
      const list = ((await res.json()) as { tenantId?: string; tenantName?: string; tenantType?: string }[]).filter(t => t.tenantId && (!t.tenantType || t.tenantType === 'ORGANISATION'));
      if (list.length === 0) throw new Error('no Xero organisation was shared. Connect again and tick the company');
      if (list.length > 1) throw new Error('more than one Xero organisation was shared. Connect again and tick only the one company');
      return { tenant_id: list[0].tenantId!, tenant_name: String(list[0].tenantName || '').slice(0, 120) };
    }
  },
  zohobooks: {
    name: 'Zoho Books', client_id_env: 'FINCLOSE_ZOHO_CLIENT_ID',
    authorize_url: env => `${String(env.FINCLOSE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com')}/oauth/v2/auth`,
    token_url: env => `${String(env.FINCLOSE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com')}/oauth/v2/token`,
    scopes: env => String(env.FINCLOSE_ZOHO_SCOPES || OAUTH_PROVIDERS.zohobooks.scopes(process.env)),
    separator: ',', extra: { access_type: 'offline', prompt: 'consent' },
    tenant: (fetchFn, token, env) => OAUTH_PROVIDERS.zohobooks.resolve_tenant(fetchFn, token, new URLSearchParams(), { ...env, ZOHO_API_URL: env.FINCLOSE_ZOHO_API_URL })
  }
};

export const isLocalProvider = (id: string): id is LocalProviderId => Object.prototype.hasOwnProperty.call(LOCAL_PROVIDERS, id);

type Saved = { tenant_id: string; tenant_name: string; refresh_token: string; access_token: string; access_expires_at: number };
export const tokenFile = (env: NodeJS.ProcessEnv = process.env) => path.join(String(env.FINCLOSE_HOME || path.join(os.homedir(), '.finclose')), 'connections.json');

function readAll(file: string): Record<string, Saved> {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function save(file: string, id: LocalProviderId, value: Saved) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ ...readAll(file), [id]: value }), { mode: 0o600 });
}

const b64url = (b: Buffer) => b.toString('base64url');
export const callbackUrl = (env: NodeJS.ProcessEnv = process.env) => `http://localhost:${Number(env.FINCLOSE_CALLBACK_PORT) || 8731}/callback`;

function clientId(id: LocalProviderId, env: NodeJS.ProcessEnv) {
  const p = LOCAL_PROVIDERS[id], v = String(env[p.client_id_env] || '').trim();
  if (!v) throw new Error(`${p.client_id_env} is not set. See docs/CLIENT_SETUP.md.`);
  return v;
}

export function authorizeUrl(id: LocalProviderId, env: NodeJS.ProcessEnv, pkce: { verifier: string; state: string }) {
  const p = LOCAL_PROVIDERS[id];
  const url = new URL(p.authorize_url(env));
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId(id, env), redirect_uri: callbackUrl(env), scope: p.scopes(env), state: pkce.state,
    code_challenge: b64url(crypto.createHash('sha256').update(pkce.verifier).digest()), code_challenge_method: 'S256', ...(p.extra || {})
  }).toString();
  return url.toString();
}

async function tokens(id: LocalProviderId, fetchFn: FetchLike, form: Record<string, string>, env: NodeJS.ProcessEnv) {
  const p = LOCAL_PROVIDERS[id];
  const res = await fetchFn(p.token_url(env), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId(id, env), ...form }).toString()
  });
  if (!res.ok) throw new Error(`${p.name} refused the sign-in (code ${res.status}). Connect again.`);
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error(`${p.name} returned an unexpected sign-in reply`);
  return { access_token: body.access_token, refresh_token: body.refresh_token || '', expires_in: Number(body.expires_in) || 3600 };
}

// Pending sign-ins, one per provider. The caller opens `url`; the loopback server finishes the exchange.
const pending = new Map<LocalProviderId, { done: boolean; error?: string; close(): void }>();
export const signInState = (id: LocalProviderId) => { const p = pending.get(id); return p ? (p.error ? 'failed' : p.done ? 'done' : 'waiting') : 'none'; };
export const signInError = (id: LocalProviderId) => pending.get(id)?.error;

export async function beginSignIn(id: LocalProviderId, fetchFn: FetchLike, env: NodeJS.ProcessEnv = process.env, now = () => Date.now()): Promise<{ url: string }> {
  pending.get(id)?.close();
  const verifier = b64url(crypto.randomBytes(48)), state = b64url(crypto.randomBytes(16));
  const url = authorizeUrl(id, env, { verifier, state });
  const entry = { done: false, error: undefined as string | undefined, close: () => { for (const s of servers) s.close(); clearTimeout(timer); } };
  const handle: http.RequestListener = async (req, res) => {
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
    try {
      if (u.searchParams.get('state') !== state) throw new Error('the sign-in did not match; start again');
      if (u.searchParams.get('error')) throw new Error(`${LOCAL_PROVIDERS[id].name} said: ${u.searchParams.get('error')}`);
      const code = u.searchParams.get('code');
      if (!code) throw new Error('no code came back');
      const t = await tokens(id, fetchFn, { grant_type: 'authorization_code', code, redirect_uri: callbackUrl(env), code_verifier: verifier }, env);
      if (!t.refresh_token) throw new Error('lasting access was not granted. Connect again and accept offline access');
      const tenant = await LOCAL_PROVIDERS[id].tenant(fetchFn, t.access_token, env);
      save(tokenFile(env), id, { ...tenant, refresh_token: t.refresh_token, access_token: t.access_token, access_expires_at: now() + t.expires_in * 1000 });
      entry.done = true;
      res.writeHead(200, { 'content-type': 'text/plain' }).end('FinClose is connected. You can close this tab and return to Claude.');
    } catch (e) {
      entry.error = (e as Error).message;
      res.writeHead(400, { 'content-type': 'text/plain' }).end(`FinClose could not connect: ${entry.error}`);
    }
    entry.close();
  };
  const servers: http.Server[] = [];
  const port = Number(env.FINCLOSE_CALLBACK_PORT) || 8731;
  const listen = (host: string) => new Promise<void>((resolve, reject) => {
    const s = http.createServer(handle);
    s.once('error', reject);
    s.listen(port, host, () => { servers.push(s); resolve(); });
  });
  await listen('127.0.0.1');
  await listen('::1').catch(() => undefined);
  const timer = setTimeout(() => { if (!entry.done && !entry.error) entry.error = 'the sign-in was not finished within 10 minutes'; entry.close(); }, 10 * 60_000);
  timer.unref();
  pending.set(id, entry);
  return { url };
}

// A valid access token and organisation for a review, refreshing when needed.
export async function localAccess(id: LocalProviderId, fetchFn: FetchLike, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<{ token: string; tenantId: string }> {
  const file = tokenFile(env), saved = readAll(file)[id];
  if (!saved) throw new Error(`not connected to ${LOCAL_PROVIDERS[id].name}. Run finclose_connect first`);
  if (saved.access_expires_at - now > 60_000) return { token: saved.access_token, tenantId: saved.tenant_id };
  const t = await tokens(id, fetchFn, { grant_type: 'refresh_token', refresh_token: saved.refresh_token }, env);
  // Xero rotates the refresh token: the new one is saved at once or the connection is lost.
  save(file, id, { ...saved, refresh_token: t.refresh_token || saved.refresh_token, access_token: t.access_token, access_expires_at: now + t.expires_in * 1000 });
  return { token: t.access_token, tenantId: saved.tenant_id };
}
