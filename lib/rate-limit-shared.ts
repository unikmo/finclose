import type { Firestore } from 'firebase-admin/firestore';
import { httpErrorWithStatus } from './rate-limit';

// Fixed-window rate limit shared by every server instance, kept in Firestore.
// One document per (key, window); a transaction increments it, so concurrent
// requests on different instances count together. It fails closed: if Firestore
// cannot be reached the request fails instead of skipping the limit.
//
// Expired window documents carry `ttl_at`, a real timestamp (a TTL policy ignores number
// fields). firestore.indexes.json declares the TTL policy; deploy it or they pile up.

const COLLECTION = 'finclose_prod_rate_limits';

function safeId(value: string) { return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }

export async function checkSharedRateLimit(db: Firestore, key: string, limit: number, windowMs: number, now = Date.now()): Promise<void> {
  const window = Math.floor(now / windowMs);
  const ref = db.collection(COLLECTION).doc(`${safeId(key)}__${window}`);
  const count = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const next = (snap.exists ? Number(snap.data()!.count || 0) : 0) + 1;
    tx.set(ref, { key, window, count: next, expires_at: (window + 2) * windowMs, ttl_at: new Date((window + 2) * windowMs) });
    return next;
  });
  if (count > limit) throw httpErrorWithStatus('too many requests; wait a minute and try again', 429);
}
