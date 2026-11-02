import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPayrollReleaseStore, RealtimePayrollReleaseStore, assertPayrollReleased, setPayrollRelease } from '../lib/payroll-release';
import { PAYROLL_RULE_PACKS } from '../lib/payroll-engine';
import { verifiedPayrollCountries } from '../lib/payroll-release-store';

const ORG = 'org_customer_one';

test('nothing is released by default', async () => {
  await assert.rejects(assertPayrollReleased(new InMemoryPayrollReleaseStore(), ORG, 'GE'), /not released/);
  await assert.rejects(assertPayrollReleased(new InMemoryPayrollReleaseStore(), null, 'GE'), /not released/);
});

test('a release covers only the named customer and the named countries', async () => {
  const store = new InMemoryPayrollReleaseStore();
  await setPayrollRelease(store, { organization_id: ORG, countries: ['ge'], note: 'pilot customer' }, ['GE']);
  await assertPayrollReleased(store, ORG, 'GE');
  await assert.rejects(assertPayrollReleased(store, ORG, 'DE'), /not released/);
  await assert.rejects(assertPayrollReleased(store, 'org_someone_else', 'GE'), /not released/);
});

test('a country whose rule pack is not verified cannot be released', async () => {
  const store = new InMemoryPayrollReleaseStore();
  await assert.rejects(setPayrollRelease(store, { organization_id: ORG, countries: ['DE'] }, ['GE']), /not verified/);
  assert.equal((await store.list()).length, 0);
});

test('an empty list withdraws the release, and bad input is refused', async () => {
  const store = new InMemoryPayrollReleaseStore();
  await setPayrollRelease(store, { organization_id: ORG, countries: ['GE'] }, ['GE']);
  assert.equal(await setPayrollRelease(store, { organization_id: ORG, countries: [] }, ['GE']), null);
  await assert.rejects(assertPayrollReleased(store, ORG, 'GE'), /not released/);
  await assert.rejects(setPayrollRelease(store, { organization_id: 'a/b', countries: ['GE'] }, ['GE']), /organization_id/);
  await assert.rejects(setPayrollRelease(store, { organization_id: ORG, countries: 'GE' }, ['GE']), /list/);
  await assert.rejects(setPayrollRelease(store, { organization_id: ORG, countries: ['GEO'] }, ['GE']), /two-letter/);
});

test('the realtime store reads and writes one node per customer', async () => {
  const data: Record<string, unknown> = {};
  const db = {
    ref: (p: string) => ({
      once: async () => {
        const rows = Object.entries(data).filter(([k]) => k.startsWith(p + '/'));
        const val = data[p] ?? (rows.length ? Object.fromEntries(rows.map(([k, v]) => [k.slice(p.length + 1), v])) : undefined);
        return { exists: () => val !== undefined, val: () => val };
      },
      set: async (v: unknown) => { data[p] = v; },
      remove: async () => { delete data[p]; }
    })
  };
  const store = new RealtimePayrollReleaseStore(db);
  await setPayrollRelease(store, { organization_id: ORG, countries: ['GE'] }, ['GE']);
  assert.ok(data[`finclose_payroll_release/${ORG}`]);
  assert.equal((await store.list()).length, 1);
  await store.remove(ORG);
  assert.equal(await store.get(ORG), null);
});

test('today only Georgia is releasable, and the database rules deny all client access', async () => {
  assert.deepEqual(verifiedPayrollCountries(), Object.entries(PAYROLL_RULE_PACKS as Record<string, { status: string }>).filter(([, p]) => p.status === 'VERIFIED_BASIC_RULES').map(([c]) => c));
  assert.ok(verifiedPayrollCountries().includes('GE'));
  const rules = JSON.parse((await import('node:fs')).readFileSync('database.rules.json', 'utf8')).rules;
  assert.equal(rules['.read'], false);
  assert.equal(rules['.write'], false);
});
