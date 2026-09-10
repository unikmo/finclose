import crypto from 'node:crypto';

export type StoredGate = {
  id?: string;
  status?: string;
  mandatory?: boolean;
  evidence?: string;
  detail?: Record<string, unknown>;
};

export type StoredPilotCertificationReport = {
  certification_version?: string;
  release_version?: string;
  release_source_sha?: string;
  run_id?: string;
  runtime_mode?: string;
  release_ready?: boolean;
  activation_allowed?: boolean;
  blockers?: unknown[];
  gates?: StoredGate[];
  evidence_hash?: string;
  completed_at?: number;
};

export type StoredPilotCertificationLatest = {
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
  release_source_sha: string | null;
  completed_at: number | null;
};

export function pilotReleaseEvidenceStatus(
  input: Partial<PilotReleaseEvidenceStatus> & Pick<PilotReleaseEvidenceStatus, 'required' | 'ready' | 'code'>
): PilotReleaseEvidenceStatus {
  return {
    required: input.required,
    ready: input.ready,
    code: input.code,
    run_id: input.run_id || null,
    evidence_hash: input.evidence_hash || null,
    certification_version: input.certification_version || null,
    release_version: input.release_version || null,
    release_source_sha: input.release_source_sha || null,
    completed_at: input.completed_at || null
  };
}

/**
 * Deterministic JSON serialization with recursively sorted object keys.
 *
 * The certification evidence hash is computed once when the report is written
 * and recomputed when it is read back to verify integrity. Firebase Realtime
 * Database does not preserve object key insertion order on read, so hashing a
 * plain `JSON.stringify` of the report (whose gate `detail` objects are nested
 * arbitrary shapes) produces a different digest after a write/read round-trip.
 * Canonicalizing key order makes the digest stable across storage.
 */
export function canonicalJSONStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSONStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJSONStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function pilotCertificationEvidencePayload(report: StoredPilotCertificationReport) {
  return {
    certification_version: String(report.certification_version || '').trim(),
    release_version: String(report.release_version || '').trim(),
    release_source_sha: String(report.release_source_sha || '').trim().toLowerCase(),
    run_id: String(report.run_id || '').trim(),
    gates: Array.isArray(report.gates)
      ? report.gates.map(({ id, status, mandatory, evidence, detail }) => ({ id, status, mandatory, evidence, detail }))
      : []
  };
}

export function computePilotCertificationEvidenceHash(report: StoredPilotCertificationReport) {
  return crypto.createHash('sha256').update(canonicalJSONStringify(pilotCertificationEvidencePayload(report))).digest('hex');
}

export function validatePilotCertificationEvidence(
  latest: StoredPilotCertificationLatest | null | undefined,
  report: StoredPilotCertificationReport | null | undefined,
  expectedCertificationVersion: string,
  expectedReleaseVersion: string,
  expectedReleaseSourceSha: string
): PilotReleaseEvidenceStatus {
  const base = { required: true, ready: false } as const;
  if (!latest || !report) return pilotReleaseEvidenceStatus({ ...base, code: 'PILOT_CERTIFICATION_MISSING' });

  const runId = String(report.run_id || '').trim();
  const latestRunId = String(latest.run_id || '').trim();
  const evidenceHash = String(report.evidence_hash || '').trim().toLowerCase();
  const latestHash = String(latest.evidence_hash || '').trim().toLowerCase();
  const certificationVersion = String(report.certification_version || '').trim();
  const releaseVersion = String(report.release_version || '').trim();
  const releaseSourceSha = String(report.release_source_sha || '').trim().toLowerCase();
  const expectedSourceSha = String(expectedReleaseSourceSha || '').trim().toLowerCase();
  const completedAt = Number(report.completed_at || 0) || null;
  const details = {
    run_id: runId || null,
    evidence_hash: evidenceHash || null,
    certification_version: certificationVersion || null,
    release_version: releaseVersion || null,
    release_source_sha: releaseSourceSha || null,
    completed_at: completedAt
  };

  if (!runId || runId !== latestRunId) return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_RUN_MISMATCH' });
  if (certificationVersion !== expectedCertificationVersion || releaseVersion !== expectedReleaseVersion) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_VERSION_MISMATCH' });
  }
  if (!/^[a-f0-9]{40}$/.test(expectedSourceSha) || releaseSourceSha !== expectedSourceSha) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_SOURCE_MISMATCH' });
  }
  const recomputedHash = computePilotCertificationEvidenceHash(report);
  if (!/^[a-f0-9]{64}$/.test(evidenceHash) || evidenceHash !== latestHash || evidenceHash !== recomputedHash) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_HASH_MISMATCH' });
  }
  if (String(report.runtime_mode || '').trim().toUpperCase() !== 'LAB') {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_NOT_PRE_ACTIVATION' });
  }
  if (report.release_ready !== true || latest.release_ready !== true) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_NOT_RELEASE_READY' });
  }
  if (report.activation_allowed !== true || latest.activation_allowed !== true) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_ACTIVATION_NOT_ALLOWED' });
  }
  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_HAS_BLOCKERS' });
  }
  if (!Array.isArray(report.gates) || report.gates.length === 0) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_GATES_MISSING' });
  }
  if (report.gates.some(item => item?.mandatory === true && String(item.status || '').toUpperCase() !== 'PASS')) {
    return pilotReleaseEvidenceStatus({ ...base, ...details, code: 'PILOT_CERTIFICATION_MANDATORY_GATE_NOT_PASS' });
  }

  return pilotReleaseEvidenceStatus({ required: true, ready: true, code: 'PILOT_CERTIFICATION_VERIFIED', ...details });
}
