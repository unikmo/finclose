import { realtimeDatabase } from './finclose-backend';
import {
  pilotReleaseEvidenceStatus,
  validatePilotCertificationEvidence,
  type PilotReleaseEvidenceStatus,
  type StoredPilotCertificationLatest,
  type StoredPilotCertificationReport
} from './pilot-release-evidence';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from './release-version';
import { runtimeMode, runtimeReadiness } from './runtime-mode';

export type { PilotReleaseEvidenceStatus } from './pilot-release-evidence';

export async function getPilotReleaseEvidenceStatus(): Promise<PilotReleaseEvidenceStatus> {
  const mode = runtimeMode();
  const required = mode !== 'LAB';
  if (mode === 'PRODUCTION') {
    return pilotReleaseEvidenceStatus({ required: true, ready: false, code: 'PRODUCTION_RELEASE_CERTIFICATION_NOT_IMPLEMENTED' });
  }

  try {
    const db = realtimeDatabase();
    const latestSnap = await db.ref('finclose_pilot_certification_latest').once('value');
    if (!latestSnap.exists()) return pilotReleaseEvidenceStatus({ required, ready: false, code: 'PILOT_CERTIFICATION_MISSING' });
    const latest = latestSnap.val() as StoredPilotCertificationLatest;
    const runId = String(latest?.run_id || '').trim();
    if (!runId) return pilotReleaseEvidenceStatus({ required, ready: false, code: 'PILOT_CERTIFICATION_RUN_ID_MISSING' });
    const reportSnap = await db.ref(`finclose_pilot_certification_runs/${runId}`).once('value');
    if (!reportSnap.exists()) return pilotReleaseEvidenceStatus({ required, ready: false, code: 'PILOT_CERTIFICATION_REPORT_MISSING', run_id: runId });
    const validated = validatePilotCertificationEvidence(
      latest,
      reportSnap.val() as StoredPilotCertificationReport,
      PILOT_CERTIFICATION_VERSION,
      FINCLOSE_RELEASE_VERSION
    );
    return { ...validated, required };
  } catch {
    return pilotReleaseEvidenceStatus({ required, ready: false, code: 'PILOT_CERTIFICATION_EVIDENCE_UNAVAILABLE' });
  }
}

export async function assertRealDataReleaseCertified() {
  const mode = runtimeMode();
  if (mode === 'LAB') return pilotReleaseEvidenceStatus({ required: false, ready: false, code: 'LAB_MODE_NO_REAL_DATA' });

  const readiness = runtimeReadiness();
  if (!readiness.real_data_allowed_by_config) {
    const error = new Error(`real-data runtime is blocked: ${readiness.blockers.join(', ') || 'release configuration is incomplete'}`);
    (error as Error & { status?: number }).status = 503;
    throw error;
  }

  const evidence = await getPilotReleaseEvidenceStatus();
  if (!evidence.ready) {
    const error = new Error(`real-data release certification is blocked: ${evidence.code}`);
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return evidence;
}
