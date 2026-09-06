import { realtimeDatabase, storageBucket } from './finclose-backend';
import { getServiceDeployment } from './service-deployments';
import { assertRealDataRuntimeReady, isRealDataMode, uploadQuarantineMode } from './runtime-mode';

export type UploadReviewDecision = 'CLEAN' | 'REJECTED';
export type UploadArtifactKind = 'history' | 'source';

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function target(kind: UploadArtifactKind, artifactId: string) {
  return kind === 'history'
    ? { path: `finclose_service_history/${artifactId}`, idField: 'history_id' }
    : { path: `finclose_service_sources/${artifactId}`, idField: 'source_id' };
}

async function loadArtifact(deploymentId: string, kind: UploadArtifactKind, artifactId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const pointer = target(kind, artifactId);
  const db = realtimeDatabase();
  const snap = await db.ref(pointer.path).once('value');
  if (!snap.exists()) throw httpError('upload artifact not found', 404);
  const artifact = snap.val() as Record<string, any>;
  if (String(artifact[pointer.idField] || '') !== artifactId || String(artifact.deployment_id || '') !== deploymentId) {
    throw httpError('upload artifact does not belong to this deployment', 403);
  }
  if (String(artifact.organization_id || '') !== String(deployment.organization_id || '')) {
    throw httpError('upload artifact organization ownership mismatch', 403);
  }
  if (!artifact.storage_path) throw httpError('upload artifact storage path is missing', 409);
  return { deployment, pointer, artifact };
}

export function realDataUploadSecurityState() {
  if (!isRealDataMode()) return { status: 'RECEIVED', security_review_status: 'NOT_REQUIRED_LAB' } as const;
  assertRealDataRuntimeReady();
  const mode = uploadQuarantineMode();
  if (mode === 'BLOCK') throw httpError('real-data uploads are blocked until a quarantine/review policy is configured', 503);
  return {
    status: 'QUARANTINED',
    security_review_status: mode === 'SCANNER' ? 'AWAITING_SCANNER' : 'AWAITING_MANUAL_REVIEW'
  } as const;
}

export function quarantineStorageSegment() {
  return isRealDataMode() ? 'quarantine' : 'accepted';
}

export async function downloadServiceUploadForReview(input: {
  deployment_id: string;
  kind: UploadArtifactKind;
  artifact_id: string;
}) {
  if (!isRealDataMode()) throw httpError('upload security review is only used in PILOT or PRODUCTION mode', 409);
  assertRealDataRuntimeReady();
  if (uploadQuarantineMode() !== 'MANUAL_REVIEW') {
    throw httpError('manual upload inspection is disabled unless MANUAL_REVIEW quarantine mode is active', 409);
  }
  const { artifact } = await loadArtifact(input.deployment_id, input.kind, input.artifact_id);
  if (String(artifact.status || '') !== 'QUARANTINED') throw httpError('only quarantined artifacts can be downloaded for manual review', 409);
  const [buffer] = await storageBucket().file(String(artifact.storage_path)).download();
  return {
    artifact: {
      artifact_id: input.artifact_id,
      filename: String(artifact.filename || 'financial-upload'),
      bytes: Number(artifact.bytes || buffer.length),
      sha256: String(artifact.sha256 || ''),
      content_type: String(artifact.content_type || 'application/octet-stream'),
      security_review_status: String(artifact.security_review_status || '')
    },
    buffer
  };
}

export async function reviewServiceUpload(input: {
  deployment_id: string;
  kind: UploadArtifactKind;
  artifact_id: string;
  actor_user_id: string;
  decision: UploadReviewDecision;
  note?: string;
}) {
  if (!isRealDataMode()) throw httpError('upload security review is only used in PILOT or PRODUCTION mode', 409);
  assertRealDataRuntimeReady();
  if (uploadQuarantineMode() !== 'MANUAL_REVIEW') {
    throw httpError('manual upload clearance is disabled unless MANUAL_REVIEW quarantine mode is active', 409);
  }
  if (!input.actor_user_id) throw httpError('authenticated reviewer identity is required', 403);
  if (!['CLEAN', 'REJECTED'].includes(input.decision)) throw httpError('decision must be CLEAN or REJECTED', 400);

  const { deployment, pointer, artifact } = await loadArtifact(input.deployment_id, input.kind, input.artifact_id);
  const existingStatus = String(artifact.status || '');
  if (existingStatus === 'RECEIVED' && input.decision === 'CLEAN') return { ...artifact, duplicate: true };
  if (existingStatus === 'REJECTED' && input.decision === 'REJECTED') return { ...artifact, duplicate: true };
  if (existingStatus !== 'QUARANTINED') {
    throw httpError('security review decisions are immutable; only a quarantined artifact can be cleared or rejected', 409);
  }

  const db = realtimeDatabase();
  const now = Date.now();
  const note = String(input.note || '').trim().slice(0, 500) || null;
  const clean = input.decision === 'CLEAN';
  const status = clean ? 'RECEIVED' : 'REJECTED';
  const securityReviewStatus = clean ? 'CLEAN' : 'REJECTED';
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const updates: Record<string, unknown> = {
    [`${pointer.path}/status`]: status,
    [`${pointer.path}/security_review_status`]: securityReviewStatus,
    [`${pointer.path}/security_reviewed_by`]: input.actor_user_id,
    [`${pointer.path}/security_reviewed_at`]: now,
    [`${pointer.path}/security_review_note`]: note,
    [`finclose_audit_events/${auditKey}`]: {
      event: clean ? 'FINANCIAL_UPLOAD_CLEARED' : 'FINANCIAL_UPLOAD_REJECTED',
      organization_id: deployment.organization_id || null,
      company_id: deployment.company_id || null,
      deployment_id: input.deployment_id,
      artifact_kind: input.kind,
      artifact_id: input.artifact_id,
      actor_user_id: input.actor_user_id,
      note,
      created_at: now
    }
  };

  if (input.kind === 'history') {
    if (clean) {
      const approvedCount = Number(deployment.history_count || 0) + 1;
      updates[`finclose_service_deployments/${input.deployment_id}/history_status`] = 'RECEIVED';
      updates[`finclose_service_deployments/${input.deployment_id}/history_count`] = approvedCount;
      updates[`finclose_service_deployments/${input.deployment_id}/latest_history_id`] = input.artifact_id;
      updates[`finclose_service_deployments/${input.deployment_id}/status`] = 'HISTORY_RECEIVED_CONNECTOR_READY';
    } else if (String(deployment.history_status || '') !== 'RECEIVED') {
      updates[`finclose_service_deployments/${input.deployment_id}/history_status`] = 'REVIEW_REJECTED_HISTORY_REQUIRED';
      updates[`finclose_service_deployments/${input.deployment_id}/status`] = 'HISTORY_REQUIRED';
    }
  } else {
    if (clean) {
      updates[`finclose_service_deployments/${input.deployment_id}/latest_source_id`] = input.artifact_id;
      updates[`finclose_service_deployments/${input.deployment_id}/status`] = 'READY_FOR_AGENT';
    } else if (String(deployment.latest_source_id || '') === input.artifact_id) {
      updates[`finclose_service_deployments/${input.deployment_id}/latest_source_id`] = null;
      updates[`finclose_service_deployments/${input.deployment_id}/status`] = 'READY_FOR_SOURCE';
    }
  }
  updates[`finclose_service_deployments/${input.deployment_id}/updated_at`] = now;

  await db.ref().update(updates);
  try {
    await storageBucket().file(String(artifact.storage_path)).setMetadata({
      metadata: {
        securityReviewStatus,
        securityReviewedBy: input.actor_user_id,
        securityReviewedAt: String(now)
      }
    });
  } catch (error) {
    const metadataAuditKey = db.ref('finclose_audit_events').push().key!;
    await db.ref(`finclose_audit_events/${metadataAuditKey}`).set({
      event: 'UPLOAD_STORAGE_METADATA_SYNC_FAILED',
      organization_id: deployment.organization_id || null,
      company_id: deployment.company_id || null,
      deployment_id: input.deployment_id,
      artifact_kind: input.kind,
      artifact_id: input.artifact_id,
      actor_user_id: input.actor_user_id,
      detail: (error as Error).message,
      created_at: Date.now()
    });
  }

  const reviewed = await db.ref(pointer.path).once('value');
  return reviewed.val();
}
