import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { buildRulePack, learnFromCorrection, type VatTreatment } from './categorisation-engine';
import { parseBankStatementCsv } from './statement-intake';
import { prepareStatementReview, type PrepExtras, type StatementPrepRequest, type StatementPrepResult } from './statement-prep';
import type { Correction, OwnerAnswer, PackEvent, PackRecord, PackStore } from './pack-store';
import { assertLinkable, keepDocumentsUntil } from './document-intake';
import { expiryFrom, retentionPolicy } from './retention';
import type { DocumentStore } from './document-store';
import { allowedVatRates } from './vat-summary';
import { normaliseJurisdiction } from './jurisdictions';

// Saved review packs: create, reload, record the owner's answers, record a
// reviewer's corrections (optionally remembered for the company), delete.
// There is deliberately NO accept/reject/sign-off step yet: that comes last,
// after the logic has been tested against real statements. A saved pack stays
// PREPARED_NOT_APPROVED with NO_EXTERNAL_POSTING.

const MAX_EVENTS = 500;
const MAX_STORED_INPUT_BYTES = 700_000; // compressed; keeps the Firestore document under 1 MB
const VAT_VALUES: VatTreatment[] = ['NO_VAT', 'INPUT_VAT_DOMESTIC', 'OUTPUT_VAT_DOMESTIC', 'REVERSE_CHARGE_FOREIGN_SERVICE', 'OUT_OF_SCOPE', 'NEEDS_INVOICE_REVIEW', 'NOT_VAT_REGISTERED'];

export type Actor = { user_id: string };

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function event(type: string, actor: Actor, detail?: Record<string, unknown>): PackEvent {
  return { type, actor: actor.user_id, at: Date.now(), detail };
}

function pushEvents(record: PackRecord, ...added: PackEvent[]) {
  record.events = [...record.events, ...added].slice(-MAX_EVENTS);
}

function newPackId() {
  return `pk_${crypto.randomBytes(12).toString('hex')}`;
}

export function packInput(request: StatementPrepRequest): string {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(request), 'utf8'));
  if (gz.length > MAX_STORED_INPUT_BYTES) throw httpError('this statement is too large to save; split it by month', 413);
  return gz.toString('base64');
}

export function readPackInput(blob: string): StatementPrepRequest {
  return readInput(blob);
}

function assertOpen(record: PackRecord) {
  if (record.status === 'SIGNED_OFF') throw httpError('this pack has been signed off and is locked; create a new version to change it', 409);
  if (record.status !== 'OPEN') throw httpError('this pack has been superseded by a newer version', 409);
}

function readInput(blob: string): StatementPrepRequest {
  return JSON.parse(zlib.gunzipSync(Buffer.from(blob, 'base64')).toString('utf8')) as StatementPrepRequest;
}

async function extrasFor(store: PackStore, record: PackRecord): Promise<PrepExtras> {
  const document_links: Record<string, string[]> = {};
  const dismissed: string[] = [];
  for (const answer of Object.values(record.answers)) {
    if (answer.document_ids.length) document_links[answer.transaction_id] = answer.document_ids;
    if (answer.confirm_duplicate) dismissed.push(answer.transaction_id);
  }
  const overrides: NonNullable<PrepExtras['overrides']> = {};
  for (const c of Object.values(record.corrections)) overrides[c.transaction_id] = { category_code: c.category_code, vat_treatment: c.vat_treatment, ...(c.vat_rate !== undefined ? { vat_rate: c.vat_rate } : {}) };
  return { learned_rules: await store.learnedRules(record.company_id), document_links, dismissed_duplicates: dismissed, overrides };
}

export type LoadedPack = { record: PackRecord; result: StatementPrepResult };

async function load(store: PackStore, packId: string, companyId: string): Promise<{ record: PackRecord; request: StatementPrepRequest }> {
  const hit = await store.get(packId);
  // A pack that belongs to another company looks exactly like a missing one.
  if (!hit || hit.record.company_id !== companyId) throw httpError('review pack not found', 404);
  if (hit.record.expires_at < Date.now()) throw httpError('this review pack has passed its retention period', 410);
  return { record: hit.record, request: readInput(hit.input) };
}

async function rebuild(store: PackStore, record: PackRecord, request: StatementPrepRequest): Promise<StatementPrepResult> {
  return prepareStatementReview(request, record.created_at, await extrasFor(store, record));
}

export async function createPack(store: PackStore, args: { company_id: string; organization_id: string; actor: Actor; request: StatementPrepRequest }): Promise<LoadedPack> {
  const blob = packInput(args.request);
  const now = Date.now();
  const draft = prepareStatementReview(args.request, now, { learned_rules: await store.learnedRules(args.company_id) });
  const existing = (await store.listByCompany(args.company_id)).filter(r => r.period.start === draft.pack.period.start && r.period.end === draft.pack.period.end);
  const record: PackRecord = {
    pack_id: newPackId(),
    company_id: args.company_id,
    organization_id: args.organization_id,
    period: draft.pack.period,
    version: existing.reduce((max, r) => Math.max(max, r.version), 0) + 1,
    status: 'OPEN',
    revision: 1,
    pack_hash: draft.pack.pack_hash,
    readiness_percent: draft.pack.summary.readiness_percent,
    answers: {},
    corrections: {},
    events: [],
    created_by: args.actor.user_id,
    created_at: now,
    expires_at: expiryFrom(now, retentionPolicy().open_pack_days)
  };
  pushEvents(record, event('PACK_CREATED', args.actor, { version: record.version, pack_hash: record.pack_hash }));
  await store.insert(record, blob);
  for (const old of existing.filter(r => r.status === 'OPEN')) {
    const next: PackRecord = { ...old, status: 'SUPERSEDED', revision: old.revision + 1 };
    pushEvents(next, event('PACK_SUPERSEDED', args.actor, { by: record.pack_id }));
    try {
      await store.update(next, old.revision);
    } catch {
      // a concurrent edit keeps it OPEN; harmless
    }
  }
  return { record, result: draft };
}

export async function getPack(store: PackStore, packId: string, companyId: string): Promise<LoadedPack> {
  const { record, request } = await load(store, packId, companyId);
  return { record, result: await rebuild(store, record, request) };
}

export async function listPacks(store: PackStore, companyId: string): Promise<PackRecord[]> {
  const now = Date.now();
  return (await store.listByCompany(companyId)).filter(r => r.expires_at >= now);
}

function transactionIds(request: StatementPrepRequest): Set<string> {
  const csv = typeof request.csv_text === 'string' ? request.csv_text : '';
  const dateOrder = request.date_order === 'MDY' || request.date_order === 'auto' ? request.date_order : 'DMY';
  const intake = parseBankStatementCsv(csv, { currency: String(request.currency ?? 'EUR').toUpperCase(), date_order: dateOrder });
  return new Set(intake.transactions.map(tx => tx.transaction_id));
}

export async function recordOwnerAnswer(
  store: PackStore,
  packId: string,
  companyId: string,
  actor: Actor,
  input: { transaction_id?: unknown; document_ids?: unknown; note?: unknown; confirm_duplicate?: unknown },
  docStore?: DocumentStore // when given, cited documents must exist for this company and be CLEAN
): Promise<LoadedPack> {
  const { record, request } = await load(store, packId, companyId);
  assertOpen(record);
  const id = String(input.transaction_id || '');
  if (!transactionIds(request).has(id)) throw httpError('transaction_id is not in this pack', 400);
  const documents = Array.isArray(input.document_ids) ? input.document_ids.map(d => String(d).trim()).filter(Boolean) : [];
  if (documents.length > 20 || documents.some(d => d.length > 200)) throw httpError('at most 20 document ids of up to 200 characters', 400);
  if (docStore && documents.length) await assertLinkable(docStore, companyId, documents);
  const note = String(input.note || '').slice(0, 1000);
  const confirmDuplicate = input.confirm_duplicate === true;
  if (!documents.length && !note && !confirmDuplicate) throw httpError('give a document id, a note, or confirm_duplicate', 400);
  const expected = record.revision;
  const answer: OwnerAnswer = { transaction_id: id, document_ids: documents, note, confirm_duplicate: confirmDuplicate, answered_by: actor.user_id, answered_at: Date.now() };
  const next: PackRecord = { ...record, revision: expected + 1, answers: { ...record.answers, [id]: answer } };
  pushEvents(next, event('OWNER_ANSWER', actor, { transaction_id: id, documents: documents.length, confirm_duplicate: confirmDuplicate }));
  await store.update(next, expected);
  if (docStore && documents.length) await keepDocumentsUntil(docStore, documents, next.expires_at);
  return { record: next, result: await rebuild(store, next, request) };
}

export async function recordCorrection(
  store: PackStore,
  packId: string,
  companyId: string,
  actor: Actor,
  input: { transaction_id?: unknown; category_code?: unknown; vat_treatment?: unknown; vat_rate?: unknown; remember?: unknown }
): Promise<LoadedPack> {
  const { record, request } = await load(store, packId, companyId);
  assertOpen(record);
  const id = String(input.transaction_id || '');
  const category = String(input.category_code || '');
  const vat = String(input.vat_treatment || '') as VatTreatment;
  const jurisdiction = normaliseJurisdiction(request.jurisdiction);
  if (!buildRulePack(jurisdiction).categories.some(c => c.code === category)) throw httpError('category_code is not in this rule pack', 400);
  if (!VAT_VALUES.includes(vat)) throw httpError('vat_treatment is not valid', 400);
  let vatRate: number | undefined;
  if (input.vat_rate !== undefined && input.vat_rate !== null && input.vat_rate !== '') {
    vatRate = Number(input.vat_rate);
    if (!allowedVatRates(jurisdiction).includes(vatRate)) throw httpError(`vat_rate must be one of ${allowedVatRates(jurisdiction).join(', ') || 'none for this jurisdiction'}`, 400);
  }
  const before = await rebuild(store, record, request);
  const entry = before.pack.entries.find(e => e.transaction_id === id);
  if (!entry) throw httpError('transaction_id is not an in-period transaction of this pack', 400);
  const remember = input.remember === true;
  const expected = record.revision;
  const correction: Correction = { transaction_id: id, category_code: category, vat_treatment: vat, ...(vatRate !== undefined ? { vat_rate: vatRate } : {}), remember, corrected_by: actor.user_id, corrected_at: Date.now() };
  const next: PackRecord = { ...record, revision: expected + 1, corrections: { ...record.corrections, [id]: correction } };
  pushEvents(next, event('CORRECTION', actor, { transaction_id: id, from: entry.category_code, to: category, remember }));
  await store.update(next, expected);
  if (remember) {
    const rule = learnFromCorrection({ counterparty: entry.counterparty, description: entry.description, amount_cents: entry.amount_cents }, category, vat);
    if (rule) await store.addLearnedRule(record.company_id, rule); // scoped to this company only
  }
  return { record: next, result: await rebuild(store, next, request) };
}

export function signOffEnabled(): boolean {
  return process.env.FINCLOSE_SIGNOFF_ENABLED === 'true';
}

// Accountant sign-off. Off unless FINCLOSE_SIGNOFF_ENABLED=true, because it is meant to be
// switched on only after the logic has been tested on real statements. It records WHO accepted
// WHICH version (the pack hash they saw) and locks the pack. It does not post to any ledger and
// does not hand over to the close-governance engine: the pack stays NO_EXTERNAL_POSTING.
export async function signOffPack(
  store: PackStore,
  packId: string,
  companyId: string,
  actor: Actor,
  input: { pack_hash?: unknown; note?: unknown; accept_open_items?: unknown },
  enabled = signOffEnabled(),
  docStore?: DocumentStore // when given, the receipts the pack cites are kept as long as the pack
): Promise<LoadedPack> {
  if (!enabled) throw httpError('accountant sign-off is not enabled in this deployment', 403);
  const { record, request } = await load(store, packId, companyId);
  assertOpen(record);
  const result = await rebuild(store, record, request);
  if (String(input.pack_hash || '') !== result.pack.pack_hash) throw httpError('the pack changed since you reviewed it; reload and review again', 409);
  const hasHigh = result.pack.exceptions.some(e => e.severity === 'HIGH');
  if (hasHigh) throw httpError('a HIGH exception is still open; resolve it before sign-off', 409);
  const acceptOpen = input.accept_open_items === true;
  const note = String(input.note || '').trim().slice(0, 1000);
  if (!result.pack.summary.accountant_ready) {
    if (!acceptOpen) throw httpError('the pack is not accountant-ready; resolve the open items or sign off with accept_open_items and a note', 409);
    if (note.length < 10) throw httpError('give a note of at least 10 characters explaining why open items are accepted', 400);
  }
  const expected = record.revision;
  const at = Date.now();
  const keepUntil = Math.max(record.expires_at, expiryFrom(at, retentionPolicy().signed_off_pack_days)); // sign-off only ever lengthens retention
  const next: PackRecord = { ...record, status: 'SIGNED_OFF', revision: expected + 1, expires_at: keepUntil, signoff: { by: actor.user_id, at, pack_hash: result.pack.pack_hash, note, accepted_open_items: acceptOpen && !result.pack.summary.accountant_ready } };
  pushEvents(next, event('SIGNED_OFF', actor, { pack_hash: result.pack.pack_hash, accepted_open_items: next.signoff!.accepted_open_items }));
  await store.update(next, expected);
  if (docStore) await keepDocumentsUntil(docStore, Object.values(next.answers).flatMap(a => a.document_ids), keepUntil);
  return { record: next, result };
}

export async function deletePack(store: PackStore, packId: string, companyId: string): Promise<void> {
  const hit = await store.get(packId);
  if (!hit || hit.record.company_id !== companyId) throw httpError('review pack not found', 404);
  await store.delete(packId);
}
