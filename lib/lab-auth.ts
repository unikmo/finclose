import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { realtimeDatabase } from './finclose-backend';

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = 'finclose_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type FinCloseUser = {
  user_id: string;
  name: string;
  email: string;
};

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

function normalizedName(value: unknown) {
  const name = String(value || '').trim();
  if (name.length < 2) throw httpError('name is required', 400);
  return name.slice(0, 120);
}

function normalizedPassword(value: unknown) {
  const password = String(value || '');
  if (password.length < 10) throw httpError('password must be at least 10 characters', 400);
  if (password.length > 256) throw httpError('password is too long', 400);
  return password;
}

function emailKey(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function sessionSecret() {
  const secret = process.env.FINCLOSE_LAB_TOKEN;
  if (!secret || secret.length < 12) throw httpError('account session secret is not configured', 500);
  return secret;
}

async function passwordHash(password: string, salt: string) {
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return derived.toString('base64url');
}

function encodeSession(user: FinCloseUser) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    uid: user.user_id,
    name: user.name,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeSession(raw?: string | null): FinCloseUser | null {
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (Number(parsed.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    if (!parsed.uid || !parsed.email) return null;
    return {
      user_id: String(parsed.uid),
      name: String(parsed.name || ''),
      email: String(parsed.email)
    };
  } catch {
    return null;
  }
}

function setSessionCookie(response: NextResponse, user: FinCloseUser) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: encodeSession(user),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });
  return response;
}

export async function registerLabAccount(input: Record<string, unknown>) {
  const name = normalizedName(input.name);
  const email = normalizedEmail(input.email);
  const password = normalizedPassword(input.password);
  const key = emailKey(email);
  const db = realtimeDatabase();
  const ref = db.ref(`finclose_lab_users/${key}`);
  const existing = await ref.once('value');
  if (existing.exists()) throw httpError('an account already exists for this email', 409);

  const salt = crypto.randomBytes(18).toString('base64url');
  const now = Date.now();
  const user: FinCloseUser = { user_id: crypto.randomUUID(), name, email };
  const record = {
    ...user,
    password_hash: await passwordHash(password, salt),
    password_salt: salt,
    status: 'ACTIVE',
    auth_mode: 'LAB_SCRYPT_SESSION',
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_lab_users/${key}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'LAB_ACCOUNT_REGISTERED',
      user_id: user.user_id,
      created_at: now
    }
  });
  return user;
}

export async function loginLabAccount(input: Record<string, unknown>) {
  const email = normalizedEmail(input.email);
  const password = normalizedPassword(input.password);
  const snap = await realtimeDatabase().ref(`finclose_lab_users/${emailKey(email)}`).once('value');
  if (!snap.exists()) throw httpError('email or password is incorrect', 401);
  const record = snap.val() as Record<string, unknown>;
  const expected = String(record.password_hash || '');
  const actual = await passwordHash(password, String(record.password_salt || ''));
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError('email or password is incorrect', 401);
  if (String(record.status || 'ACTIVE') !== 'ACTIVE') throw httpError('account is not active', 403);
  return {
    user_id: String(record.user_id),
    name: String(record.name || ''),
    email: String(record.email || email)
  } satisfies FinCloseUser;
}

export function accountResponse(user: FinCloseUser) {
  return setSessionCookie(NextResponse.json({ authenticated: true, user }), user);
}

export function logoutResponse() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({ name: SESSION_COOKIE, value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

export function currentUser(req: NextRequest) {
  return decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
}

export function assertCustomerOrLab(req: NextRequest) {
  const user = currentUser(req);
  if (user) return { kind: 'customer' as const, user };
  const expected = process.env.FINCLOSE_LAB_TOKEN;
  const supplied = req.headers.get('x-finclose-lab-token');
  if (expected && supplied && supplied === expected) return { kind: 'lab' as const, user: null };
  throw httpError('sign in is required', 401);
}
