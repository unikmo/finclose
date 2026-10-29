import crypto from 'node:crypto';
import { validateFinancialUpload } from './file-security';
import type { DocumentRecord, DocumentStatus, DocumentStore } from './document-store';

// Receipts and invoices an owner attaches to a transaction. Rules:
//  - the file is checked by type, signature and size (file-security.ts);
//  - in real-data mode it is QUARANTINED and cannot back any answer until a
//    reviewer marks it CLEAN (manual review) or a scanner does (not built: in
//    SCANNER mode a file simply stays quarantined);
//  - a decision is one-way, like the existing service-upload review;
//  - the same file uploaded twice for a company is stored once.

export const DOCUMENT_RETENTION_DAYS = 90;

export type SecurityState = { status: 'RECEIVED' | 'QUARANTINED'; security_review_status: 'NOT_REQUIRED_LAB' | 'AWAITING_MANUAL_REVIEW' | 'AWAITING_SCANNER' };

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export async function defaultSecurityState(): Promise<SecurityState> {
  const { realDataUploadSecurityState } = await import('./upload-quarantine');
  return realDataUploadSecurityState() as SecurityState;
}

export async function uploadDocument(
  store: DocumentStore,
  args: { company_id: string; organization_id: string; actor: { user_id: string }; filename: string; bytes: Buffer },
  security: SecurityState,
  now = Date.now()
): Promise<{ record: DocumentRecord; duplicate: boolean }> {
  const checked = validateFinancialUpload(args.filename, args.bytes, 'current_source');
  if (checked.extension === '.xlsx' || checked.extension === '.csv') throw httpError('attach a receipt or invoice as PDF, PNG or JPG', 415);
  const sha = crypto.createHash('sha256').update(args.bytes).digest('hex');
  const existing = await store.findBySha(args.company_id, sha);
  if (existing) return { record: existing, duplicate: true };
  const id = `doc_${crypto.randomBytes(12).toString('hex')}`;
  const record: DocumentRecord = {
    document_id: id,
    company_id: args.company_id,
    organization_id: args.organization_id,
    filename: checked.safe_name,
    content_type: checked.content_type,
    bytes: checked.bytes,
    sha256: sha,
    status: security.status === 'RECEIVED' ? 'CLEAN' : 'QUARANTINED',
    security_review_status: security.security_review_status,
    uploaded_by: args.actor.user_id,
    uploaded_at: now,
    storage_path: `finclose/${security.status === 'RECEIVED' ? 'accepted' : 'quarantine'}/${args.company_id.replace(/[^A-Za-z0-9_-]/g, '_')}/${id}`,
    expires_at: now + DOCUMENT_RETENTION_DAYS * 86_400_000
  };
  await store.insert(record, args.bytes);
  return { record, duplicate: false };
}

export async function reviewDocument(
  store: DocumentStore,
  documentId: string,
  companyId: string,
  actor: { user_id: string },
  decision: 'CLEAN' | 'REJECTED',
  note: string,
  mode: 'MANUAL_REVIEW' | 'SCANNER' | 'BLOCK',
  now = Date.now()
): Promise<DocumentRecord> {
  if (mode !== 'MANUAL_REVIEW') throw httpError('manual clearance is only available in MANUAL_REVIEW quarantine mode', 409);
  if (decision !== 'CLEAN' && decision !== 'REJECTED') throw httpError('decision must be CLEAN or REJECTED', 400);
  const record = await store.get(documentId);
  if (!record || record.company_id !== companyId) throw httpError('document not found', 404);
  if (record.uploaded_by === actor.user_id) throw httpError('a different person must review this upload', 403);
  if (record.status !== 'QUARANTINED') throw httpError('security review decisions are immutable; only a quarantined document can be reviewed', 409);
  const next: DocumentRecord = {
    ...record,
    status: decision,
    security_review_status: decision === 'CLEAN' ? 'MANUAL_REVIEW_CLEAN' : 'MANUAL_REVIEW_REJECTED',
    reviewed_by: actor.user_id,
    reviewed_at: now,
    review_note: String(note || '').slice(0, 500)
  };
  await store.setReview(next);
  return next;
}

// Document ids an answer may cite: they must exist for this company and be CLEAN.
export async function assertLinkable(store: DocumentStore, companyId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const record = await store.get(id);
    if (!record || record.company_id !== companyId) throw httpError(`document ${id} not found for this company`, 400);
    const status: DocumentStatus = record.status;
    if (status !== 'CLEAN') throw httpError(`document ${id} is ${status.toLowerCase()} and cannot be linked yet`, 409);
  }
}
