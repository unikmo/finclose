import crypto from 'node:crypto';
import { validateFinancialUpload } from './file-security';
import type { DocumentRecord, DocumentStatus, DocumentStore } from './document-store';
import { expiryFrom, retentionPolicy } from './retention';
import { scanBytes, type MalwareScanner } from './malware-scan';
import { readReceipt, type OcrEngine } from './receipt-extract';

// Receipts and invoices an owner attaches to a transaction. Rules:
//  - the file is checked by type, signature and size (file-security.ts);
//  - in real-data mode it is QUARANTINED and cannot back any answer until a
//    reviewer marks it CLEAN (manual review) or a scanner does (SCANNER mode,
//    see malware-scan.ts: a scanner that is down or unconfigured leaves the file quarantined);
//  - a decision is one-way, like the existing service-upload review;
//  - the same file uploaded twice for a company is stored once.


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
    expires_at: expiryFrom(now, retentionPolicy().document_days)
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

// A receipt a pack depends on must not expire before the pack does. Only ever moves the expiry later.
export async function keepDocumentsUntil(docs: DocumentStore, documentIds: string[], expiresAt: number): Promise<void> {
  for (const id of new Set(documentIds)) await docs.extendExpiry(id, expiresAt);
}

// SCANNER mode: scans a quarantined document and records the outcome. CLEAN and INFECTED are
// one-way like a manual decision. An ERROR (scanner down, timed out, not configured) changes
// nothing except the attempt count, so the file stays quarantined and can be scanned again.
export async function scanDocument(
  store: DocumentStore,
  documentId: string,
  companyId: string,
  scanner: MalwareScanner | null,
  mode: 'MANUAL_REVIEW' | 'SCANNER' | 'BLOCK',
  now = Date.now()
): Promise<DocumentRecord> {
  if (mode !== 'SCANNER') throw httpError('scanning is only available in SCANNER quarantine mode', 409);
  const record = await store.get(documentId);
  if (!record || record.company_id !== companyId) throw httpError('document not found', 404);
  if (record.status !== 'QUARANTINED') return record;
  const verdict = await scanBytes(await store.readBytes(record), scanner);
  const { scan_detail: _previous, ...base } = record;
  const attempts = (record.scan_attempts || 0) + 1;
  let next: DocumentRecord;
  if (verdict.verdict === 'CLEAN') {
    next = { ...base, status: 'CLEAN', security_review_status: 'SCANNER_CLEAN', reviewed_by: 'scanner', reviewed_at: now, scan_engine: verdict.engine, scan_attempts: attempts };
  } else if (verdict.verdict === 'INFECTED') {
    next = { ...base, status: 'REJECTED', security_review_status: 'SCANNER_REJECTED', reviewed_by: 'scanner', reviewed_at: now, scan_engine: verdict.engine, scan_detail: verdict.signature, scan_attempts: attempts };
  } else {
    next = { ...base, scan_engine: verdict.engine, scan_detail: verdict.detail, scan_attempts: attempts };
  }
  await store.setReview(next);
  return next;
}

// Reads a CLEAN receipt or invoice and keeps what was found on the record. Only a clean file is
// ever opened. Reading again replaces the earlier result; the file and its status do not change.
export async function readDocument(
  store: DocumentStore,
  documentId: string,
  companyId: string,
  ocr: OcrEngine | null,
  pdfText: (bytes: Buffer) => Promise<string>
): Promise<DocumentRecord> {
  const record = await store.get(documentId);
  if (!record || record.company_id !== companyId) throw httpError('document not found', 404);
  if (record.status !== 'CLEAN') throw httpError(`document is ${record.status.toLowerCase()} and cannot be read yet`, 409);
  const outcome = await readReceipt(await store.readBytes(record), record.content_type, ocr, pdfText);
  const { extracted: _e, read_note: _n, ...base } = record;
  const next: DocumentRecord = 'fields' in outcome ? { ...base, extracted: outcome.fields } : { ...base, read_note: outcome.unreadable };
  await store.setReview(next);
  return next;
}
