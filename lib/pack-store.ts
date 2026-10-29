import type { LearnedRule, VatTreatment } from './categorisation-engine';

// Storage for saved review packs. The lifecycle logic only talks to this
// interface, so it is tested against the in-memory store and runs on Firestore
// in PILOT/PRODUCTION. Firestore documents are capped at 1 MB, so a pack is not
// stored: only the (compressed) uploaded statement and the human decisions are.
// The pack is rebuilt from them, which is deterministic.

export type PackEvent = { type: string; actor: string; at: number; detail?: Record<string, unknown> };

export type OwnerAnswer = { transaction_id: string; document_ids: string[]; note: string; confirm_duplicate: boolean; answered_by: string; answered_at: number };
export type Correction = { transaction_id: string; category_code: string; vat_treatment: VatTreatment; remember: boolean; corrected_by: string; corrected_at: number };

export type PackRecord = {
  pack_id: string;
  company_id: string;
  organization_id: string;
  period: { start: string; end: string };
  version: number; // 1, 2, ... per company and period
  status: 'OPEN' | 'SUPERSEDED';
  revision: number; // bumped on every write, for optimistic concurrency
  pack_hash: string;
  readiness_percent: number;
  answers: Record<string, OwnerAnswer>; // by transaction_id, latest answer wins
  corrections: Record<string, Correction>;
  events: PackEvent[];
  created_by: string;
  created_at: number;
  expires_at: number; // retention: the stored statement is purged after this
};

export interface PackStore {
  insert(record: PackRecord, inputGzipBase64: string): Promise<void>;
  get(packId: string): Promise<{ record: PackRecord; input: string } | null>;
  update(record: PackRecord, expectedRevision: number): Promise<void>; // throws status 409 on a stale revision
  listByCompany(companyId: string): Promise<PackRecord[]>;
  delete(packId: string): Promise<void>;
  learnedRules(companyId: string): Promise<LearnedRule[]>;
  addLearnedRule(companyId: string, rule: LearnedRule): Promise<void>;
}

function conflict() {
  const error = new Error('this pack was changed by someone else; reload and try again');
  (error as Error & { status?: number }).status = 409;
  return error;
}

export class InMemoryPackStore implements PackStore {
  private packs = new Map<string, { record: PackRecord; input: string }>();
  private rules = new Map<string, LearnedRule[]>();
  async insert(record: PackRecord, input: string) { this.packs.set(record.pack_id, { record: structuredClone(record), input }); }
  async get(packId: string) { const hit = this.packs.get(packId); return hit ? { record: structuredClone(hit.record), input: hit.input } : null; }
  async update(record: PackRecord, expectedRevision: number) {
    const hit = this.packs.get(record.pack_id);
    if (!hit || hit.record.revision !== expectedRevision) throw conflict();
    this.packs.set(record.pack_id, { record: structuredClone(record), input: hit.input });
  }
  async listByCompany(companyId: string) {
    return [...this.packs.values()].map(item => structuredClone(item.record)).filter(r => r.company_id === companyId).sort((a, b) => b.created_at - a.created_at);
  }
  async delete(packId: string) { this.packs.delete(packId); }
  async learnedRules(companyId: string) { return structuredClone(this.rules.get(companyId) || []); }
  async addLearnedRule(companyId: string, rule: LearnedRule) {
    const list = (this.rules.get(companyId) || []).filter(r => !(r.merchant_key === rule.merchant_key && r.direction === rule.direction));
    this.rules.set(companyId, [...list, rule]);
  }
}
