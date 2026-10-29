import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';

// Session-cookie path against the Firebase Auth emulator: a real ID token from the emulator is
// exchanged for a session cookie, which is verified (with revocation check) the way real requests
// are. NOT covered: createFirebaseSessionResponse and authenticateRequest, because both sit behind
// assertRealDataRuntimeReady and the release-certification gate, which need production configuration;
// and Google's own sign-in screens.

assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'run through `firebase emulators:exec`, never against a real project');
process.env.FINCLOSE_RUNTIME_MODE = 'PILOT';

initializeApp({ projectId: 'demo-finclose' });
const auth = getAuth();
const { currentManagedUser } = await import('../../lib/managed-auth.ts');

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = (await response.json()) as { idToken?: string };
  assert.ok(body.idToken, 'emulator sign-in failed');
  return body.idToken;
}
const requestWith = (cookie?: string) => new NextRequest('http://localhost/api/x', { headers: cookie ? { cookie: `finclose_firebase_session=${cookie}` } : {} });

test('a valid session cookie gives the verified user', async () => {
  const user = await auth.createUser({ email: 'verified@example.test', password: 'Passw0rd-test', emailVerified: true, displayName: 'Vera' });
  const cookie = await auth.createSessionCookie(await signIn('verified@example.test', 'Passw0rd-test'), { expiresIn: 3_600_000 });
  const me = await currentManagedUser(requestWith(cookie));
  assert.equal(me?.user_id, user.uid);
  assert.equal(me?.email, 'verified@example.test');
  assert.equal(me?.email_verified, true);
  assert.equal(me?.auth_mode, 'FIREBASE_AUTH_SESSION');
});

test('an unverified email is reported as unverified', async () => {
  await auth.createUser({ email: 'unverified@example.test', password: 'Passw0rd-test', emailVerified: false });
  const cookie = await auth.createSessionCookie(await signIn('unverified@example.test', 'Passw0rd-test'), { expiresIn: 3_600_000 });
  assert.equal((await currentManagedUser(requestWith(cookie)))?.email_verified, false);
});

test('no cookie and a garbage cookie give no user', async () => {
  assert.equal(await currentManagedUser(requestWith()), null);
  assert.equal(await currentManagedUser(requestWith('not-a-cookie')), null);
  // Signature tampering is NOT tested here: the Auth emulator issues unsigned tokens and cannot reject a forged one.
  // Only the real Firebase service verifies signatures, so that stays unverified until a real-project check.
});

test('revoking refresh tokens (what logout does) invalidates the cookie', async () => {
  const user = await auth.createUser({ email: 'logout@example.test', password: 'Passw0rd-test', emailVerified: true });
  const cookie = await auth.createSessionCookie(await signIn('logout@example.test', 'Passw0rd-test'), { expiresIn: 3_600_000 });
  assert.ok(await currentManagedUser(requestWith(cookie)));
  await new Promise(r => setTimeout(r, 1100)); // revocation is compared at one-second resolution
  await auth.revokeRefreshTokens(user.uid);
  assert.equal(await currentManagedUser(requestWith(cookie)), null);
});

test('a disabled account loses access', async () => {
  const user = await auth.createUser({ email: 'disabled@example.test', password: 'Passw0rd-test', emailVerified: true });
  const cookie = await auth.createSessionCookie(await signIn('disabled@example.test', 'Passw0rd-test'), { expiresIn: 3_600_000 });
  await auth.updateUser(user.uid, { disabled: true });
  assert.equal(await currentManagedUser(requestWith(cookie)), null);
});

after(async () => {
  await Promise.all(getApps().map(a => deleteApp(a)));
});
