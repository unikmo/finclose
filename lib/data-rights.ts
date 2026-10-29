import crypto from 'node:crypto';
import type { PackStore } from './pack-store';
import type { DocumentStore } from './document-store';
import { readPackInput } from './pack-lifecycle';

// Data-subject style rights for one company: export everything held, erase
// everything held, and purge what has passed retention. The Firestore TTL
// policies delete expired documents on their own; purgeExpired also removes the
// stored file bytes, which a TTL policy cannot reach.

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export async function exportCompanyData(packs: PackStore, docs: DocumentStore, companyId: string, now = Date.now()) {
  const records = await packs.listByCompany(companyId);
  const packOut = [];
  for (const record of records) {
    const hit = await packs.get(record.pack_id);
    packOut.push({ record, statement_request: hit ? readPackInput(hit.input) : null });
  }
  return {
    export_version: 1,
    company_id: companyId,
    exported_at: now,
    packs: packOut,
    learned_rules: await packs.learnedRules(companyId),
    documents: await docs.listByCompany(companyId), // metadata and hashes; file bytes are fetched separately
    notes: ['Includes expired packs not yet purged.', 'Uploaded file bytes are not inlined; use the document ids to fetch them.']
  };
}

export async function eraseCompanyData(packs: PackStore, docs: DocumentStore, companyId: string, confirm: unknown, now = Date.now()) {
  if (String(confirm || '') !== companyId) throw httpError('confirm must equal the company_id to erase', 400);
  let packCount = 0;
  for (;;) {
    const batch = await packs.listByCompany(companyId);
    if (!batch.length) break;
    for (const record of batch) {
      await packs.delete(record.pack_id);
      packCount += 1;
    }
  }
  const documentList = await docs.listByCompany(companyId);
  for (const d of documentList) await docs.delete(d);
  const rules = await packs.deleteLearnedRules(companyId);
  const receipt = { company_id: companyId, erased_at: now, packs: packCount, documents: documentList.length, learned_rules: rules };
  return { ...receipt, receipt_hash: crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex') };
}

export async function purgeExpired(packs: PackStore, docs: DocumentStore, companyId: string, now = Date.now()) {
  let packCount = 0;
  for (const record of await packs.listByCompany(companyId)) {
    if (record.expires_at < now) {
      await packs.delete(record.pack_id);
      packCount += 1;
    }
  }
  let docCount = 0;
  for (const d of await docs.listByCompany(companyId)) {
    if (d.expires_at < now) {
      await docs.delete(d);
      docCount += 1;
    }
  }
  return { packs: packCount, documents: docCount };
}
