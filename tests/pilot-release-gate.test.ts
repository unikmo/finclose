import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePilotCertificationEvidence } from '../lib/pilot-release-evidence.ts';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from '../lib/release-version.ts';

const hash = 'a'.repeat(64);

function passingReport() {
  return {
    certification_version: PILOT_CERTIFICATION_VERSION,
    release_version: FINCLOSE_RELEASE_VERSION,
    run_id: 'run_1',
    runtime_mode: 'LAB',
    release_ready: true,
    activation_allowed: true,
    blockers: [],
    gates: [
      { id: 'auth', mandatory: true, status: 'PASS' },
      { id: 'rules', mandatory: true, status: 'PASS' },
      { id: 'optional', mandatory: false, status: 'WARN' }
    ],
    evidence_hash: hash,
    completed_at: 1_788_000_000_000
  };
}

function passingLatest() {
  return {
    run_id: 'run_1',
    release_ready: true,
    activation_allowed: true,
    evidence_hash: hash,
    completed_at: 1_788_000_000_000
  };
}

function validate(latest = passingLatest(), report = passingReport()) {
  return validatePilotCertificationEvidence(
    latest,
    report,
    PILOT_CERTIFICATION_VERSION,
    FINCLOSE_RELEASE_VERSION
  );
}

test('pilot release evidence accepts only a release-bound all-pass certification', () => {
  const result = validate();
  assert.equal(result.ready, true);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERIFIED');
  assert.equal(result.release_version, FINCLOSE_RELEASE_VERSION);
});

test('pilot release evidence rejects a certification from another release', () => {
  const result = validate(passingLatest(), { ...passingReport(), release_version: '0.35.1' });
  assert.equal(result.ready, false);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERSION_MISMATCH');
});

test('pilot release evidence rejects hash or run-pointer mismatches', () => {
  const hashMismatch = validate({ ...passingLatest(), evidence_hash: 'b'.repeat(64) });
  assert.equal(hashMismatch.code, 'PILOT_CERTIFICATION_HASH_MISMATCH');

  const runMismatch = validate({ ...passingLatest(), run_id: 'other' });
  assert.equal(runMismatch.code, 'PILOT_CERTIFICATION_RUN_MISMATCH');
});

test('pilot release evidence independently rechecks mandatory gates and blockers', () => {
  const failedGate = {
    ...passingReport(),
    gates: [{ id: 'auth', mandatory: true, status: 'FAIL' }]
  };
  assert.equal(validate(passingLatest(), failedGate).code, 'PILOT_CERTIFICATION_MANDATORY_GATE_NOT_PASS');

  const blocked = { ...passingReport(), blockers: ['manual evidence missing'] };
  assert.equal(validate(passingLatest(), blocked).code, 'PILOT_CERTIFICATION_HAS_BLOCKERS');
});

test('pilot release evidence must have been produced pre-activation and explicitly allow activation', () => {
  const wrongMode = { ...passingReport(), runtime_mode: 'PILOT' };
  assert.equal(validate(passingLatest(), wrongMode).code, 'PILOT_CERTIFICATION_NOT_PRE_ACTIVATION');

  const noActivation = { ...passingReport(), activation_allowed: false };
  assert.equal(validate(passingLatest(), noActivation).code, 'PILOT_CERTIFICATION_ACTIVATION_NOT_ALLOWED');
});
