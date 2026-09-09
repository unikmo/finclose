import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedTeamId = 'team_sVekjWxQpKBAOb3DWW89HdvK';
const expectedProjectId = 'prj_fn9VRSUOqwpOHkXEuLDGHVvoMHSC';
const expectedProductionUrl = 'https://finclose-lab-preview.vercel.app';
const expectedEvidence: Record<string, string> = {
  backup_pitr: 'FINCLOSE_BACKUP_PITR_VERIFIED',
  security_review: 'FINCLOSE_SECURITY_REVIEW_APPROVED',
  accounting_qa: 'FINCLOSE_ACCOUNTING_QA_APPROVED',
  manual_upload_procedure: 'FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED',
  auth_email_delivery: 'FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED',
  upload_operator_checklist: 'FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED'
};

function policy() {
  return JSON.parse(readFileSync(new URL('../ops/vercel-release-policy.json', import.meta.url), 'utf8')) as Record<string, any>;
}

function evidence() {
  return JSON.parse(readFileSync(new URL('../ops/pilot-release-evidence.json', import.meta.url), 'utf8')) as Record<string, any>;
}

test('Vercel release policy is pinned to canonical FinClose project', () => {
  const value = policy();
  assert.equal(value.schema_version, 2);
  assert.equal(value.project?.team_id, expectedTeamId);
  assert.equal(value.project?.project_id, expectedProjectId);
  assert.equal(value.project?.production_url, expectedProductionUrl);
});

test('release policy exposes only source-stable LAB_SAFE, CERTIFY_LAB and PILOT stages', () => {
  const stages = policy().stages || {};
  assert.deepEqual(Object.keys(stages).sort(), ['CERTIFY_LAB', 'LAB_SAFE', 'PILOT']);
  for (const stage of Object.values(stages) as Record<string, any>[]) {
    assert.equal(stage.production_release_gate, 'BLOCKED');
    assert.equal(stage.upload_scanner_verified, 'NO');
  }
});

test('LAB_SAFE is fail-closed and does not consume pilot evidence', () => {
  const stage = policy().stages.LAB_SAFE;
  assert.equal(stage.runtime_mode, 'LAB');
  assert.equal(stage.pilot_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'BLOCK');
  assert.equal(stage.requires_pilot_evidence, false);
});

test('CERTIFY_LAB remains LAB while requiring bound pilot evidence', () => {
  const stage = policy().stages.CERTIFY_LAB;
  assert.equal(stage.runtime_mode, 'LAB');
  assert.equal(stage.pilot_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'MANUAL_REVIEW');
  assert.equal(stage.requires_pilot_evidence, true);
});

test('PILOT activates only controlled manual-review mode and still requires evidence', () => {
  const stage = policy().stages.PILOT;
  assert.equal(stage.runtime_mode, 'PILOT');
  assert.equal(stage.pilot_release_gate, 'APPROVED');
  assert.equal(stage.production_release_gate, 'BLOCKED');
  assert.equal(stage.upload_quarantine_mode, 'MANUAL_REVIEW');
  assert.equal(stage.requires_pilot_evidence, true);
});

test('pilot evidence registry has exactly the mandatory release records and explicit flag mapping', () => {
  const registry = evidence();
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.scope, 'controlled-pilot');
  assert.deepEqual(Object.keys(registry.release_evidence || {}).sort(), Object.keys(expectedEvidence).sort());

  for (const [id, flag] of Object.entries(expectedEvidence)) {
    const item = registry.release_evidence[id];
    assert.equal(item.environment_flag, flag);
    assert.ok(['PENDING', 'PASS', 'FAIL'].includes(item.status));
    assert.match(item.source_path, /^docs\/.+\.md$/);
    assert.match(item.template_blob_sha, /^[a-f0-9]{40}$/);
    assert.match(item.source_blob_sha, /^[a-f0-9]{40}$/);
    if (item.status === 'PASS') {
      assert.notEqual(item.source_blob_sha, item.template_blob_sha, `${id} PASS must not point at its initial template blob`);
      assert.match(item.verified_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    } else {
      assert.equal(item.verified_at, null);
    }
  }
});
