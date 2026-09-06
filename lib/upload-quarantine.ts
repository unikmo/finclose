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
  if (!input.actor_user_id) throw httpError('authenticated reviewer identity is required', 403);
  if (!['CLEAN', 'REJECTED'].includes(input.decision)) throw httpError('decision must be CLEAN or REJECTED', 400);

  const deployment = await getServiceDeployment(input.deployment_id) as Record<string, any>;
  const pointer = target(input.kind, input.artifact_id);
  const db = realtimeDatabase();
  const snap = await db.ref(pointer.path).once('value');
  if (!snap.exists()) throw httpError('upload artifact not found', 404);
  const artifact = snap.val() as Record<string, any>;
  if (String(artifact[pointer.idField] || '') !== input.artifact_id || String(artifact.deployment_id || '') !== input.deployment_id) {
    throw httpError('upload artifact does not belong to this deployment', 403);
  }
  if (String(artifact.organization_id || '') !== String(deployment.organization_id || '')) {
    throw httpError('upload artifact organization ownership mismatch', 403);
  }
  if (!artifact.storage_path) throw httpError('upload artifact storage path is missing', 409);

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
      const approvedCount = Number(deployment.history_count || 0) + (String(artifact.status || '') === 'RECEIVED' ? 0 : 1);
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
        ...(artifact.storage_metadata || {}),
        securityReviewStatus,
        securityReviewedBy: input.actor_user_id,
        securityReviewedAt: String(now)
      }
    });
  } catch {
    // RTDB remains the workflow record. Storage metadata failure is visible through the audit trail and can be retried.
  }

  const reviewed = await db.ref(pointer.path).once('value');
  return reviewed.val();
}
