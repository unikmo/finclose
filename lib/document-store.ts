// Storage for receipts and invoices the owner uploads. Metadata goes in a
// document store, the bytes in a blob store; both are interfaces so the intake
// logic is tested in memory and runs on Firestore + Cloud Storage in PILOT/PRODUCTION.

export type DocumentStatus = 'QUARANTINED' | 'CLEAN' | 'REJECTED';

export type DocumentRecord = {
  document_id: string;
  company_id: string;
  organization_id: string;
  filename: string; // sanitised
  content_type: string;
  bytes: number;
  sha256: string;
  status: DocumentStatus;
  security_review_status: 'NOT_REQUIRED_LAB' | 'AWAITING_MANUAL_REVIEW' | 'AWAITING_SCANNER' | 'MANUAL_REVIEW_CLEAN' | 'MANUAL_REVIEW_REJECTED';
  uploaded_by: string;
  uploaded_at: number;
  reviewed_by?: string;
  reviewed_at?: number;
  review_note?: string;
  storage_path: string;
  expires_at: number;
};

export interface DocumentStore {
  insert(record: DocumentRecord, bytes: Buffer): Promise<void>;
  get(documentId: string): Promise<DocumentRecord | null>;
  findBySha(companyId: string, sha256: string): Promise<DocumentRecord | null>;
  listByCompany(companyId: string): Promise<DocumentRecord[]>;
  setReview(record: DocumentRecord): Promise<void>; // metadata only; callers enforce the one-way transition
  readBytes(record: DocumentRecord): Promise<Buffer>;
  delete(record: DocumentRecord): Promise<void>;
  extendExpiry(documentId: string, expiresAt: number): Promise<void>; // only ever moves the expiry later
  listExpired(now: number, limit: number): Promise<DocumentRecord[]>; // across all companies, for the scheduled purge
}

export class InMemoryDocumentStore implements DocumentStore {
  private docs = new Map<string, { record: DocumentRecord; bytes: Buffer }>();
  async insert(record: DocumentRecord, bytes: Buffer) { this.docs.set(record.document_id, { record: { ...record }, bytes: Buffer.from(bytes) }); }
  async get(id: string) { const hit = this.docs.get(id); return hit ? { ...hit.record } : null; }
  async findBySha(companyId: string, sha: string) {
    for (const { record } of this.docs.values()) if (record.company_id === companyId && record.sha256 === sha) return { ...record };
    return null;
  }
  async listByCompany(companyId: string) {
    return [...this.docs.values()].map(d => ({ ...d.record })).filter(r => r.company_id === companyId).sort((a, b) => b.uploaded_at - a.uploaded_at);
  }
  async setReview(record: DocumentRecord) {
    const hit = this.docs.get(record.document_id);
    if (hit) hit.record = { ...record };
  }
  async readBytes(record: DocumentRecord) {
    const hit = this.docs.get(record.document_id);
    if (!hit) throw new Error('document bytes not found');
    return Buffer.from(hit.bytes);
  }
  async delete(record: DocumentRecord) { this.docs.delete(record.document_id); }
  async extendExpiry(id: string, expiresAt: number) {
    const hit = this.docs.get(id);
    if (hit && expiresAt > hit.record.expires_at) hit.record = { ...hit.record, expires_at: expiresAt };
  }
  async listExpired(now: number, limit: number) {
    return [...this.docs.values()].map(d => ({ ...d.record })).filter(r => r.expires_at < now).slice(0, limit);
  }
}
