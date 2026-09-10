import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSONStringify, computePilotCertificationEvidenceHash, validatePilotCertificationEvidence } from '../lib/pilot-release-evidence.ts';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from '../lib/release-version.ts';

const sourceSha = '1'.repeat(40);

// Firebase Realtime Database returns object keys in sorted order on read; this
// mimics that write/read round-trip so we can assert the evidence hash is stable.
function firebaseReadRoundTrip<T>(value: T): T {
  if (Array.isArray(value)) return value.map(firebaseReadRoundTrip) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = firebaseReadRoundTrip((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

function fixture() {
  const report = {
    certification_version: PILOT_CERTIFICATION_VERSION,
    release_version: FINCLOSE_RELEASE_VERSION,
    release_source_sha: sourceSha,
    run_id: 'run_1',
    runtime_mode: 'LAB',
    release_ready: true,
    activation_allowed: true,
    blockers: [] as string[],
    gates: [
      { id: 'auth', evidence: 'live auth passed', mandatory: true, status: 'PASS' },
      { id: 'rules', evidence: 'anonymous access denied', mandatory: true, status: 'PASS' },
      {
        id: 'ledger',
        evidence: 'firestore ledger ready',
        mandatory: true,
        status: 'PASS',
        detail: { configured: true, reachable: true, schema_version: 1, ready: true, backend: 'firebase-firestore' }
      },
      { id: 'optional', evidence: 'directional warning', mandatory: false, status: 'WARN' }
    ],
    evidence_hash: '',
    completed_at: 1_788_000_000_000
  };
  report.evidence_hash = computePilotCertificationEvidenceHash(report);
  const latest = {
    run_id: report.run_id,
    release_ready: true,
    activation_allowed: true,
    evidence_hash: report.evidence_hash,
    completed_at: report.completed_at
  };
  return { report, latest };
}

function validate(latest: ReturnType<typeof fixture>['latest'], report: ReturnType<typeof fixture>['report'], expectedSourceSha = sourceSha) {
  return validatePilotCertificationEvidence(
    latest,
    report,
    PILOT_CERTIFICATION_VERSION,
    FINCLOSE_RELEASE_VERSION,
    expectedSourceSha
  );
}

test('pilot release evidence accepts only a release-and-source-bound all-pass certification', () => {
  const { latest, report } = fixture();
  const result = validate(latest, report);
  assert.equal(result.ready, true);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERIFIED');
  assert.equal(result.release_version, FINCLOSE_RELEASE_VERSION);
  assert.equal(result.release_source_sha, sourceSha);
});

test('pilot release evidence rejects another release or source build', () => {
  const a = fixture();
  assert.equal(validate(a.latest, { ...a.report, release_version: '0.35.1' }).code, 'PILOT_CERTIFICATION_VERSION_MISMATCH');

  const b = fixture();
  assert.equal(validate(b.latest, b.report, '2'.repeat(40)).code, 'PILOT_CERTIFICATION_SOURCE_MISMATCH');
});

test('pilot release evidence rejects hash, content or run-pointer mismatches', () => {
  const a = fixture();
  assert.equal(validate({ ...a.latest, evidence_hash: 'b'.repeat(64) }, a.report).code, 'PILOT_CERTIFICATION_HASH_MISMATCH');

  const b = fixture();
  const tampered = {
    ...b.report,
    gates: b.report.gates.map(item => item.id === 'optional' ? { ...item, evidence: 'tampered evidence' } : item)
  };
  assert.equal(validate(b.latest, tampered).code, 'PILOT_CERTIFICATION_HASH_MISMATCH');

  const c = fixture();
  assert.equal(validate({ ...c.latest, run_id: 'other' }, c.report).code, 'PILOT_CERTIFICATION_RUN_MISMATCH');
});

test('pilot release evidence independently rechecks mandatory gates and blockers', () => {
  const a = fixture();
  const failedGate = {
    ...a.report,
    gates: a.report.gates.map(item => item.id === 'auth' ? { ...item, status: 'FAIL' } : item)
  };
  failedGate.evidence_hash = computePilotCertificationEvidenceHash(failedGate);
  const failedLatest = { ...a.latest, evidence_hash: failedGate.evidence_hash };
  assert.equal(validate(failedLatest, failedGate).code, 'PILOT_CERTIFICATION_MANDATORY_GATE_NOT_PASS');

  const b = fixture();
  const blocked = { ...b.report, blockers: ['manual evidence missing'] };
  assert.equal(validate(b.latest, blocked).code, 'PILOT_CERTIFICATION_HAS_BLOCKERS');
});

test('canonicalJSONStringify is insensitive to object key order', () => {
  assert.equal(
    canonicalJSONStringify({ b: 1, a: { d: 4, c: 3 } }),
    canonicalJSONStringify({ a: { c: 3, d: 4 }, b: 1 })
  );
});

test('pilot release evidence still validates after a Firebase RTDB read round-trip', () => {
  const { latest, report } = fixture();
  // Sanity: gate detail objects are present, so key-order canonicalization matters.
  assert.ok(report.gates.some(g => (g as { detail?: unknown }).detail));

  const storedReport = firebaseReadRoundTrip(report);
  const storedLatest = firebaseReadRoundTrip(latest);

  assert.equal(computePilotCertificationEvidenceHash(storedReport), report.evidence_hash);
  const result = validate(storedLatest, storedReport);
  assert.equal(result.ready, true);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERIFIED');
});

test('pilot release evidence must have been produced pre-activation and explicitly allow activation', () => {
  const a = fixture();
  const wrongMode = { ...a.report, runtime_mode: 'PILOT' };
  assert.equal(validate(a.latest, wrongMode).code, 'PILOT_CERTIFICATION_NOT_PRE_ACTIVATION');

  const b = fixture();
  const noActivation = { ...b.report, activation_allowed: false };
  assert.equal(validate(b.latest, noActivation).code, 'PILOT_CERTIFICATION_ACTIVATION_NOT_ALLOWED');
});
