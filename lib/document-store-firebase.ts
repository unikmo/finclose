import type { Firestore } from 'firebase-admin/firestore';
import type { DocumentRecord, DocumentStore } from './document-store';

// Firestore metadata + Cloud Storage bytes. Both can be injected (the emulator
// tests do); otherwise the app's Firebase is loaded on first use.
// Queries need composite indexes: finclose_prod_documents (company_id ASC, uploaded_at DESC).

const DOCS = 'finclose_prod_documents';

// TTL policies need a timestamp field; expires_at stays a plain number for the app's own checks.
const withTtl = (r: DocumentRecord) => ({ ...r, ttl_at: new Date(r.expires_at) });
function strip(data: FirebaseFirestore.DocumentData): DocumentRecord {
  const { ttl_at: _ttl, ...rest } = data;
  return rest as DocumentRecord;
}

export type BucketLike = {
  file(path: string): { save(data: Buffer, options?: Record<string, unknown>): Promise<unknown>; download(): Promise<[Buffer]>; delete(options?: Record<string, unknown>): Promise<unknown> };
};

export class FirebaseDocumentStore implements DocumentStore {
  private readonly injectedDb?: Firestore;
  private readonly injectedBucket?: BucketLike;
  constructor(db?: Firestore, bucket?: BucketLike) {
    this.injectedDb = db;
    this.injectedBucket = bucket;
  }
  private async db(): Promise<Firestore> {
    if (this.injectedDb) return this.injectedDb;
    const [{ getFirestore }, { firebaseApp }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend')]);
    return getFirestore(firebaseApp());
  }
  private async bucket(): Promise<BucketLike> {
    if (this.injectedBucket) return this.injectedBucket;
    const { storageBucket } = await import('./finclose-backend');
    return storageBucket() as unknown as BucketLike;
  }
  async insert(record: DocumentRecord, bytes: Buffer) {
    const bucket = await this.bucket();
    await bucket.file(record.storage_path).save(bytes, { contentType: record.content_type, resumable: false });
    await (await this.db()).collection(DOCS).doc(record.document_id).create(withTtl(record));
  }
  async get(id: string) {
    const snap = await (await this.db()).collection(DOCS).doc(id.replace(/[^A-Za-z0-9_-]/g, '_')).get();
    return snap.exists ? strip(snap.data()!) : null;
  }
  async findBySha(companyId: string, sha: string) {
    const snap = await (await this.db()).collection(DOCS).where('company_id', '==', companyId).where('sha256', '==', sha).limit(1).get();
    return snap.empty ? null : strip(snap.docs[0].data());
  }
  async listByCompany(companyId: string) {
    const snap = await (await this.db()).collection(DOCS).where('company_id', '==', companyId).orderBy('uploaded_at', 'desc').limit(500).get();
    return snap.docs.map(d => strip(d.data()));
  }
  async setReview(record: DocumentRecord) {
    await (await this.db()).collection(DOCS).doc(record.document_id).set(withTtl(record));
  }
  async readBytes(record: DocumentRecord) {
    const [buffer] = await (await this.bucket()).file(record.storage_path).download();
    return buffer;
  }
  async delete(record: DocumentRecord) {
    await (await this.bucket()).file(record.storage_path).delete({ ignoreNotFound: true });
    await (await this.db()).collection(DOCS).doc(record.document_id).delete();
  }
  async extendExpiry(id: string, expiresAt: number) {
    const db = await this.db();
    const ref = db.collection(DOCS).doc(id.replace(/[^A-Za-z0-9_-]/g, '_'));
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && expiresAt > (snap.data()!.expires_at as number)) tx.update(ref, { expires_at: expiresAt, ttl_at: new Date(expiresAt) });
    });
  }
  async listExpired(now: number, limit: number) {
    const snap = await (await this.db()).collection(DOCS).where('expires_at', '<', now).limit(limit).get();
    return snap.docs.map(d => strip(d.data()));
  }
}
