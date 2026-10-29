// Small fixed-window rate limiter held in process memory. It slows runaway
// clients on a single server instance. It is NOT a distributed limit: on a
// multi-instance deployment each instance counts separately, so a shared store
// (or the platform's firewall) is still needed before a public launch.

const windows = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 10_000;

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
    const error = new Error('too many requests; wait a minute and try again');
    (error as Error & { status?: number }).status = 429;
    throw error;
  }
}

export function resetRateLimits() {
  windows.clear();
}
