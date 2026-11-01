// Fixed-window rate limiter held in process memory, used in LAB mode. It is NOT
// a distributed limit; PILOT/PRODUCTION use lib/rate-limit-shared.ts (Firestore).

const windows = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 10_000;

export function httpErrorWithStatus(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (windows.size > MAX_KEYS) {
    for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
    if (windows.size > MAX_KEYS) windows.clear();
  }
  const current = windows.get(key);
  if (!current || now - current.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw httpErrorWithStatus('too many requests; wait a minute and try again', 429);
  }
}

export function resetRateLimits() {
  windows.clear();
}
