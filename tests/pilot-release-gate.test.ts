import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePilotCertificationEvidence } from '../lib/pilot-release-gate.ts';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from '../lib/release-version.ts';
import { runtimeReadiness } from '../lib/runtime-mode.ts';

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

test('pilot release evidence accepts only a release-bound all-pass certification', () => {
  const result = validatePilotCertificationEvidence(passingLatest(), passingReport());
  assert.equal(result.ready, true);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERIFIED');
  assert.equal(result.release_version, FINCLOSE_RELEASE_VERSION);
});

test('pilot release evidence rejects a certification from another release', () => {
  const report = { ...passingReport(), release_version: '0.35.1' };
  const result = validatePilotCertificationEvidence(passingLatest(), report);
  assert.equal(result.ready, false);
  assert.equal(result.code, 'PILOT_CERTIFICATION_VERSION_MISMATCH');
});

test('pilot release evidence rejects hash or run-pointer mismatches', () => {
  const hashMismatch = validatePilotCertificationEvidence({ ...passingLatest(), evidence_hash: 'b'.repeat(64) }, passingReport());
  assert.equal(hashMismatch.code, 'PILOT_CERTIFICATION_HASH_MISMATCH');

  const runMismatch = validatePilotCertificationEvidence({ ...passingLatest(), run_id: 'other' }, passingReport());
  assert.equal(runMismatch.code, 'PILOT_CERTIFICATION_RUN_MISMATCH');
});

test('pilot release evidence independently rechecks mandatory gates and blockers', () => {
  const failedGate = {
    ...passingReport(),
    gates: [{ id: 'auth', mandatory: true, status: 'FAIL' }]
  };
  assert.equal(validatePilotCertificationEvidence(passingLatest(), failedGate).code, 'PILOT_CERTIFICATION_MANDATORY_GATE_NOT_PASS');

  const blocked = { ...passingReport(), blockers: ['manual evidence missing'] };
  assert.equal(validatePilotCertificationEvidence(passingLatest(), blocked).code, 'PILOT_CERTIFICATION_HAS_BLOCKERS');
});

test('pilot release evidence must have been produced pre-activation and explicitly allow activation', () => {
  const wrongMode = { ...passingReport(), runtime_mode: 'PILOT' };
  assert.equal(validatePilotCertificationEvidence(passingLatest(), wrongMode).code, 'PILOT_CERTIFICATION_NOT_PRE_ACTIVATION');

  const noActivation = { ...passingReport(), activation_allowed: false };
  assert.equal(validatePilotCertificationEvidence(passingLatest(), noActivation).code, 'PILOT_CERTIFICATION_ACTIVATION_NOT_ALLOWED');
});

test('LAB health no longer misreports the current release gate as approved', () => {
  const savedMode = process.env.FINCLOSE_RUNTIME_MODE;
  const savedPilot = process.env.FINCLOSE_PILOT_RELEASE_GATE;
  const savedProduction = process.env.FINCLOSE_PRODUCTION_RELEASE_GATE;
  try {
    process.env.FINCLOSE_RUNTIME_MODE = 'LAB';
    process.env.FINCLOSE_PILOT_RELEASE_GATE = 'APPROVED';
    process.env.FINCLOSE_PRODUCTION_RELEASE_GATE = 'BLOCKED';
    const readiness = runtimeReadiness();
    assert.equal(readiness.real_data_mode, false);
    assert.equal(readiness.release_gate_approved, false);
    assert.equal(readiness.pilot_release_gate_approved, true);
    assert.equal(readiness.production_release_gate_approved, false);
    assert.equal(readiness.real_data_allowed_by_config, false);
  } finally {
    if (savedMode === undefined) delete process.env.FINCLOSE_RUNTIME_MODE; else process.env.FINCLOSE_RUNTIME_MODE = savedMode;
    if (savedPilot === undefined) delete process.env.FINCLOSE_PILOT_RELEASE_GATE; else process.env.FINCLOSE_PILOT_RELEASE_GATE = savedPilot;
    if (savedProduction === undefined) delete process.env.FINCLOSE_PRODUCTION_RELEASE_GATE; else process.env.FINCLOSE_PRODUCTION_RELEASE_GATE = savedProduction;
  }
});
