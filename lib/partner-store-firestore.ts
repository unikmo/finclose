import type { Firestore } from 'firebase-admin/firestore';
import type { CustomDeadline, FirmBranding, FirmInvitation, FirmPlan, FirmSettings, PartnerStore } from './partner-layer';

// Firestore store for the partner layer. Collections (all server-only; firestore.rules denies clients):
//   finclose_prod_firm_invitations/{invitation_id}   queried by firm_id and by token_hash
//   finclose_prod_firm_config/{firm_id}__plan | __branding | __settings
//   finclose_prod_firm_deadlines/{firm_id}__{deadline_id}   queried by firm_id
// Queries need single-field indexes only, which Firestore creates on its own.
const INVITATIONS = 'finclose_prod_firm_invitations';
const CONFIG = 'finclose_prod_firm_config';
const DEADLINES = 'finclose_prod_firm_deadlines';
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

export class FirestorePartnerStore implements PartnerStore {
  private readonly injectedDb?: Firestore;
  constructor(db?: Firestore) { this.injectedDb = db; }
  private async db(): Promise<Firestore> {
    if (this.injectedDb) return this.injectedDb;
    const [{ getFirestore }, { firebaseApp }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend')]);
    return getFirestore(firebaseApp());
  }
  private async config<T>(firmId: string, kind: string): Promise<T | null> {
    const snap = await (await this.db()).collection(CONFIG).doc(`${safe(firmId)}__${kind}`).get();
    return snap.exists ? (snap.data() as T) : null;
  }
  private async setConfig(firmId: string, kind: string, value: object) {
    await (await this.db()).collection(CONFIG).doc(`${safe(firmId)}__${kind}`).set(value);
  }
  async getInvitation(id: string) { const s = await (await this.db()).collection(INVITATIONS).doc(safe(id)).get(); return s.exists ? (s.data() as FirmInvitation) : null; }
  async findInvitationByHash(hash: string) {
    const s = await (await this.db()).collection(INVITATIONS).where('token_hash', '==', hash).limit(1).get();
    return s.empty ? null : (s.docs[0].data() as FirmInvitation);
  }
  async listInvitations(firmId: string) {
    const s = await (await this.db()).collection(INVITATIONS).where('firm_id', '==', firmId).limit(500).get();
    return s.docs.map(d => d.data() as FirmInvitation).sort((a, b) => b.created_at - a.created_at);
  }
  async putInvitation(i: FirmInvitation) { await (await this.db()).collection(INVITATIONS).doc(safe(i.invitation_id)).set(i); }
  getPlan(firmId: string) { return this.config<FirmPlan>(firmId, 'plan'); }
  putPlan(p: FirmPlan) { return this.setConfig(p.firm_id, 'plan', p); }
  getBranding(firmId: string) { return this.config<FirmBranding>(firmId, 'branding'); }
  putBranding(b: FirmBranding) { return this.setConfig(b.firm_id, 'branding', b); }
  getSettings(firmId: string) { return this.config<FirmSettings>(firmId, 'settings'); }
  putSettings(s: FirmSettings) { return this.setConfig(s.firm_id, 'settings', s); }
  async listDeadlines(firmId: string) {
    const s = await (await this.db()).collection(DEADLINES).where('firm_id', '==', firmId).limit(1000).get();
    return s.docs.map(d => d.data() as CustomDeadline);
  }
  async putDeadline(d: CustomDeadline) { await (await this.db()).collection(DEADLINES).doc(`${safe(d.firm_id)}__${safe(d.deadline_id)}`).set(d); }
  async deleteDeadline(firmId: string, id: string) { await (await this.db()).collection(DEADLINES).doc(`${safe(firmId)}__${safe(id)}`).delete(); }
}
