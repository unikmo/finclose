import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFirebaseServiceAccountEnvironment } from '../lib/firebase-environment.ts';
import { activeFirebaseWebApps, chooseFirebaseWebApp } from '../lib/firebase-web-config-selection.ts';
import { waitForSessionRevocation } from '../lib/firebase-revocation-verification.ts';

test('Firebase service-account environment distinguishes missing, masked, invalid and present values', () => {
  assert.deepEqual(inspectFirebaseServiceAccountEnvironment(''), {
    status: 'MISSING',
    project_id: null,
    error_code: 'FIREBASE_ADMIN_CREDENTIAL_MISSING'
  });

  assert.deepEqual(inspectFirebaseServiceAccountEnvironment('[SENSITIVE]'), {
    status: 'MASKED_BY_VERCEL',
    project_id: null,
    error_code: 'FIREBASE_ADMIN_CREDENTIAL_UNAVAILABLE_IN_LOCAL_VERCEL_ENV'
  });

  assert.equal(inspectFirebaseServiceAccountEnvironment('{bad json').status, 'INVALID');
  assert.equal(inspectFirebaseServiceAccountEnvironment('{"project_id":"p"}').status, 'INVALID');

  const present = inspectFirebaseServiceAccountEnvironment(JSON.stringify({
    project_id: 'theantibalcony',
    client_email: 'service@example.invalid',
    private_key: 'not-a-real-key'
  }));
  assert.deepEqual(present, { status: 'PRESENT', project_id: 'theantibalcony' });
  assert.equal(JSON.stringify(present).includes('not-a-real-key'), false);
});

test('deleted Firebase Web Apps are excluded from discovery candidates', () => {
  const active = activeFirebaseWebApps([
    { appId: 'a', state: 'ACTIVE' },
    { appId: 'b', state: 'DELETED' },
    { appId: 'c' }
  ]);
  assert.deepEqual(active.map(app => app.appId), ['a', 'c']);
});

test('explicit Firebase Web App ID is authoritative', () => {
  const apps = [
    { name: 'projects/p/webApps/1:one:web:aaa', appId: '1:one:web:aaa', displayName: 'Other' },
    { name: 'projects/p/webApps/1:two:web:bbb', appId: '1:two:web:bbb', displayName: 'FinClose' }
  ];
  const selected = chooseFirebaseWebApp(apps, '1:one:web:aaa', ['finclose-lab-preview.vercel.app']);
  assert.equal(selected.reason, 'EXPLICIT_APP_ID');
  assert.equal(selected.app?.appId, '1:one:web:aaa');

  const missing = chooseFirebaseWebApp(apps, 'does-not-exist', []);
  assert.equal(missing.reason, 'EXPLICIT_APP_ID_NOT_FOUND');
  assert.equal(missing.app, null);
});

test('a single Firebase Web App is selected without guessing', () => {
  const selected = chooseFirebaseWebApp([
    { name: 'projects/p/webApps/only', appId: 'only', displayName: 'Anything' }
  ], '', []);
  assert.equal(selected.reason, 'ONLY_ACTIVE_WEB_APP');
  assert.equal(selected.app?.appId, 'only');
});

test('FinClose display-name and canonical-host matches select a unique candidate', () => {
  const byName = chooseFirebaseWebApp([
    { appId: 'other', displayName: 'Other' },
    { appId: 'finclose', displayName: 'FinClose' }
  ], '', []);
  assert.equal(byName.reason, 'UNIQUE_FINCLOSE_MATCH');
  assert.equal(byName.app?.appId, 'finclose');

  const byHost = chooseFirebaseWebApp([
    { appId: 'other', displayName: 'Other', appUrls: ['https://other.example.com'] },
    { appId: 'host', displayName: 'App', appUrls: ['https://finclose-lab-preview.vercel.app/login'] }
  ], '', ['finclose-lab-preview.vercel.app']);
  assert.equal(byHost.reason, 'UNIQUE_FINCLOSE_MATCH');
  assert.equal(byHost.app?.appId, 'host');
});

test('ambiguous or absent Firebase Web Apps fail closed', () => {
  const ambiguous = chooseFirebaseWebApp([
    { appId: 'a', displayName: 'FinClose A' },
    { appId: 'b', displayName: 'FinClose B' }
  ], '', []);
  assert.equal(ambiguous.reason, 'MULTIPLE_WEB_APPS_AMBIGUOUS');
  assert.equal(ambiguous.app, null);

  const absent = chooseFirebaseWebApp([], '', []);
  assert.equal(absent.reason, 'NO_REGISTERED_WEB_APP');
  assert.equal(absent.app, null);
});

test('session revocation verification tolerates bounded propagation delay', async () => {
  let calls = 0;
  const result = await waitForSessionRevocation(async () => {
    calls += 1;
    if (calls < 3) return { uid: 'u' };
    throw Object.assign(new Error('revoked'), { code: 'auth/session-cookie-revoked' });
  }, { maxAttempts: 5, delayMs: 0 });

  assert.deepEqual(result, { revoked: true, attempts: 3 });
});

test('session revocation verification fails closed when revocation never appears', async () => {
  const result = await waitForSessionRevocation(async () => ({ uid: 'u' }), { maxAttempts: 3, delayMs: 0 });
  assert.deepEqual(result, { revoked: false, attempts: 3 });
});

test('session revocation verification does not mistake unrelated Auth errors for revocation', async () => {
  await assert.rejects(
    () => waitForSessionRevocation(async () => {
      throw Object.assign(new Error('network failure'), { code: 'auth/internal-error' });
    }, { maxAttempts: 3, delayMs: 0 }),
    /network failure/
  );
});
