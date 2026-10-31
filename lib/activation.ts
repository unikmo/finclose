import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

// Counting how many client companies a partner runs FinClose on, without holding any of their
// financial data. A run reports only: the partner's id, the company's country and registry number
// (public information), and the month. The server counts distinct companies per partner per month
// and hands back a signed token for that company and month.
//
// What this does and does not guarantee, plainly:
//  - The count comes from our own record of activations, not from a figure a partner reports.
//  - The signed token lets the program prove to itself it was activated; it cannot stop someone who
//    holds a modified copy of the code from skipping the call. The contract has to cover that.
//  - A registry number is not a person's data for a company, but it is still logged: say so in the
//    privacy notice.

export type ActivationRecord = { partner_id: string; company_key: string; month: string; first_seen: number; last_seen: number; runs: number };

export interface ActivationStore {
  record(input: { partner_id: string; company_key: string; month: string; now: number }): Promise<ActivationRecord>;
  listForMonth(partnerId: string, month: string): Promise<ActivationRecord[]>;
}

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export function monthOf(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function validPartnerId(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(text)) throw httpError('partner_id must be 3-60 letters, digits or hyphens', 400);
  return text;
}

// One company = one country plus one registry number, whatever punctuation the user typed.
export function companyKey(country: unknown, regCode: unknown): string {
  const cc = String(country ?? '').trim().toUpperCase();
  const reg = String(regCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{2}$/.test(cc)) throw httpError('country must be a two-letter code', 400);
  if (reg.length < 4 || reg.length > 20) throw httpError('the company registry number looks wrong', 400);
  return `${cc}:${reg}`;
}

function tokenKey(env: NodeJS.ProcessEnv) {
  const raw = String(env.FINCLOSE_ACTIVATION_KEY || '');
  if (raw.length < 32) throw httpError('activation is not configured on this server', 503);
  return crypto.createHash('sha256').update(`activation:${raw}`).digest();
}

export function issueActivationToken(args: { partner_id: string; company_key: string; month: string }, env: NodeJS.ProcessEnv = process.env): string {
  const payload = Buffer.from(JSON.stringify({ p: args.partner_id, c: args.company_key, m: args.month })).toString('base64url');
  const sig = crypto.createHmac('sha256', tokenKey(env)).update(payload).digest('base64url');
  return `a1.${payload}.${sig}`;
}

export function verifyActivationToken(token: string, env: NodeJS.ProcessEnv = process.env): { partner_id: string; company_key: string; month: string } | null {
  const [version, payload, sig] = String(token || '').split('.');
  if (version !== 'a1' || !payload || !sig) return null;
  const expected = crypto.createHmac('sha256', tokenKey(env)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: string; c?: string; m?: string };
    return body.p && body.c && body.m ? { partner_id: body.p, company_key: body.c, month: body.m } : null;
  } catch { return null; }
}

// A partner id is not secret (it can be printed on a page), so counting under it needs a code only we
// issued. Without this anyone could inflate a partner's count with made-up company numbers.
export function partnerCode(partnerId: string, env: NodeJS.ProcessEnv = process.env): string {
  return crypto.createHmac('sha256', tokenKey(env)).update(`partner:${validPartnerId(partnerId)}`).digest('base64url').slice(0, 24);
}

export function checkPartnerCode(partnerId: string, code: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const given = Buffer.from(String(code ?? ''));
  const expected = Buffer.from(partnerCode(partnerId, env));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export async function activateCompany(store: ActivationStore, input: { partner_id: unknown; partner_code: unknown; country: unknown; reg_code: unknown }, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const partner_id = validPartnerId(input.partner_id);
  if (!checkPartnerCode(partner_id, input.partner_code, env)) throw httpError('the partner code is not valid', 403);
  const company_key = companyKey(input.country, input.reg_code);
  const month = monthOf(now);
  tokenKey(env); // fail before recording anything if signing is not configured
  const record = await store.record({ partner_id, company_key, month, now });
  return { token: issueActivationToken({ partner_id, company_key, month }, env), month, first_run_this_month: record.runs === 1, runs_this_month: record.runs };
}

export async function usageForMonth(store: ActivationStore, partnerIdInput: unknown, month: string) {
  const partner_id = validPartnerId(partnerIdInput);
  if (!/^\d{4}-\d{2}$/.test(month)) throw httpError('month must look like 2026-10', 400);
  const rows = await store.listForMonth(partner_id, month);
  return {
    partner_id, month,
    client_accounts: rows.length,
    runs: rows.reduce((s, r) => s + r.runs, 0),
    companies: rows.map(r => ({ company_key: r.company_key, first_seen: r.first_seen, last_seen: r.last_seen, runs: r.runs })).sort((a, b) => a.company_key.localeCompare(b.company_key))
  };
}

export class InMemoryActivationStore implements ActivationStore {
  private rows = new Map<string, ActivationRecord>();
  async record(input: { partner_id: string; company_key: string; month: string; now: number }) {
    const key = `${input.partner_id}|${input.month}|${input.company_key}`;
    const before = this.rows.get(key);
    const next: ActivationRecord = before
      ? { ...before, last_seen: input.now, runs: before.runs + 1 }
      : { partner_id: input.partner_id, company_key: input.company_key, month: input.month, first_seen: input.now, last_seen: input.now, runs: 1 };
    this.rows.set(key, next);
    return { ...next };
  }
  async listForMonth(partnerId: string, month: string) {
    return [...this.rows.values()].filter(r => r.partner_id === partnerId && r.month === month).map(r => ({ ...r }));
  }
}

const ACTIVATIONS = 'finclose_prod_activations';
const safe = (value: string) => value.replace(/[^A-Za-z0-9_:-]/g, '_');

export class FirestoreActivationStore implements ActivationStore {
  private readonly injectedDb?: Firestore;
  constructor(db?: Firestore) { this.injectedDb = db; }
  private async db(): Promise<Firestore> {
    if (this.injectedDb) return this.injectedDb;
    const [{ getFirestore }, { firebaseApp }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend')]);
    return getFirestore(firebaseApp());
  }
  async record(input: { partner_id: string; company_key: string; month: string; now: number }) {
    const db = await this.db();
    const ref = db.collection(ACTIVATIONS).doc(safe(`${input.partner_id}__${input.month}__${input.company_key}`));
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const before = snap.exists ? (snap.data() as ActivationRecord) : null;
      const next: ActivationRecord = before
        ? { ...before, last_seen: input.now, runs: before.runs + 1 }
        : { partner_id: input.partner_id, company_key: input.company_key, month: input.month, first_seen: input.now, last_seen: input.now, runs: 1 };
      tx.set(ref, next);
      return next;
    });
  }
  async listForMonth(partnerId: string, month: string) {
    const snap = await (await this.db()).collection(ACTIVATIONS).where('partner_id', '==', partnerId).where('month', '==', month).get();
    return snap.docs.map(d => d.data() as ActivationRecord);
  }
}
