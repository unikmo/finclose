import crypto from 'node:crypto';
import type { PackStore } from './pack-store';
import type { DocumentStore } from './document-store';
import { readPackInput } from './pack-lifecycle';
import type { ConnectionStore } from './connectors';

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
    account_overrides: await packs.accountOverrides(companyId),
    documents: await docs.listByCompany(companyId), // metadata and hashes; file bytes are fetched separately
    notes: ['Includes expired packs not yet purged.', 'Uploaded file bytes are not inlined; use the document ids to fetch them.']
  };
}

export async function eraseCompanyData(packs: PackStore, docs: DocumentStore, companyId: string, confirm: unknown, now = Date.now(), connections?: ConnectionStore) {
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
  const hadAccountMap = (await packs.accountOverrides(companyId)) !== null;
  await packs.setAccountOverrides(companyId, null);
  let connectionsRemoved = 0;
  if (connections && (await connections.get(companyId, 'xero'))) {
    await connections.delete(companyId, 'xero'); // the sealed tokens go; the user can also revoke FinClose inside Xero
    connectionsRemoved += 1;
  }
  const receipt = { company_id: companyId, erased_at: now, packs: packCount, documents: documentList.length, learned_rules: rules, account_map: hadAccountMap, connections: connectionsRemoved };
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

// Scheduled purge across every company: removes what has passed retention, including the stored file
// bytes that a Firestore TTL policy cannot reach. Bounded per run; `more` says another run is needed.
// One failing record never stops the rest; failures are counted so the run does not look cleaner than it was.
export async function purgeAllExpired(packs: PackStore, docs: DocumentStore, now = Date.now(), limit = 200) {
  const out = { packs: 0, documents: 0, failed: 0, more: false };
  const expiredPacks = await packs.listExpired(now, limit);
  for (const record of expiredPacks) {
    try { await packs.delete(record.pack_id); out.packs += 1; } catch { out.failed += 1; }
  }
  const expiredDocs = await docs.listExpired(now, limit);
  for (const d of expiredDocs) {
    try { await docs.delete(d); out.documents += 1; } catch { out.failed += 1; }
  }
  out.more = expiredPacks.length >= limit || expiredDocs.length >= limit;
  return out;
}
