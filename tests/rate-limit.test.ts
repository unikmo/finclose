import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimits } from '../lib/rate-limit.ts';

test('requests over the limit in a window get 429, then the window resets', () => {
  resetRateLimits();
  for (let i = 0; i < 3; i += 1) checkRateLimit('k', 3, 1000, 100);
  assert.throws(() => checkRateLimit('k', 3, 1000, 200), (e: Error & { status?: number }) => e.status === 429);
  checkRateLimit('k', 3, 1000, 1200); // new window
  checkRateLimit('other', 3, 1000, 200); // separate key
});
