import type { Firestore } from 'firebase-admin/firestore';
import type { Connection, ConnectionStore, ProviderId } from './connectors';

// Connections live in finclose_prod_connections, one document per company and provider, holding
// only SEALED tokens (connectors.ts). Pushes are kept in a sub-collection so a replay is detected.
const CONNECTIONS = 'finclose_prod_connections';
const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');
const docId = (companyId: string, provider: ProviderId) => `${safe(companyId)}__${provider}`;

export class FirestoreConnectionStore implements ConnectionStore {
  private readonly injectedDb?: Firestore;
  constructor(db?: Firestore) { this.injectedDb = db; }
  private async db(): Promise<Firestore> {
    if (this.injectedDb) return this.injectedDb;
    const [{ getFirestore }, { firebaseApp }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend')]);
    return getFirestore(firebaseApp());
  }
  async get(companyId: string, provider: ProviderId) {
    const snap = await (await this.db()).collection(CONNECTIONS).doc(docId(companyId, provider)).get();
    return snap.exists ? (snap.data() as Connection) : null;
  }
  async put(connection: Connection) {
    await (await this.db()).collection(CONNECTIONS).doc(docId(connection.company_id, connection.provider)).set(connection);
  }
  async delete(companyId: string, provider: ProviderId) {
    const db = await this.db();
    const ref = db.collection(CONNECTIONS).doc(docId(companyId, provider));
    const pushes = await ref.collection('pushes').get();
    await Promise.all(pushes.docs.map(d => d.ref.delete()));
    await ref.delete();
  }
  async listPushed(companyId: string, provider: ProviderId) {
    const snap = await (await this.db()).collection(CONNECTIONS).doc(docId(companyId, provider)).collection('pushes').get();
    return snap.docs.map(d => d.data() as { pack_hash: string; external_id: string; pushed_at: number });
  }
  async recordPush(companyId: string, provider: ProviderId, push: { pack_hash: string; external_id: string; pushed_at: number }) {
    await (await this.db()).collection(CONNECTIONS).doc(docId(companyId, provider)).collection('pushes').doc(push.pack_hash.slice(0, 64)).set(push);
  }
}
