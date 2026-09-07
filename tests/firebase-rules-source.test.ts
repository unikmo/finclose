import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function assertSingleDenyAllRule(source: string, label: string) {
  const rules = source.match(/allow\s+[^:]+:\s*if\s+[^;]+;/g) || [];
  assert.equal(rules.length, 1, `${label} must contain exactly one client allow rule`);
  assert.match(rules[0], /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/, `${label} must deny all direct client reads and writes`);
}

test('Firebase CLI config binds every data service to the checked-in deny-all rules', () => {
  const config = JSON.parse(read('firebase.json')) as Record<string, any>;
  assert.equal(config.database?.rules, 'database.rules.json');
  assert.equal(config.firestore?.rules, 'firestore.rules');
  assert.equal(config.storage?.rules, 'storage.rules');
});

test('Firebase project target remains the canonical theantibalcony project', () => {
  const config = JSON.parse(read('.firebaserc')) as Record<string, any>;
  assert.equal(config.projects?.default, 'theantibalcony');
});

test('Firestore source rules deny all direct client reads and writes', () => {
  assertSingleDenyAllRule(read('firestore.rules'), 'Firestore');
});

test('Realtime Database source rules deny all direct client reads and writes without path overrides', () => {
  const config = JSON.parse(read('database.rules.json')) as Record<string, any>;
  const rules = config.rules || {};
  assert.deepEqual(Object.keys(rules).sort(), ['.read', '.write']);
  assert.equal(rules['.read'], false);
  assert.equal(rules['.write'], false);
});

test('Storage source rules deny all direct client reads and writes', () => {
  assertSingleDenyAllRule(read('storage.rules'), 'Storage');
});
