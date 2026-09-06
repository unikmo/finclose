import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';
import { firebaseApp, realtimeDatabase } from './finclose-backend';
import { assertCustomerOrLab as assertLegacyCustomerOrLab, currentUser as currentLegacyUser, logoutResponse as legacyLogoutResponse } from './lab-auth';
import { firebaseClientConfig, isRealDataMode } from './runtime-mode';

const FIREBASE_SESSION_COOKIE = 'finclose_firebase_session';
const FIREBASE_SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_AUTH_AGE_SECONDS = 5 * 60;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

export type ManagedUser = {
  user_id: string;
  name: string;
  email: string;
  email_verified: boolean;
  auth_mode: 'FIREBASE_AUTH_SESSION' | 'LAB_ACCOUNT_SESSION';
};

export type RequestIdentity =
  | { kind: 'customer'; user: ManagedUser }
  | { kind: 'lab'; user: null };

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function normalizedEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError('valid email is required', 400);
  return email;
}

function normalizedPassword(value: unknown) {
  const password = String(value || '');
  if (password.length < 10) throw httpError('password must be at least 10 characters', 400);
  if (password.length > 256) throw httpError('password is too long', 400);
  return password;
}

function normalizedName(value: unknown) {
  const name = String(value || '').trim();
  if (name.length < 2) throw httpError('name is required', 400);
  return name.slice(0, 120);
}

function managedUserFromClaims(claims: Record<string, unknown>): ManagedUser {
  const uid = String(claims.uid || claims.sub || '').trim();
  const email = String(claims.email || '').trim().toLowerCase();
  if (!uid || !email) throw httpError('authenticated Firebase user is missing uid or email', 401);
  return {
    user_id: uid,
    name: String(claims.name || '').trim(),
    email,
    email_verified: claims.email_verified === true,
    auth_mode: 'FIREBASE_AUTH_SESSION'
  };
}

async function consumeAuthRateLimit(action: string, email: string, limit: number) {
  if (!isRealDataMode()) return;
  const key = crypto.createHash('sha256').update(`${action}:${email}`).digest('hex').slice(0, 48);
  const ref = realtimeDatabase().ref(`finclose_auth_rate_limits/${key}`);
  const now = Date.now();
  let blocked = false;
  const result = await ref.transaction(current => {
    const data = (current || {}) as Record<string, unknown>;
    const windowStartedAt = Number(data.window_started_at || 0);
    const count = Number(data.count || 0);
    if (!windowStartedAt || now - windowStartedAt >= AUTH_RATE_WINDOW_MS) {
      return { action, count: 1, window_started_at: now, expires_at: now + AUTH_RATE_WINDOW_MS };
    }
    if (count >= limit) {
      blocked = true;
      return;
    }
    return { ...data, action, count: count + 1, expires_at: windowStartedAt + AUTH_RATE_WINDOW_MS };
  });
  if (blocked || !result.committed) throw httpError('too many authentication attempts; try again later', 429);
}

async function identityToolkitRequest(payload: Record<string, unknown>) {
  const apiKey = firebaseClientConfig().apiKey;
  if (!apiKey) throw httpError('Firebase Authentication web API key is not configured', 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  return { response, body };
}

async function sendVerificationEmail(idToken: string) {
  const { response, body } = await identityToolkitRequest({ requestType: 'VERIFY_EMAIL', idToken });
  if (!response.ok) {
    const code = String(body?.error?.message || 'EMAIL_VERIFICATION_FAILED');
    if (!['TOO_MANY_ATTEMPTS_TRY_LATER'].includes(code)) throw httpError(`Firebase verification email failed: ${code}`, 502);
  }
}

export async function requestPasswordReset(input: Record<string, unknown>) {
  if (!isRealDataMode()) throw httpError('managed password reset is only enabled in PILOT or PRODUCTION mode', 409);
  const email = normalizedEmail(input.email);
  await consumeAuthRateLimit('password-reset', email, 5);
  const { response, body } = await identityToolkitRequest({ requestType: 'PASSWORD_RESET', email });
  if (!response.ok) {
    const code = String(body?.error?.message || 'PASSWORD_RESET_FAILED');
    if (!['EMAIL_NOT_FOUND', 'INVALID_EMAIL'].includes(code)) {
      throw httpError('password reset could not be requested', code === 'TOO_MANY_ATTEMPTS_TRY_LATER' ? 429 : 502);
    }
  }
  return NextResponse.json({ accepted: true, message: 'If an account exists for that email, Firebase will send password reset instructions.' });
}

export async function resendVerification(input: Record<string, unknown>) {
  if (!isRealDataMode()) throw httpError('managed verification is only enabled in PILOT or PRODUCTION mode', 409);
  const email = normalizedEmail(input.email);
  const password = normalizedPassword(input.password);
  await consumeAuthRateLimit('verification-resend', email, 5);
  const idToken = await firebasePasswordSignIn(email, password, false);
  const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken, true);
  if (decoded.email_verified === true) return NextResponse.json({ accepted: true, already_verified: true });
  await sendVerificationEmail(idToken);
  return NextResponse.json({ accepted: true, verification_required: true });
}

async function firebasePasswordSignIn(email: string, password: string, rateLimit = true) {
  if (rateLimit) await consumeAuthRateLimit('login', email, 10);
  const apiKey = firebaseClientConfig().apiKey;
  if (!apiKey) throw httpError('Firebase Authentication web API key is not configured', 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    cache: 'no-store'
  });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || !body.idToken) {
    const code = String(body?.error?.message || 'AUTHENTICATION_FAILED');
    if (['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS'].includes(code)) {
      throw httpError('email or password is incorrect', 401);
    }
    if (code === 'USER_DISABLED') throw httpError('account is disabled', 403);
    if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw httpError('too many authentication attempts; try again later', 429);
    throw httpError(`Firebase sign-in failed: ${code}`, 502);
  }
  return String(body.idToken);
}

export async function createFirebaseSessionResponse(idToken: string) {
  if (!isRealDataMode()) throw httpError('Firebase session exchange is only enabled in PILOT or PRODUCTION mode', 409);
  if (!idToken) throw httpError('Firebase ID token is required', 400);
  const auth = getAuth(firebaseApp());
  const decoded = await auth.verifyIdToken(idToken, true);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!decoded.auth_time || nowSeconds - decoded.auth_time > MAX_AUTH_AGE_SECONDS) {
    throw httpError('recent sign-in is required before creating a FinClose session', 401);
  }
  if (!decoded.email) throw httpError('email identity is required', 403);
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: FIREBASE_SESSION_MS });
  const user = managedUserFromClaims(decoded as unknown as Record<string, unknown>);
  const response = NextResponse.json({
    authenticated: true,
    user,
    auth_mode: user.auth_mode,
    verification_required: user.email_verified !== true
  });
  response.cookies.set({
    name: FIREBASE_SESSION_COOKIE,
    value: cookie,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(FIREBASE_SESSION_MS / 1000)
  });
  return response;
}

export async function registerManagedAccount(input: Record<string, unknown>) {
  if (!isRealDataMode()) throw httpError('managed registration is only enabled in PILOT or PRODUCTION mode', 409);
  const name = normalizedName(input.name);
  const email = normalizedEmail(input.email);
  const password = normalizedPassword(input.password);
  await consumeAuthRateLimit('register', email, 5);
  const auth = getAuth(firebaseApp());
  try {
    await auth.createUser({ email, password, displayName: name, disabled: false });
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code.includes('email-already-exists')) throw httpError('an account already exists for this email', 409);
    if (code.includes('invalid-password') || code.includes('invalid-email')) throw httpError('account details are invalid', 400);
    throw error;
  }
  const idToken = await firebasePasswordSignIn(email, password, false);
  await sendVerificationEmail(idToken);
  return createFirebaseSessionResponse(idToken);
}

export async function loginManagedAccount(input: Record<string, unknown>) {
  if (!isRealDataMode()) throw httpError('managed login is only enabled in PILOT or PRODUCTION mode', 409);
  const email = normalizedEmail(input.email);
  const password = normalizedPassword(input.password);
  const idToken = await firebasePasswordSignIn(email, password);
  const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken, true);
  if (decoded.email_verified !== true) await sendVerificationEmail(idToken);
  return createFirebaseSessionResponse(idToken);
}

export async function currentManagedUser(req: NextRequest): Promise<ManagedUser | null> {
  if (!isRealDataMode()) {
    const user = currentLegacyUser(req);
    if (!user) return null;
    return { ...user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION' };
  }
  const raw = req.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const claims = await getAuth(firebaseApp()).verifySessionCookie(raw, true);
    return managedUserFromClaims(claims as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: NextRequest): Promise<RequestIdentity> {
  if (!isRealDataMode()) {
    const legacy = assertLegacyCustomerOrLab(req);
    if (legacy.kind === 'lab') return { kind: 'lab', user: null };
    return {
      kind: 'customer',
      user: { ...legacy.user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION' }
    };
  }
  const user = await currentManagedUser(req);
  if (!user) throw httpError('sign in is required', 401);
  if (!user.email_verified) throw httpError('verify your email before using real financial data in FinClose', 403);
  return { kind: 'customer', user };
}

export async function logoutManagedResponse(req: NextRequest) {
  if (!isRealDataMode()) return legacyLogoutResponse();
  const response = NextResponse.json({ authenticated: false });
  const raw = req.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  response.cookies.set({ name: FIREBASE_SESSION_COOKIE, value: '', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  if (raw) {
    try {
      const claims = await getAuth(firebaseApp()).verifySessionCookie(raw, false);
      if (claims.sub) await getAuth(firebaseApp()).revokeRefreshTokens(claims.sub);
    } catch {
      // Cookie is cleared even if revocation cannot be completed.
    }
  }
  return response;
}
