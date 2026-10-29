import type { Firestore } from 'firebase-admin/firestore';
import type { LearnedRule } from './categorisation-engine';
import type { AccountOverrides } from './account-map-custom';
import type { PackRecord, PackStore } from './pack-store';

// Firestore implementation of PackStore (PILOT/PRODUCTION). Kept apart from
// pack-store.ts so the interface and in-memory store load without Firebase.
// Queries need a composite index: finclose_prod_review_packs (company_id ASC, created_at DESC).

function conflict() {
  const error = new Error('this pack was changed by someone else; reload and try again');
  (error as Error & { status?: number }).status = 409;
  return error;
}

const PACKS = 'finclose_prod_review_packs';
const INPUTS = 'finclose_prod_review_pack_inputs';
const RULES = 'finclose_prod_learned_rules';
const ACCOUNTS = 'finclose_prod_account_maps';

function safeId(value: string) { return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }

// TTL policies need a timestamp field; expires_at stays a plain number for the app's own checks.
const withTtl = <T extends { expires_at: number }>(doc: T) => ({ ...doc, ttl_at: new Date(doc.expires_at) });
function strip<T>(data: FirebaseFirestore.DocumentData): T {
  const { ttl_at: _ttl, ...rest } = data;
  return rest as T;
}

export class FirestorePackStore implements PackStore {
  // A Firestore can be injected (the emulator tests do); otherwise the app's Firebase is loaded on first use.
  private readonly injected?: Firestore;
  constructor(injected?: Firestore) { this.injected = injected; }
  private async db(): Promise<Firestore> {
    if (this.injected) return this.injected;
    const [{ getFirestore }, { firebaseApp }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend')]);
    return getFirestore(firebaseApp());
  }
  async insert(record: PackRecord, input: string) {
    const db = await this.db();
    const batch = db.batch();
    batch.create(db.collection(PACKS).doc(record.pack_id), withTtl(record));
    batch.create(db.collection(INPUTS).doc(record.pack_id), withTtl({ pack_id: record.pack_id, company_id: record.company_id, input, expires_at: record.expires_at }));
    await batch.commit();
  }
  async get(packId: string) {
    const db = await this.db();
    const [meta, input] = await Promise.all([db.collection(PACKS).doc(safeId(packId)).get(), db.collection(INPUTS).doc(safeId(packId)).get()]);
    if (!meta.exists || !input.exists) return null;
    return { record: strip<PackRecord>(meta.data()!), input: String(input.data()!.input) };
  }
  async update(record: PackRecord, expectedRevision: number) {
    const db = await this.db();
    const ref = db.collection(PACKS).doc(record.pack_id);
    let expiryChanged = false;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || (snap.data() as PackRecord).revision !== expectedRevision) throw conflict();
      expiryChanged = (snap.data() as PackRecord).expires_at !== record.expires_at;
      tx.set(ref, withTtl(record));
    });
    // The stored statement carries its own expiry. It is updated only when the expiry changed, and outside
    // the transaction: a blind write to it inside made every concurrent edit collide (the 409 emulator test caught that).
    if (expiryChanged) await db.collection(INPUTS).doc(record.pack_id).set({ expires_at: record.expires_at, ttl_at: new Date(record.expires_at) }, { merge: true });
  }
  async listByCompany(companyId: string) {
    const snap = await (await this.db()).collection(PACKS).where('company_id', '==', companyId).orderBy('created_at', 'desc').limit(200).get();
    return snap.docs.map(doc => strip<PackRecord>(doc.data()));
  }
  async listExpired(now: number, limit: number) {
    const snap = await (await this.db()).collection(PACKS).where('expires_at', '<', now).limit(limit).get();
    return snap.docs.map(doc => strip<PackRecord>(doc.data()));
  }
  async delete(packId: string) {
    const db = await this.db();
    const batch = db.batch();
    batch.delete(db.collection(PACKS).doc(safeId(packId)));
    batch.delete(db.collection(INPUTS).doc(safeId(packId)));
    await batch.commit();
  }
  async learnedRules(companyId: string) {
    const snap = await (await this.db()).collection(RULES).where('company_id', '==', companyId).limit(2000).get();
    return snap.docs.map(doc => doc.data().rule as LearnedRule);
  }
  async addLearnedRule(companyId: string, rule: LearnedRule) {
    const id = safeId(`${companyId}__${rule.direction}__${rule.merchant_key}`);
    await (await this.db()).collection(RULES).doc(id).set({ company_id: companyId, rule });
  }
  async deleteLearnedRules(companyId: string) {
    const db = await this.db();
    const snap = await db.collection(RULES).where('company_id', '==', companyId).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return snap.size;
  }
  async accountOverrides(companyId: string) {
    const snap = await (await this.db()).collection(ACCOUNTS).doc(safeId(companyId)).get();
    return snap.exists ? (snap.data()!.overrides as AccountOverrides) : null;
  }
  async setAccountOverrides(companyId: string, overrides: AccountOverrides | null) {
    const ref = (await this.db()).collection(ACCOUNTS).doc(safeId(companyId));
    if (overrides && Object.keys(overrides).length) await ref.set({ company_id: companyId, overrides });
    else await ref.delete();
  }
}
