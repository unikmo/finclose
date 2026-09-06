import crypto from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseApp } from './finclose-backend';
import { isRealDataMode } from './runtime-mode';

const REQUIRED_SCHEMA_VERSION = 1;
const MAX_JOURNALS_PER_BATCH = 200;
const MAX_LINES_PER_JOURNAL = 300;
const MAX_FIRESTORE_DOCUMENT_BYTES = 750_000;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function firestoreLedger() {
  return getFirestore(firebaseApp());
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 900);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

function activeLocks(data: Record<string, any> | undefined) {
  return Array.isArray(data?.active_locks) ? data!.active_locks as Record<string, any>[] : [];
}

function assertNoOverlappingLock(data: Record<string, any> | undefined, periodStart: string, periodEnd: string, context: string) {
  const blocking = activeLocks(data).find(lock =>
    String(lock.status || 'LOCKED') === 'LOCKED' &&
    rangesOverlap(periodStart, periodEnd, String(lock.period_start || ''), String(lock.period_end || ''))
  );
  if (blocking) throw httpError(`${context} overlaps locked period ${blocking.period_start} to ${blocking.period_end}`, 409);
}

function validateJournalForFirestore(journal: Record<string, any>) {
  const lines = Array.isArray(journal.lines) ? journal.lines : [];
  if (lines.length > MAX_LINES_PER_JOURNAL) {
    throw httpError(`journal ${journal.external_id || '(unknown)'} exceeds the ${MAX_LINES_PER_JOURNAL}-line controlled-pilot limit`, 409);
  }
  const bytes = Buffer.byteLength(JSON.stringify(journal));
  if (bytes > MAX_FIRESTORE_DOCUMENT_BYTES) {
    throw httpError(`journal ${journal.external_id || '(unknown)'} is too large for the controlled-pilot Firestore ledger document`, 409);
  }
}

function auditRef(idempotencyKey: string) {
  return firestoreLedger().collection('finclose_prod_audit_events').doc(`evt_${hash(idempotencyKey).slice(0, 48)}`);
}

export function productionLedgerConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

export async function ledgerHealth() {
  if (!productionLedgerConfigured()) {
    return { configured: false, reachable: false, schema_version: null, ready: false, backend: 'firebase-firestore' };
  }
  try {
    const db = firestoreLedger();
    const metaRef = db.collection('finclose_prod_meta').doc('ledger_schema');
    let meta = await metaRef.get();
    if (!meta.exists) {
      await metaRef.set({
        schema_version: REQUIRED_SCHEMA_VERSION,
        backend: 'firebase-firestore',
        direct_client_access: 'DENIED_BY_RULES',
        created_at: Date.now(),
        updated_at: Date.now()
      });
      meta = await metaRef.get();
    }
    const version = Number(meta.data()?.schema_version || 0);
    return {
      configured: true,
      reachable: true,
      schema_version: version,
      ready: version >= REQUIRED_SCHEMA_VERSION,
      backend: 'firebase-firestore'
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      schema_version: null,
      ready: false,
      backend: 'firebase-firestore',
      error: (error as Error).message
    };
  }
}

export async function assertProductionLedgerReady() {
  if (!isRealDataMode()) return;
  const health = await ledgerHealth();
  if (!health.ready) throw httpError(`Cloud Firestore production ledger is not ready${health.error ? `: ${health.error}` : ''}`, 503);
}

export async function registerProductionOrganization(input: {
  organization_id: string;
  name: string;
  actor_user_id: string;
}) {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  const db = firestoreLedger();
  const ref = db.collection('finclose_prod_organizations').doc(safeId(input.organization_id));
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    const now = Date.now();
    if (existing.exists && String(existing.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('organization ledger identity conflict', 409);
    }
    transaction.set(ref, {
      organization_id: input.organization_id,
      name: input.name,
      status: 'ACTIVE',
      created_by_user_id: existing.data()?.created_by_user_id || input.actor_user_id,
      created_at: existing.data()?.created_at || now,
      updated_at: now
    }, { merge: true });
  });
}

export async function registerProductionCompany(input: {
  organization_id: string;
  company_id: string;
  legal_name: string;
  country_code: string;
  base_currency: string;
  actor_user_id: string;
}) {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  const db = firestoreLedger();
  const ref = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists && String(existing.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is already owned by another organization in the authoritative ledger', 403);
    }
    const now = Date.now();
    transaction.set(ref, {
      organization_id: input.organization_id,
      company_id: input.company_id,
      legal_name: input.legal_name,
      country_code: input.country_code,
      base_currency: input.base_currency,
      status: 'ACTIVE',
      created_by_user_id: existing.data()?.created_by_user_id || input.actor_user_id,
      created_at: existing.data()?.created_at || now,
      updated_at: now
    }, { merge: true });
  });
}

export async function appendProductionAuditEvent(input: {
  organization_id: string;
  company_id?: string | null;
  actor_user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload?: unknown;
  idempotency_key?: string;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const key = input.idempotency_key || `${input.action}:${input.entity_type}:${input.entity_id}`;
  const ref = auditRef(key);
  const payload = input.payload === undefined ? null : clean(input.payload);
  const payloadHash = hash(JSON.stringify(payload));
  await firestoreLedger().runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      if (String(existing.data()?.payload_hash || '') !== payloadHash) {
        throw httpError('audit idempotency key was reused with different evidence', 409);
      }
      return;
    }
    transaction.create(ref, {
      event_id: ref.id,
      organization_id: input.organization_id,
      company_id: input.company_id || null,
      actor_user_id: input.actor_user_id || null,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      payload,
      payload_hash: payloadHash,
      idempotency_key: key,
      created_at: Date.now()
    });
  });
  return ref.id;
}

export async function assertProductionDateRangeOpen(companyId: string, periodStart: string, periodEnd: string, context = 'transaction') {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  const ref = firestoreLedger().collection('finclose_prod_company_lock_state').doc(safeId(companyId));
  const snap = await ref.get();
  assertNoOverlappingLock(snap.exists ? snap.data() as Record<string, any> : undefined, periodStart, periodEnd, context);
}

export async function persistPayrollRun(input: {
  organization_id: string;
  company_id: string;
  actor_user_id?: string | null;
  run: Record<string, any>;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const run = clean(input.run);
  const runId = String(run.payroll_run_id || '').trim();
  if (!runId) throw httpError('payroll_run_id is required for the authoritative ledger', 500);
  const periodStart = String(run.pay_period_start || '');
  const periodEnd = String(run.pay_period_end || '');
  const db = firestoreLedger();
  const runRef = db.collection('finclose_prod_payroll_runs').doc(safeId(runId));
  const lockStateRef = db.collection('finclose_prod_company_lock_state').doc(safeId(input.company_id));
  const companyRef = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  const eventRef = auditRef(`PAYROLL_RUN_PREPARED:${runId}`);

  await db.runTransaction(async transaction => {
    const [existing, lockState, company] = await Promise.all([
      transaction.get(runRef),
      transaction.get(lockStateRef),
      transaction.get(companyRef)
    ]);
    if (existing.exists) return;
    if (!company.exists || String(company.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is not registered to this organization in the authoritative ledger', 409);
    }
    assertNoOverlappingLock(lockState.exists ? lockState.data() as Record<string, any> : undefined, periodStart, periodEnd, 'payroll run');
    transaction.create(runRef, {
      ...run,
      organization_id: input.organization_id,
      company_id: input.company_id,
      authoritative_backend: 'FIREBASE_FIRESTORE',
      recorded_at: Date.now()
    });
    transaction.create(eventRef, {
      event_id: eventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id || null,
      action: 'PAYROLL_RUN_PREPARED',
      entity_type: 'PAYROLL_RUN',
      entity_id: runId,
      payload_hash: hash(JSON.stringify(run)),
      idempotency_key: `PAYROLL_RUN_PREPARED:${runId}`,
      created_at: Date.now()
    });
  });
  return runId;
}

export async function persistBookkeepingBatch(input: {
  organization_id: string;
  company_id: string;
  actor_user_id?: string | null;
  batch: Record<string, any>;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const batch = clean(input.batch);
  const batchId = String(batch.bookkeeping_batch_id || '').trim();
  if (!batchId) throw httpError('bookkeeping_batch_id is required for the authoritative ledger', 500);
  const periodStart = String(batch.period_start || '');
  const periodEnd = String(batch.period_end || '');
  const journals = Array.isArray(batch.journals) ? batch.journals as Record<string, any>[] : [];
  if (journals.length > MAX_JOURNALS_PER_BATCH) {
    throw httpError(`bookkeeping batch exceeds the ${MAX_JOURNALS_PER_BATCH}-journal controlled-pilot transaction limit`, 409);
  }
  journals.forEach(validateJournalForFirestore);

  const db = firestoreLedger();
  const batchRef = db.collection('finclose_prod_bookkeeping_batches').doc(safeId(batchId));
  const lockStateRef = db.collection('finclose_prod_company_lock_state').doc(safeId(input.company_id));
  const companyRef = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  const eventRef = auditRef(`BOOKKEEPING_BATCH_PREPARED:${batchId}`);

  await db.runTransaction(async transaction => {
    const [existing, lockState, company] = await Promise.all([
      transaction.get(batchRef),
      transaction.get(lockStateRef),
      transaction.get(companyRef)
    ]);
    if (existing.exists) return;
    if (!company.exists || String(company.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is not registered to this organization in the authoritative ledger', 409);
    }
    assertNoOverlappingLock(lockState.exists ? lockState.data() as Record<string, any> : undefined, periodStart, periodEnd, 'bookkeeping batch');

    const journalIds: string[] = [];
    for (const journal of journals) {
      const journalId = `jnl_${hash(`${batchId}:${String(journal.external_id || '')}`).slice(0, 48)}`;
      const journalRef = db.collection('finclose_prod_journal_entries').doc(journalId);
      journalIds.push(journalId);
      transaction.create(journalRef, {
        ...journal,
        journal_id: journalId,
        organization_id: input.organization_id,
        company_id: input.company_id,
        bookkeeping_batch_id: batchId,
        status: 'PREPARED',
        immutable_fingerprint: hash(JSON.stringify(journal)),
        created_at: Date.now()
      });
    }

    const batchSummary = { ...batch } as Record<string, any>;
    delete batchSummary.journals;
    transaction.create(batchRef, {
      ...batchSummary,
      organization_id: input.organization_id,
      company_id: input.company_id,
      journal_ids: journalIds,
      journal_count: journalIds.length,
      authoritative_backend: 'FIREBASE_FIRESTORE',
      recorded_at: Date.now()
    });
    transaction.create(eventRef, {
      event_id: eventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id || null,
      action: 'BOOKKEEPING_BATCH_PREPARED',
      entity_type: 'BOOKKEEPING_BATCH',
      entity_id: batchId,
      payload_hash: hash(JSON.stringify(batch)),
      idempotency_key: `BOOKKEEPING_BATCH_PREPARED:${batchId}`,
      created_at: Date.now()
    });
  });
  return batchId;
}

export async function persistFinanceCycle(input: {
  organization_id: string;
  company_id: string;
  actor_user_id?: string | null;
  cycle: Record<string, any>;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const cycle = clean(input.cycle);
  const cycleId = String(cycle.finance_cycle_id || '').trim();
  const close = clean(cycle.monthly_close || {} as Record<string, any>);
  const closeId = String(close.monthly_close_id || cycle.monthly_close_id || '').trim();
  if (!cycleId || !closeId) throw httpError('finance cycle and monthly close IDs are required for the authoritative ledger', 500);
  const db = firestoreLedger();
  const cycleRef = db.collection('finclose_prod_finance_cycles').doc(safeId(cycleId));
  const closeRef = db.collection('finclose_prod_monthly_closes').doc(safeId(closeId));
  const lockStateRef = db.collection('finclose_prod_company_lock_state').doc(safeId(input.company_id));
  const companyRef = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  const eventRef = auditRef(`FINANCE_CYCLE_PREPARED:${cycleId}`);

  await db.runTransaction(async transaction => {
    const [existing, lockState, company] = await Promise.all([
      transaction.get(cycleRef),
      transaction.get(lockStateRef),
      transaction.get(companyRef)
    ]);
    if (existing.exists) return;
    if (!company.exists || String(company.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is not registered to this organization in the authoritative ledger', 409);
    }
    assertNoOverlappingLock(lockState.exists ? lockState.data() as Record<string, any> : undefined, String(cycle.period_start || ''), String(cycle.period_end || ''), 'finance cycle');
    const cycleSummary = { ...cycle } as Record<string, any>;
    delete cycleSummary.monthly_close;
    transaction.create(cycleRef, {
      ...cycleSummary,
      organization_id: input.organization_id,
      company_id: input.company_id,
      authoritative_backend: 'FIREBASE_FIRESTORE',
      recorded_at: Date.now()
    });
    transaction.create(closeRef, {
      ...close,
      organization_id: input.organization_id,
      company_id: input.company_id,
      authoritative_backend: 'FIREBASE_FIRESTORE',
      recorded_at: Date.now()
    });
    transaction.create(eventRef, {
      event_id: eventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id || null,
      action: 'FINANCE_CYCLE_PREPARED',
      entity_type: 'FINANCE_CYCLE',
      entity_id: cycleId,
      payload_hash: hash(JSON.stringify(cycleSummary)),
      idempotency_key: `FINANCE_CYCLE_PREPARED:${cycleId}`,
      created_at: Date.now()
    });
  });
  return cycleId;
}

export async function recordCloseApproval(input: {
  organization_id: string;
  company_id: string;
  close_id: string;
  evidence_hash: string;
  actor_user_id: string;
  snapshot: unknown;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const db = firestoreLedger();
  const approvalRef = db.collection('finclose_prod_close_approvals').doc(safeId(input.close_id));
  const approvalId = `apr_${hash(`${input.close_id}:${input.evidence_hash}`).slice(0, 48)}`;
  const eventRef = db.collection('finclose_prod_close_approval_events').doc(approvalId);
  const companyRef = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  const auditEventRef = auditRef(`MONTHLY_CLOSE_APPROVED:${input.close_id}:${input.evidence_hash}`);

  await db.runTransaction(async transaction => {
    const [current, company] = await Promise.all([
      transaction.get(approvalRef),
      transaction.get(companyRef)
    ]);
    if (!company.exists || String(company.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is not registered to this organization in the authoritative ledger', 409);
    }
    if (current.exists && String(current.data()?.evidence_hash || '') === input.evidence_hash) return;
    const record = {
      approval_id: approvalId,
      organization_id: input.organization_id,
      company_id: input.company_id,
      monthly_close_id: input.close_id,
      evidence_hash: input.evidence_hash,
      evidence_snapshot: clean(input.snapshot),
      actor_user_id: input.actor_user_id,
      status: 'APPROVED',
      created_at: Date.now()
    };
    transaction.create(eventRef, record);
    transaction.set(approvalRef, record);
    transaction.create(auditEventRef, {
      event_id: auditEventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id,
      action: 'MONTHLY_CLOSE_APPROVED',
      entity_type: 'MONTHLY_CLOSE',
      entity_id: input.close_id,
      payload_hash: hash(JSON.stringify(record)),
      idempotency_key: `MONTHLY_CLOSE_APPROVED:${input.close_id}:${input.evidence_hash}`,
      created_at: Date.now()
    });
  });
  return approvalId;
}

export async function commitPeriodLock(input: {
  organization_id: string;
  company_id: string;
  close_id: string;
  period_start: string;
  period_end: string;
  evidence_hash: string;
  actor_user_id: string;
  payload: unknown;
}) {
  if (!isRealDataMode()) return null;
  await assertProductionLedgerReady();
  const db = firestoreLedger();
  const stateRef = db.collection('finclose_prod_company_lock_state').doc(safeId(input.company_id));
  const approvalRef = db.collection('finclose_prod_close_approvals').doc(safeId(input.close_id));
  const companyRef = db.collection('finclose_prod_companies').doc(safeId(input.company_id));
  const lockId = `lock_${hash(`${input.company_id}:${input.close_id}:${input.evidence_hash}`).slice(0, 48)}`;
  const lockRef = db.collection('finclose_prod_period_locks').doc(lockId);
  const lockIndexRef = db.collection('finclose_prod_close_lock_index').doc(safeId(input.close_id));
  const snapshotRef = db.collection('finclose_prod_close_snapshots').doc(`snap_${hash(`${input.close_id}:${input.evidence_hash}`).slice(0, 48)}`);
  const eventRef = db.collection('finclose_prod_period_lock_events').doc(`lockevt_${hash(`LOCK:${lockId}`).slice(0, 48)}`);
  const auditEventRef = auditRef(`MONTHLY_CLOSE_LOCKED:${input.close_id}:${input.evidence_hash}`);

  return db.runTransaction(async transaction => {
    const [state, approval, company, existingLock] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(approvalRef),
      transaction.get(companyRef),
      transaction.get(lockRef)
    ]);
    if (!company.exists || String(company.data()?.organization_id || '') !== input.organization_id) {
      throw httpError('company is not registered to this organization in the authoritative ledger', 409);
    }
    if (!approval.exists || String(approval.data()?.evidence_hash || '') !== input.evidence_hash) {
      throw httpError('authoritative close approval is missing or its evidence changed', 409);
    }
    if (existingLock.exists && String(existingLock.data()?.status || '') === 'LOCKED') return lockId;
    const currentLocks = activeLocks(state.exists ? state.data() as Record<string, any> : undefined);
    const overlap = currentLocks.find(lock =>
      String(lock.status || 'LOCKED') === 'LOCKED' &&
      rangesOverlap(input.period_start, input.period_end, String(lock.period_start || ''), String(lock.period_end || ''))
    );
    if (overlap) {
      if (String(overlap.monthly_close_id || '') === input.close_id) return String(overlap.period_lock_id || lockId);
      throw httpError(`another close already locks ${overlap.period_start} to ${overlap.period_end}`, 409);
    }
    const now = Date.now();
    const lock = {
      period_lock_id: lockId,
      organization_id: input.organization_id,
      company_id: input.company_id,
      monthly_close_id: input.close_id,
      period_start: input.period_start,
      period_end: input.period_end,
      evidence_hash: input.evidence_hash,
      status: 'LOCKED',
      locked_by_user_id: input.actor_user_id,
      locked_at: now,
      created_at: now,
      updated_at: now
    };
    transaction.create(snapshotRef, {
      close_snapshot_id: snapshotRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      monthly_close_id: input.close_id,
      evidence_hash: input.evidence_hash,
      snapshot: clean(input.payload),
      approved_by_user_id: input.actor_user_id,
      created_at: now
    });
    transaction.create(lockRef, lock);
    transaction.set(lockIndexRef, { monthly_close_id: input.close_id, period_lock_id: lockId, updated_at: now });
    transaction.set(stateRef, {
      company_id: input.company_id,
      organization_id: input.organization_id,
      active_locks: [...currentLocks, lock],
      updated_at: now
    });
    transaction.create(eventRef, { event: 'PERIOD_LOCKED', ...lock });
    transaction.create(auditEventRef, {
      event_id: auditEventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id,
      action: 'MONTHLY_CLOSE_LOCKED',
      entity_type: 'PERIOD_LOCK',
      entity_id: lockId,
      payload_hash: hash(JSON.stringify(lock)),
      idempotency_key: `MONTHLY_CLOSE_LOCKED:${input.close_id}:${input.evidence_hash}`,
      created_at: now
    });
    return lockId;
  });
}

export async function reopenPeriodLock(input: {
  organization_id: string;
  company_id: string;
  close_id: string;
  actor_user_id: string;
  reason: string;
}) {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  const db = firestoreLedger();
  const indexRef = db.collection('finclose_prod_close_lock_index').doc(safeId(input.close_id));
  const stateRef = db.collection('finclose_prod_company_lock_state').doc(safeId(input.company_id));

  await db.runTransaction(async transaction => {
    const [index, state] = await Promise.all([transaction.get(indexRef), transaction.get(stateRef)]);
    if (!index.exists) throw httpError('authoritative Firebase period lock was not found', 409);
    const lockId = String(index.data()?.period_lock_id || '');
    if (!lockId) throw httpError('authoritative Firebase period lock index is invalid', 409);
    const lockRef = db.collection('finclose_prod_period_locks').doc(lockId);
    const lock = await transaction.get(lockRef);
    if (!lock.exists) throw httpError('authoritative Firebase period lock record was not found', 409);
    if (String(lock.data()?.status || '') === 'REOPENED') return;
    if (String(lock.data()?.organization_id || '') !== input.organization_id || String(lock.data()?.company_id || '') !== input.company_id) {
      throw httpError('period lock tenant ownership mismatch', 403);
    }
    const now = Date.now();
    const currentLocks = activeLocks(state.exists ? state.data() as Record<string, any> : undefined);
    const remaining = currentLocks.filter(item => String(item.period_lock_id || '') !== lockId);
    transaction.update(lockRef, {
      status: 'REOPENED',
      reopened_by_user_id: input.actor_user_id,
      reopen_reason: input.reason,
      reopened_at: now,
      updated_at: now
    });
    transaction.set(stateRef, {
      company_id: input.company_id,
      organization_id: input.organization_id,
      active_locks: remaining,
      updated_at: now
    }, { merge: true });
    const eventRef = db.collection('finclose_prod_period_lock_events').doc(`reopenevt_${hash(`${lockId}:${input.reason}`).slice(0, 48)}`);
    transaction.create(eventRef, {
      event: 'PERIOD_REOPENED',
      period_lock_id: lockId,
      monthly_close_id: input.close_id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id,
      reason: input.reason,
      created_at: now
    });
    const auditEventRef = auditRef(`MONTHLY_CLOSE_REOPENED:${input.close_id}:${hash(input.reason)}`);
    transaction.create(auditEventRef, {
      event_id: auditEventRef.id,
      organization_id: input.organization_id,
      company_id: input.company_id,
      actor_user_id: input.actor_user_id,
      action: 'MONTHLY_CLOSE_REOPENED',
      entity_type: 'PERIOD_LOCK',
      entity_id: lockId,
      payload_hash: hash(input.reason),
      idempotency_key: `MONTHLY_CLOSE_REOPENED:${input.close_id}:${hash(input.reason)}`,
      created_at: now
    });
  });
}
