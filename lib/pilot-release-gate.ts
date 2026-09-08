import { realtimeDatabase } from './finclose-backend';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from './release-version';
import { runtimeMode, runtimeReadiness } from './runtime-mode';

type StoredGate = {
  status?: string;
  mandatory?: boolean;
};

type StoredPilotCertificationReport = {
  certification_version?: string;
  release_version?: string;
  run_id?: string;
  runtime_mode?: string;
  release_ready?: boolean;
  activation_allowed?: boolean;
  blockers?: unknown[];
  gates?: StoredGate[];
  evidence_hash?: string;
  completed_at?: number;
};

type StoredPilotCertificationLatest = {
  run_id?: string;
  release_ready?: boolean;
  activation_allowed?: boolean;
  evidence_hash?: string;
  completed_at?: number;
};

export type PilotReleaseEvidenceStatus = {
  required: boolean;
  ready: boolean;
  code: string;
  run_id: string | null;
  evidence_hash: string | null;
  certification_version: string | null;
  release_version: string | null;
  completed_at: number | null;
};

function status(input: Partial<PilotReleaseEvidenceStatus> & Pick<PilotReleaseEvidenceStatus, 'required' | 'ready' | 'code'>): PilotReleaseEvidenceStatus {
  return {
    required: input.required,
    ready: input.ready,
    code: input.code,
    run_id: input.run_id || null,
    evidence_hash: input.evidence_hash || null,
    certification_version: input.certification_version || null,
    release_version: input.release_version || null,
    completed_at: input.completed_at || null
  };
}

export function validatePilotCertificationEvidence(
  latest: StoredPilotCertificationLatest | null | undefined,
  report: StoredPilotCertificationReport | null | undefined
): PilotReleaseEvidenceStatus {
  const base = { required: true, ready: false } as const;
  if (!latest || !report) return status({ ...base, code: 'PILOT_CERTIFICATION_MISSING' });

  const runId = String(report.run_id || '').trim();
  const latestRunId = String(latest.run_id || '').trim();
  const evidenceHash = String(report.evidence_hash || '').trim().toLowerCase();
  const latestHash = String(latest.evidence_hash || '').trim().toLowerCase();
  const certificationVersion = String(report.certification_version || '').trim();
  const releaseVersion = String(report.release_version || '').trim();
  const completedAt = Number(report.completed_at || 0) || null;
  const details = {
    run_id: runId || null,
    evidence_hash: evidenceHash || null,
    certification_version: certificationVersion || null,
    release_version: releaseVersion || null,
    completed_at: completedAt
  };

  if (!runId || runId !== latestRunId) return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_RUN_MISMATCH' });
  if (!/^[a-f0-9]{64}$/.test(evidenceHash) || evidenceHash !== latestHash) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_HASH_MISMATCH' });
  }
  if (certificationVersion !== PILOT_CERTIFICATION_VERSION || releaseVersion !== FINCLOSE_RELEASE_VERSION) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_VERSION_MISMATCH' });
  }
  if (String(report.runtime_mode || '').trim().toUpperCase() !== 'LAB') {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_NOT_PRE_ACTIVATION' });
  }
  if (report.release_ready !== true || latest.release_ready !== true) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_NOT_RELEASE_READY' });
  }
  if (report.activation_allowed !== true || latest.activation_allowed !== true) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_ACTIVATION_NOT_ALLOWED' });
  }
  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_HAS_BLOCKERS' });
  }
  if (!Array.isArray(report.gates) || report.gates.length === 0) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_GATES_MISSING' });
  }
  if (report.gates.some(item => item?.mandatory === true && String(item.status || '').toUpperCase() !== 'PASS')) {
    return status({ ...base, ...details, code: 'PILOT_CERTIFICATION_MANDATORY_GATE_NOT_PASS' });
  }

  return status({ required: true, ready: true, code: 'PILOT_CERTIFICATION_VERIFIED', ...details });
}

export async function getPilotReleaseEvidenceStatus(): Promise<PilotReleaseEvidenceStatus> {
  const mode = runtimeMode();
  const required = mode !== 'LAB';
  if (mode === 'PRODUCTION') {
    return status({ required: true, ready: false, code: 'PRODUCTION_RELEASE_CERTIFICATION_NOT_IMPLEMENTED' });
  }

  try {
    const db = realtimeDatabase();
    const latestSnap = await db.ref('finclose_pilot_certification_latest').once('value');
    if (!latestSnap.exists()) return status({ required, ready: false, code: 'PILOT_CERTIFICATION_MISSING' });
    const latest = latestSnap.val() as StoredPilotCertificationLatest;
    const runId = String(latest?.run_id || '').trim();
    if (!runId) return status({ required, ready: false, code: 'PILOT_CERTIFICATION_RUN_ID_MISSING' });
    const reportSnap = await db.ref(`finclose_pilot_certification_runs/${runId}`).once('value');
    if (!reportSnap.exists()) return status({ required, ready: false, code: 'PILOT_CERTIFICATION_REPORT_MISSING', run_id: runId });
    const validated = validatePilotCertificationEvidence(latest, reportSnap.val() as StoredPilotCertificationReport);
    return { ...validated, required };
  } catch {
    return status({ required, ready: false, code: 'PILOT_CERTIFICATION_EVIDENCE_UNAVAILABLE' });
  }
}

export async function assertRealDataReleaseCertified() {
  const mode = runtimeMode();
  if (mode === 'LAB') return status({ required: false, ready: false, code: 'LAB_MODE_NO_REAL_DATA' });

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
