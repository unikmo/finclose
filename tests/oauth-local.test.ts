import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { beginSignIn, localAccess, signInState, tokenFile } from '../local/oauth-local';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'finclose-oauth-'));
const env = { ...process.env, FINCLOSE_HOME: home, FINCLOSE_XERO_CLIENT_ID: 'public-client-id', FINCLOSE_CALLBACK_PORT: '18731' } as NodeJS.ProcessEnv;

type Call = { url: string; body: URLSearchParams };
function mock(calls: Call[]) {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (url.includes('/connect/token')) {
      const body = new URLSearchParams(init?.body || '');
      calls.push({ url, body });
      return { ok: true, status: 200, json: async () => ({ access_token: `at-${calls.length}`, refresh_token: `rt-${calls.length}`, expires_in: 1800 }) };
    }
    if (url.endsWith('/connections')) return { ok: true, status: 200, json: async () => [{ tenantId: 'ten-1', tenantName: 'Acme Ltd', tenantType: 'ORGANISATION' }] };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('sign-in uses PKCE with no client secret, keeps tokens on this computer, and refreshes', async () => {
  const calls: Call[] = [];
  const fetchFn = mock(calls);
  const { url } = await beginSignIn('xero', fetchFn, env);
  const auth = new URL(url);
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('client_id'), 'public-client-id');
  assert.equal(signInState('xero'), 'waiting');

  // the browser coming back to the loopback address
  const back = await fetch(`http://127.0.0.1:18731/callback?code=abc&state=${auth.searchParams.get('state')}`);
  assert.equal(back.status, 200);
  assert.equal(signInState('xero'), 'done');

  const exchange = calls[0].body;
  assert.equal(exchange.get('client_secret'), null);
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(crypto.createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url'), auth.searchParams.get('code_challenge'));

  assert.ok(fs.existsSync(tokenFile(env)));
  const first = await localAccess('xero', fetchFn, env, Date.now());
  assert.deepEqual(first, { token: 'at-1', tenantId: 'ten-1' });

  const later = await localAccess('xero', fetchFn, env, Date.now() + 3_600_000);
  assert.equal(later.token, 'at-2');
  assert.equal(calls[1].body.get('grant_type'), 'refresh_token');
  assert.equal(calls[1].body.get('refresh_token'), 'rt-1');
  assert.equal(calls[1].body.get('client_secret'), null);
  // the rotated refresh token was saved at once
  assert.equal(JSON.parse(fs.readFileSync(tokenFile(env), 'utf8')).xero.refresh_token, 'rt-2');
});

test('a callback with the wrong state is refused and nothing is saved', async () => {
  fs.rmSync(tokenFile(env), { force: true });
  const calls: Call[] = [];
  await beginSignIn('xero', mock(calls), env);
  const back = await fetch('http://127.0.0.1:18731/callback?code=abc&state=forged');
  assert.equal(back.status, 400);
  assert.equal(signInState('xero'), 'failed');
  assert.equal(calls.length, 0);
  assert.equal(fs.existsSync(tokenFile(env)), false);
});

test('a review without sign-in says so', async () => {
  fs.rmSync(tokenFile(env), { force: true });
  await assert.rejects(localAccess('xero', mock([]), env), /not connected to Xero/);
});
