import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedTeamId = 'team_sVekjWxQpKBAOb3DWW89HdvK';
const expectedProjectId = 'prj_fn9VRSUOqwpOHkXEuLDGHVvoMHSC';
const expectedProductionUrl = 'https://finclose-lab-preview.vercel.app';
const evidenceKeys = [
  'backup_pitr_verified',
  'security_review_approved',
  'accounting_qa_approved',
  'manual_upload_procedure_approved',
  'auth_email_delivery_verified',
  'upload_operator_checklist_verified'
];

function policy() {
  return JSON.parse(readFileSync(new URL('../ops/vercel-release-policy.json', import.meta.url), 'utf8')) as Record<string, any>;
}

test('Vercel release policy is pinned to canonical FinClose project', () => {
  const value = policy();
  assert.equal(value.schema_version, 1);
  assert.equal(value.project?.team_id, expectedTeamId);
  assert.equal(value.project?.project_id, expectedProjectId);
  assert.equal(value.project?.production_url, expectedProductionUrl);
});

test('release policy exposes only LAB_SAFE, CERTIFY_LAB and PILOT stages', () => {
  const stages = policy().stages || {};
  assert.deepEqual(Object.keys(stages).sort(), ['CERTIFY_LAB', 'LAB_SAFE', 'PILOT']);
  for (const stage of Object.values(stages) as Record<string, any>[]) {
    assert.equal(stage.production_release_gate, 'BLOCKED');
    assert.ok(['YES', 'NO'].includes(stage.upload_scanner_verified));
  }
});

test('LAB_SAFE is fail-closed and does not assert manual evidence', () => {
  const stage = policy().stages.LAB_SAFE;
  assert.equal(stage.runtime_mode, 'LAB');
  assert.equal(stage.pilot_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'BLOCK');
  assert.equal(stage.upload_scanner_verified, 'NO');
  for (const key of evidenceKeys) assert.equal(stage[key], 'NO', `${key} must remain NO in LAB_SAFE`);
});

test('CERTIFY_LAB preserves LAB while enabling only the evidence-backed controlled pilot path', () => {
  const stage = policy().stages.CERTIFY_LAB;
  assert.equal(stage.runtime_mode, 'LAB');
  assert.equal(stage.pilot_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'MANUAL_REVIEW');
  assert.equal(stage.upload_scanner_verified, 'NO');
  for (const key of evidenceKeys) assert.equal(stage[key], 'YES', `${key} must be explicitly approved before CERTIFY_LAB is invoked`);
});

test('PILOT activates only the controlled manual-review path and never PRODUCTION', () => {
  const stage = policy().stages.PILOT;
  assert.equal(stage.runtime_mode, 'PILOT');
  assert.equal(stage.pilot_release_gate, 'APPROVED');
  assert.equal(stage.production_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'MANUAL_REVIEW');
  assert.equal(stage.upload_scanner_verified, 'NO');
  for (const key of evidenceKeys) assert.equal(stage[key], 'YES');
});
