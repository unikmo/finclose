import test from 'node:test';
import assert from 'node:assert/strict';
import { secureReleaseTokenMatches } from '../lib/release-automation-auth.ts';

test('ephemeral release token requires at least 32 characters and exact timing-safe match', () => {
  const token = 'a'.repeat(64);
  assert.equal(secureReleaseTokenMatches(token, token), true);
  assert.equal(secureReleaseTokenMatches(token, 'b'.repeat(64)), false);
  assert.equal(secureReleaseTokenMatches(token, 'a'.repeat(63)), false);
  assert.equal(secureReleaseTokenMatches('short', 'short'), false);
  assert.equal(secureReleaseTokenMatches(undefined, token), false);
  assert.equal(secureReleaseTokenMatches(token, null), false);
});
