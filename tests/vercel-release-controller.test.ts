import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedTeamId = 'team_sVekjWxQpKBAOb3DWW89HdvK';
const expectedProjectId = 'prj_fn9VRSUOqwpOHkXEuLDGHVvoMHSC';
const expectedProductionUrl = 'https://finclose-lab-preview.vercel.app';

function state() {
  return JSON.parse(readFileSync(new URL('../ops/vercel-release-state.json', import.meta.url), 'utf8')) as Record<string, any>;
}

test('Vercel release controller is pinned to canonical FinClose project', () => {
  const value = state();
  assert.equal(value.schema_version, 1);
  assert.equal(value.project?.team_id, expectedTeamId);
  assert.equal(value.project?.project_id, expectedProjectId);
  assert.equal(value.project?.production_url, expectedProductionUrl);
});

test('Vercel release controller supports only controlled LAB or PILOT states', () => {
  const release = state().release || {};
  assert.ok(['LAB', 'PILOT'].includes(release.runtime_mode));
  assert.equal(release.production_release_gate, 'BLOCKED');

  if (release.runtime_mode === 'LAB') {
    assert.equal(release.pilot_release_gate, 'BLOCKED');
    assert.equal(release.upload_quarantine_mode, 'BLOCK');
  } else {
    assert.equal(release.pilot_release_gate, 'APPROVED');
    assert.ok(['MANUAL_REVIEW', 'SCANNER'].includes(release.upload_quarantine_mode));
  }
});

test('Vercel release controller evidence flags are explicit YES/NO values', () => {
  const release = state().release || {};
  for (const key of [
    'upload_scanner_verified',
    'backup_pitr_verified',
    'security_review_approved',
    'accounting_qa_approved',
    'manual_upload_procedure_approved',
    'auth_email_delivery_verified',
    'upload_operator_checklist_verified'
  ]) {
    assert.ok(['YES', 'NO'].includes(release[key]), `${key} must be YES or NO`);
  }
});
