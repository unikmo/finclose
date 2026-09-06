import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import { getServiceDeployment } from './service-deployments';
import { appendProductionAuditEvent, assertProductionDateRangeOpen, commitPeriodLock, recordCloseApproval, reopenPeriodLock } from './production-ledger';
import { isRealDataMode } from './runtime-mode';

export type CloseActor = {
  kind: 'customer' | 'lab';
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type SourceRequirementType =
  | 'BANK'
  | 'CREDIT_CARD'
  | 'SALES'
  | 'PURCHASES'
  | 'PAYROLL'
  | 'TAX'
  | 'PENSION'
  | 'EXPENSES'
  | 'PAYMENT_PROCESSOR'
  | 'LOAN'
  | 'INTERCOMPANY'
  | 'OTHER';

export type SourceRequirementInput = {
  requirement_id: string;
  label: string;
  source_type: SourceRequirementType;
  required?: boolean;
  active_from?: string;
  active_to?: string;
  expected_frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PERIOD' | 'EVENT';
};

export type PeriodSourceEvidenceInput = {
  evidence_id: string;
  requirement_id: string;
  period_start: string;
  period_end: string;
  coverage_start: string;
  coverage_end: string;
  source_ids: string[];
  sequence_complete: boolean;
  record_count?: number;
  opening_balance?: number;
  prior_closing_balance?: number;
  notes?: string;
};

export type BalanceSheetCategory =
  | 'BANK_CASH'
  | 'ACCOUNTS_RECEIVABLE'
  | 'ACCOUNTS_PAYABLE'
  | 'PAYROLL_LIABILITY'
  | 'PAYROLL_TAX'
  | 'PENSION_SOCIAL'
  | 'INDIRECT_TAX'
  | 'INCOME_TAX'
  | 'EMPLOYEE_ADVANCE'
  | 'PREPAID'
  | 'ACCRUAL'
  | 'FIXED_ASSET'
  | 'ACCUMULATED_DEPRECIATION'
  | 'LOAN'
  | 'INTEREST'
  | 'INTERCOMPANY'
  | 'SUSPENSE_CLEARING'
  | 'EQUITY'
  | 'PAYMENT_PROCESSOR'
  | 'FOREIGN_CURRENCY'
  | 'OTHER';

export type BalanceSheetScopeInput = {
  account_code: string;
  account_name?: string;
  category: BalanceSheetCategory;
  material?: boolean;
  tolerance?: number;
};

export type ReconcilingItemInput = {
  item_id: string;
  description: string;
  amount: number;
  status: 'RESOLVED' | 'ACCEPTED_TIMING' | 'OPEN';
};

export type BalanceSheetReconciliationInput = {
  account_code: string;
  gl_balance: number;
  independent_balance: number;
  evidence_source_ids: string[];
  reconciling_items?: ReconcilingItemInput[];
};

export const CLOSE_GOVERNANCE_CAPABILITIES = {
  version: 'CLOSE-GOVERNANCE-LAYER-A-V1',
  source_completeness_version: 'SOURCE-COMPLETENESS-V1',
  balance_sheet_reconciliation_version: 'BALANCE-SHEET-RECONCILIATION-V1',
  period_lock_version: 'INTERNAL-PERIOD-LOCK-V1',
  implemented: [
    'expected-source registry separated from period evidence',
    'system-derived period completeness from expected sources versus verified stored artifacts',
    'continuous date-coverage and sequence-gap controls',
    'balance-sheet account scope registry with materiality and tolerance',
    'account-by-account GL-to-independent-source reconciliation with reconciling-item controls',
    'monthly-close approval bound to a SHA-256 evidence snapshot',
    'internal period lock with overlap enforcement for new payroll, bookkeeping and finance-cycle work',
    'explicit reopen path with reason, audit trail and approval invalidation'
  ],
  safeguards: [
    'A close cannot be approved unless core close controls pass, source completeness is system-derived complete, and all material balance-sheet accounts reconcile.',
    'Source evidence must reference stored FinClose service-source artifacts belonging to the same deployment.',
    'A close cannot be locked if its evidence snapshot changed after approval.',
    'A locked period blocks overlapping new payroll/bookkeeping/finance-cycle work until explicitly reopened.',
    'Reopening never deletes the original lock or approval history.',
    'In PILOT/PRODUCTION, PostgreSQL is the authoritative FinClose close-evidence and period-lock boundary; external provider locks remain separate.',
    'Manual-upload evidence proves artifact presence and declared coverage inside FinClose, not independent third-party connector completeness.'
  ],
  execution_boundary: 'LAB_OR_CONTROLLED_REAL_DATA_WITH_POSTGRES'
} as const;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function isoDate(value: unknown, field: string) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw httpError(`${field} must be YYYY-MM-DD`, 400);
  }
  return text;
}

function signedMoney(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw httpError(`${field} must be a number`, 400);
  return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
}

function nonNegativeMoney(value: unknown, field: string) {
  const number = signedMoney(value, field);
  if (number < 0) throw httpError(`${field} must be non-negative`, 400);
  return number;
}

function cleanId(value: unknown, field: string) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(text)) throw httpError(`${field} must use letters, numbers, _ or -`, 400);
  return text;
}

function cleanText(value: unknown, field: string, max = 240) {
  const text = String(value || '').trim();
  if (!text) throw httpError(`${field} is required`, 400);
  return text.slice(0, max);
}

function dateOrdinal(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((out, key) => {
      const item = record[key];
      if (item !== undefined) out[key] = stable(item);
      return out;
    }, {});
  }
  return value;
}

function fingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function accountKey(accountCode: string) {
  return crypto.createHash('sha256').update(accountCode).digest('hex').slice(0, 24);
}

function balanceScopeFingerprint(scope: Record<string, any>[]) {
  return fingerprint(scope.map(item => ({
    account_code: String(item.account_code || ''),
    account_name: item.account_name || null,
    category: String(item.category || ''),
    material: item.material !== false,
    tolerance: Number(item.tolerance || 0)
  })));
}

function actorRecord(actor: CloseActor) {
  if (actor.kind === 'customer') {
    if (!actor.user_id || !actor.email) throw httpError('authenticated customer identity is required', 403);
    return {
      kind: 'customer',
      user_id: String(actor.user_id),
      name: String(actor.name || ''),
      email: String(actor.email).trim().toLowerCase()
    };
  }
  return { kind: 'lab', user_id: null, name: 'FinClose Lab', email: null };
}

async function requireClose(deploymentId: string, closeId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const snap = await realtimeDatabase().ref(`finclose_monthly_closes/${closeId}`).once('value');
  if (!snap.exists()) throw httpError('monthly close not found', 404);
  const close = snap.val() as Record<string, any>;
  if (String(close.deployment_id) !== deploymentId || String(close.company_id) !== String(deployment.company_id)) {
    throw httpError('monthly close does not belong to this service deployment', 403);
  }
  return { deployment, close };
}

async function verifySourceIds(deploymentId: string, sourceIds: string[]) {
  const ids = Array.from(new Set((sourceIds || []).map(id => String(id || '').trim()).filter(Boolean))).sort();
  if (!ids.length) throw httpError('at least one source_id is required', 400);
  const db = realtimeDatabase();
  const verified = [] as Array<{ source_id: string; sha256: string; filename: string; connector: string; created_at: number }>;
  for (const id of ids) {
    const snap = await db.ref(`finclose_service_sources/${id}`).once('value');
    if (!snap.exists()) throw httpError(`source artifact not found: ${id}`, 404);
    const source = snap.val() as Record<string, any>;
    if (String(source.deployment_id) !== deploymentId) throw httpError(`source artifact belongs to another deployment: ${id}`, 403);
    if (String(source.status || '') !== 'RECEIVED') throw httpError(`source artifact is not in RECEIVED state: ${id}`, 409);
    if (!source.sha256) throw httpError(`source artifact fingerprint is missing: ${id}`, 409);
    verified.push({
      source_id: id,
      sha256: String(source.sha256),
      filename: String(source.filename || ''),
      connector: String(source.connector || ''),
      created_at: Number(source.created_at || 0)
    });
  }
  return verified;
}

export async function configureSourceRequirements(deploymentId: string, input: { requirements: SourceRequirementInput[] }) {
  await getServiceDeployment(deploymentId);
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) throw httpError('at least one source requirement is required', 400);
  const seen = new Set<string>();
  const normalized = input.requirements.map(raw => {
    const requirementId = cleanId(raw.requirement_id, 'requirement_id');
    if (seen.has(requirementId)) throw httpError(`duplicate source requirement: ${requirementId}`, 400);
    seen.add(requirementId);
    const sourceType = String(raw.source_type || '').toUpperCase() as SourceRequirementType;
    const allowed: SourceRequirementType[] = ['BANK', 'CREDIT_CARD', 'SALES', 'PURCHASES', 'PAYROLL', 'TAX', 'PENSION', 'EXPENSES', 'PAYMENT_PROCESSOR', 'LOAN', 'INTERCOMPANY', 'OTHER'];
    if (!allowed.includes(sourceType)) throw httpError(`unsupported source_type for ${requirementId}`, 400);
    const activeFrom = raw.active_from ? isoDate(raw.active_from, `active_from for ${requirementId}`) : null;
    const activeTo = raw.active_to ? isoDate(raw.active_to, `active_to for ${requirementId}`) : null;
    if (activeFrom && activeTo && activeFrom > activeTo) throw httpError(`active_from is after active_to for ${requirementId}`, 400);
    return {
      requirement_id: requirementId,
      label: cleanText(raw.label, `label for ${requirementId}`),
      source_type: sourceType,
      required: raw.required !== false,
      active_from: activeFrom,
      active_to: activeTo,
      expected_frequency: raw.expected_frequency || 'PERIOD'
    };
  });
  if (!normalized.some(item => item.required)) throw httpError('at least one required source must be configured', 400);

  const now = Date.now();
  const records = Object.fromEntries(normalized.map(item => [item.requirement_id, { ...item, deployment_id: deploymentId, updated_at: now }]));
  const db = realtimeDatabase();
  await db.ref(`finclose_source_requirements/${deploymentId}`).set(records);
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref(`finclose_audit_events/${auditKey}`).set({
    event: 'SOURCE_REQUIREMENTS_CONFIGURED',
    deployment_id: deploymentId,
    required_count: normalized.filter(item => item.required).length,
    total_count: normalized.length,
    created_at: now
  });
  return { deployment_id: deploymentId, requirements: normalized, updated_at: now };
}

export async function recordPeriodSourceEvidence(deploymentId: string, input: PeriodSourceEvidenceInput) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const evidenceId = cleanId(input.evidence_id, 'evidence_id');
  const requirementId = cleanId(input.requirement_id, 'requirement_id');
  const periodStart = isoDate(input.period_start, 'period_start');
  const periodEnd = isoDate(input.period_end, 'period_end');
  const coverageStart = isoDate(input.coverage_start, 'coverage_start');
  const coverageEnd = isoDate(input.coverage_end, 'coverage_end');
  if (periodStart > periodEnd) throw httpError('period_start must not be after period_end', 400);
  if (deployment.company_id) await assertDateRangeOpenForCompany(String(deployment.company_id), periodStart, periodEnd, 'source evidence');
  if (coverageStart > coverageEnd) throw httpError('coverage_start must not be after coverage_end', 400);
  if (typeof input.sequence_complete !== 'boolean') throw httpError('sequence_complete must be true or false', 400);

  const reqSnap = await realtimeDatabase().ref(`finclose_source_requirements/${deploymentId}/${requirementId}`).once('value');
  if (!reqSnap.exists()) throw httpError(`source requirement not configured: ${requirementId}`, 404);
  const artifacts = await verifySourceIds(deploymentId, input.source_ids || []);
  const hasOpening = input.opening_balance !== undefined && input.opening_balance !== null;
  const hasPrior = input.prior_closing_balance !== undefined && input.prior_closing_balance !== null;
  const opening = hasOpening ? signedMoney(input.opening_balance, 'opening_balance') : null;
  const prior = hasPrior ? signedMoney(input.prior_closing_balance, 'prior_closing_balance') : null;
  const continuityDifference = opening !== null && prior !== null ? signedMoney(opening - prior, 'statement continuity difference') : null;
  const now = Date.now();
  const record = {
    evidence_id: evidenceId,
    deployment_id: deploymentId,
    requirement_id: requirementId,
    period_start: periodStart,
    period_end: periodEnd,
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    source_ids: artifacts.map(item => item.source_id),
    artifact_fingerprints: artifacts.map(item => ({ source_id: item.source_id, sha256: item.sha256 })),
    artifact_count: artifacts.length,
    sequence_complete: input.sequence_complete,
    record_count: input.record_count === undefined ? null : Math.max(0, Math.floor(Number(input.record_count) || 0)),
    opening_balance: opening,
    prior_closing_balance: prior,
    continuity_difference: continuityDifference,
    continuity_pass: continuityDifference === null ? null : continuityDifference === 0,
    notes: String(input.notes || '').trim().slice(0, 500) || null,
    verification_status: 'ARTIFACTS_VERIFIED',
    created_at: now,
    updated_at: now
  };
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_period_source_evidence/${deploymentId}/${periodEnd}/${evidenceId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'PERIOD_SOURCE_EVIDENCE_RECORDED',
      deployment_id: deploymentId,
      evidence_id: evidenceId,
      requirement_id: requirementId,
      period_end: periodEnd,
      artifact_count: artifacts.length,
      created_at: now
    }
  });
  return record;
}

type VerifiedEvidenceForCalculation = Record<string, any> & { artifact_live?: boolean };

function continuousCoverage(evidence: VerifiedEvidenceForCalculation[], periodStart: string, periodEnd: string) {
  if (!evidence.length) return false;
  const start = dateOrdinal(periodStart);
  const end = dateOrdinal(periodEnd);
  const ranges = evidence
    .map(item => ({ start: dateOrdinal(String(item.coverage_start)), end: dateOrdinal(String(item.coverage_end)) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = start;
  for (const range of ranges) {
    if (range.end < cursor) continue;
    if (range.start > cursor) return false;
    cursor = Math.max(cursor, range.end + 1);
    if (cursor > end) return true;
  }
  return cursor > end;
}

export function calculateSourceCompleteness(
  requirements: Record<string, any>[],
  evidence: VerifiedEvidenceForCalculation[],
  periodStart: string,
  periodEnd: string
) {
  const active = requirements.filter(req => {
    if (req.active_from && String(req.active_from) > periodEnd) return false;
    if (req.active_to && String(req.active_to) < periodStart) return false;
    return true;
  });
  const required = active.filter(req => req.required !== false);
  if (!required.length) {
    return {
      engine_version: CLOSE_GOVERNANCE_CAPABILITIES.source_completeness_version,
      status: 'NOT_CONFIGURED',
      proof_basis: 'EXPECTED_SOURCE_REGISTRY_VS_VERIFIED_ARTIFACTS',
      requirements: [],
      blockers: ['NO_REQUIRED_SOURCE_REQUIREMENTS_CONFIGURED']
    };
  }

  const results = required.map(req => {
    const rows = evidence.filter(item => String(item.requirement_id) === String(req.requirement_id));
    const artifactLive = rows.length > 0 && rows.every(item => item.artifact_live !== false);
    const sequenceComplete = rows.length > 0 && rows.every(item => item.sequence_complete === true);
    const continuityPass = rows.every(item => item.continuity_pass !== false);
    const coverageComplete = continuousCoverage(rows, periodStart, periodEnd);
    const pass = rows.length > 0 && artifactLive && sequenceComplete && continuityPass && coverageComplete;
    const blockers: string[] = [];
    if (!rows.length) blockers.push('NO_EVIDENCE');
    if (rows.length && !artifactLive) blockers.push('ARTIFACT_MISSING_OR_INVALID');
    if (rows.length && !sequenceComplete) blockers.push('SEQUENCE_GAPS_DECLARED');
    if (rows.length && !continuityPass) blockers.push('STATEMENT_CONTINUITY_DIFFERENCE');
    if (rows.length && !coverageComplete) blockers.push('PERIOD_COVERAGE_GAP');
    return {
      requirement_id: req.requirement_id,
      label: req.label,
      source_type: req.source_type,
      status: pass ? 'COMPLETE' : 'INCOMPLETE',
      evidence_ids: rows.map(item => item.evidence_id).sort(),
      source_ids: Array.from(new Set(rows.flatMap(item => item.source_ids || []))).sort(),
      coverage_complete: coverageComplete,
      sequence_complete: sequenceComplete,
      continuity_pass: continuityPass,
      artifacts_live: artifactLive,
      blockers
    };
  });
  const blockers = results.flatMap(row => row.blockers.map(blocker => `${row.requirement_id}:${blocker}`));
  return {
    engine_version: CLOSE_GOVERNANCE_CAPABILITIES.source_completeness_version,
    status: blockers.length ? 'INCOMPLETE' : 'SYSTEM_DERIVED_COMPLETE',
    proof_basis: 'EXPECTED_SOURCE_REGISTRY_VS_VERIFIED_ARTIFACTS',
    required_count: results.length,
    complete_count: results.filter(row => row.status === 'COMPLETE').length,
    requirements: results,
    blockers
  };
}

async function deriveSourceCompleteness(deploymentId: string, close: Record<string, any>) {
  const db = realtimeDatabase();
  const reqSnap = await db.ref(`finclose_source_requirements/${deploymentId}`).once('value');
  const requirements = reqSnap.exists() ? Object.values(reqSnap.val() as Record<string, any>) : [];
  const evidenceSnap = await db.ref(`finclose_period_source_evidence/${deploymentId}/${close.period_end}`).once('value');
  const evidence = evidenceSnap.exists() ? Object.values(evidenceSnap.val() as Record<string, any>) as VerifiedEvidenceForCalculation[] : [];

  for (const row of evidence) {
    try {
      const verified = await verifySourceIds(deploymentId, Array.isArray(row.source_ids) ? row.source_ids : []);
      row.artifact_live = verified.length === (Array.isArray(row.source_ids) ? row.source_ids.length : 0);
    } catch {
      row.artifact_live = false;
    }
  }
  return calculateSourceCompleteness(requirements as Record<string, any>[], evidence, String(close.period_start), String(close.period_end));
}

export async function evaluateSourceCompleteness(deploymentId: string, closeId: string) {
  const { close } = await requireClose(deploymentId, closeId);
  if (String(close.close_status || '') === 'LOCKED') throw httpError('locked close source evidence is immutable; reopen the period first', 409);
  if (String(close.close_status || '') === 'REOPENED') throw httpError('reopened close requires a new close version before source evaluation', 409);
  const result = await deriveSourceCompleteness(deploymentId, close);
  const now = Date.now();
  const record = {
    ...result,
    source_completeness_id: `${closeId}__sources`,
    deployment_id: deploymentId,
    company_id: close.company_id,
    monthly_close_id: closeId,
    period_start: close.period_start,
    period_end: close.period_end,
    evaluated_at: now
  };
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_close_source_completeness/${closeId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'SOURCE_COMPLETENESS_EVALUATED',
      deployment_id: deploymentId,
      monthly_close_id: closeId,
      status: result.status,
      blocker_count: result.blockers.length,
      created_at: now
    }
  });
  return record;
}

export async function configureBalanceSheetScope(deploymentId: string, input: { accounts: BalanceSheetScopeInput[] }) {
  await getServiceDeployment(deploymentId);
  if (!Array.isArray(input.accounts) || input.accounts.length === 0) throw httpError('at least one balance-sheet account is required', 400);
  const seen = new Set<string>();
  const allowed: BalanceSheetCategory[] = ['BANK_CASH', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'PAYROLL_LIABILITY', 'PAYROLL_TAX', 'PENSION_SOCIAL', 'INDIRECT_TAX', 'INCOME_TAX', 'EMPLOYEE_ADVANCE', 'PREPAID', 'ACCRUAL', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', 'LOAN', 'INTEREST', 'INTERCOMPANY', 'SUSPENSE_CLEARING', 'EQUITY', 'PAYMENT_PROCESSOR', 'FOREIGN_CURRENCY', 'OTHER'];
  const normalized = input.accounts.map(raw => {
    const code = cleanText(raw.account_code, 'account_code', 80);
    if (seen.has(code)) throw httpError(`duplicate balance-sheet account: ${code}`, 400);
    seen.add(code);
    const category = String(raw.category || '').toUpperCase() as BalanceSheetCategory;
    if (!allowed.includes(category)) throw httpError(`unsupported balance-sheet category for ${code}`, 400);
    return {
      account_code: code,
      account_name: String(raw.account_name || '').trim().slice(0, 160) || null,
      category,
      material: raw.material !== false,
      tolerance: nonNegativeMoney(raw.tolerance ?? 0, `tolerance for ${code}`)
    };
  });
  if (!normalized.some(item => item.material)) throw httpError('at least one material balance-sheet account is required', 400);
  const now = Date.now();
  const scopeFingerprint = balanceScopeFingerprint(normalized);
  const records = Object.fromEntries(normalized.map(item => [accountKey(item.account_code), { ...item, deployment_id: deploymentId, updated_at: now }]));
  const db = realtimeDatabase();
  await db.ref().update({
    [`finclose_balance_sheet_scope/${deploymentId}`]: records,
    [`finclose_balance_sheet_scope_meta/${deploymentId}`]: { deployment_id: deploymentId, scope_fingerprint: scopeFingerprint, account_count: normalized.length, material_account_count: normalized.filter(item => item.material).length, updated_at: now }
  });
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref(`finclose_audit_events/${auditKey}`).set({
    event: 'BALANCE_SHEET_SCOPE_CONFIGURED',
    deployment_id: deploymentId,
    material_account_count: normalized.filter(item => item.material).length,
    total_account_count: normalized.length,
    created_at: now
  });
  return { deployment_id: deploymentId, scope_fingerprint: scopeFingerprint, accounts: normalized, updated_at: now };
}

type CalculableReconciliation = BalanceSheetReconciliationInput & { evidence_live?: boolean };

export function calculateBalanceSheetReconciliation(scope: Record<string, any>[], entries: CalculableReconciliation[]) {
  const scopeMap = new Map(scope.map(item => [String(item.account_code), item]));
  const entryMap = new Map(entries.map(item => [String(item.account_code), item]));
  const exceptions: string[] = [];
  for (const entry of entries) {
    if (!scopeMap.has(String(entry.account_code))) exceptions.push(`UNSCOPED_ACCOUNT:${entry.account_code}`);
  }
  const results = scope.map(account => {
    const code = String(account.account_code);
    const entry = entryMap.get(code);
    if (!entry) {
      const required = account.material !== false;
      if (required) exceptions.push(`MISSING_RECONCILIATION:${code}`);
      return {
        account_code: code,
        account_name: account.account_name || null,
        category: account.category,
        material: required,
        tolerance: Number(account.tolerance || 0),
        status: required ? 'MISSING' : 'NOT_PROVIDED_NON_MATERIAL'
      };
    }
    const gl = signedMoney(entry.gl_balance, `gl_balance for ${code}`);
    const independent = signedMoney(entry.independent_balance, `independent_balance for ${code}`);
    const seenItems = new Set<string>();
    const items = (entry.reconciling_items || []).map(item => {
      const itemId = cleanId(item.item_id, `reconciling item id for ${code}`);
      if (seenItems.has(itemId)) throw httpError(`duplicate reconciling item ${itemId} for ${code}`, 400);
      seenItems.add(itemId);
      const status = String(item.status || '').toUpperCase();
      if (!['RESOLVED', 'ACCEPTED_TIMING', 'OPEN'].includes(status)) throw httpError(`invalid reconciling item status for ${code}:${itemId}`, 400);
      return {
        item_id: itemId,
        description: cleanText(item.description, `reconciling item description for ${code}`),
        amount: signedMoney(item.amount, `reconciling item amount for ${code}`),
        status: status as ReconcilingItemInput['status']
      };
    });
    const rawDifference = signedMoney(gl - independent, `raw difference for ${code}`);
    const explainedDifference = signedMoney(items.reduce((sum, item) => sum + item.amount, 0), `explained difference for ${code}`);
    const unexplainedDifference = signedMoney(rawDifference - explainedDifference, `unexplained difference for ${code}`);
    const tolerance = Number(account.tolerance || 0);
    const openItems = items.filter(item => item.status === 'OPEN');
    const evidenceLive = entry.evidence_live !== false && Array.isArray(entry.evidence_source_ids) && entry.evidence_source_ids.length > 0;
    const pass = evidenceLive && Math.abs(unexplainedDifference) <= tolerance && openItems.length === 0;
    if (account.material !== false && !pass) exceptions.push(`ACCOUNT_NOT_RECONCILED:${code}`);
    return {
      account_code: code,
      account_name: account.account_name || null,
      category: account.category,
      material: account.material !== false,
      tolerance,
      gl_balance: gl,
      independent_balance: independent,
      raw_difference: rawDifference,
      explained_difference: explainedDifference,
      unexplained_difference: unexplainedDifference,
      evidence_source_ids: (entry.evidence_source_ids || []).slice().sort(),
      evidence_live: evidenceLive,
      reconciling_items: items,
      open_item_count: openItems.length,
      status: pass ? 'RECONCILED' : 'EXCEPTION'
    };
  });
  const material = results.filter(item => item.material);
  return {
    engine_version: CLOSE_GOVERNANCE_CAPABILITIES.balance_sheet_reconciliation_version,
    status: exceptions.length ? 'EXCEPTIONS_OPEN' : 'PASS',
    material_account_count: material.length,
    reconciled_material_account_count: material.filter(item => item.status === 'RECONCILED').length,
    accounts: results,
    exceptions
  };
}

export async function prepareBalanceSheetReconciliation(deploymentId: string, closeId: string, input: { reconciliations: BalanceSheetReconciliationInput[] }) {
  const { close } = await requireClose(deploymentId, closeId);
  if (String(close.close_status || '') === 'LOCKED') throw httpError('locked close reconciliation is immutable; reopen the period first', 409);
  if (String(close.close_status || '') === 'REOPENED') throw httpError('reopened close requires a new close version before reconciliation', 409);
  const scopeSnap = await realtimeDatabase().ref(`finclose_balance_sheet_scope/${deploymentId}`).once('value');
  if (!scopeSnap.exists()) throw httpError('configure the balance-sheet account scope before reconciling the close', 409);
  const scope = Object.values(scopeSnap.val() as Record<string, any>) as Record<string, any>[];
  if (!Array.isArray(input.reconciliations)) throw httpError('reconciliations must be an array', 400);
  const seen = new Set<string>();
  const entries: CalculableReconciliation[] = [];
  for (const raw of input.reconciliations) {
    const code = cleanText(raw.account_code, 'account_code', 80);
    if (seen.has(code)) throw httpError(`duplicate reconciliation account: ${code}`, 400);
    seen.add(code);
    const artifacts = await verifySourceIds(deploymentId, raw.evidence_source_ids || []);
    entries.push({
      ...raw,
      account_code: code,
      evidence_source_ids: artifacts.map(item => item.source_id),
      evidence_live: true
    });
  }
  const scopeFingerprint = balanceScopeFingerprint(scope);
  const result = calculateBalanceSheetReconciliation(scope, entries);
  const now = Date.now();
  const record = {
    ...result,
    balance_sheet_reconciliation_id: `${closeId}__balance-sheet`,
    scope_fingerprint: scopeFingerprint,
    deployment_id: deploymentId,
    company_id: close.company_id,
    monthly_close_id: closeId,
    period_start: close.period_start,
    period_end: close.period_end,
    evaluated_at: now
  };
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_balance_sheet_reconciliations/${closeId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'BALANCE_SHEET_RECONCILIATION_PREPARED',
      deployment_id: deploymentId,
      monthly_close_id: closeId,
      status: result.status,
      exception_count: result.exceptions.length,
      created_at: now
    }
  });
  const governance = await refreshCloseGovernance(deploymentId, closeId);
  return { reconciliation: record, governance };
}

async function loadBalanceSheetReconciliation(closeId: string) {
  const snap = await realtimeDatabase().ref(`finclose_balance_sheet_reconciliations/${closeId}`).once('value');
  return snap.exists() ? snap.val() as Record<string, any> : null;
}

export async function refreshCloseGovernance(deploymentId: string, closeId: string) {
  const { close } = await requireClose(deploymentId, closeId);
  if (String(close.close_status || '') === 'LOCKED') {
    return { monthly_close_id: closeId, status: close.status, approval_status: close.approval_status, layer_a: close.layer_a || null };
  }
  const source = await evaluateSourceCompleteness(deploymentId, closeId);
  const balanceSheet = await loadBalanceSheetReconciliation(closeId);
  const scopeSnap = await realtimeDatabase().ref(`finclose_balance_sheet_scope/${deploymentId}`).once('value');
  const currentScope = scopeSnap.exists() ? Object.values(scopeSnap.val() as Record<string, any>) as Record<string, any>[] : [];
  const currentScopeFingerprint = currentScope.length ? balanceScopeFingerprint(currentScope) : null;
  const scopeMatches = Boolean(balanceSheet && currentScopeFingerprint && String(balanceSheet.scope_fingerprint || '') === currentScopeFingerprint);
  const corePass = String(close.control_status || '') === 'PASS';
  const sourcePass = String(source.status) === 'SYSTEM_DERIVED_COMPLETE';
  const balanceSheetPass = String(balanceSheet?.status || '') === 'PASS' && scopeMatches;
  const blockers = [
    ...(Array.isArray(close.exceptions) ? close.exceptions.map(String) : []),
    ...source.blockers.map((item: string) => `SOURCE:${item}`),
    ...(balanceSheet ? (balanceSheet.exceptions || []).map((item: string) => `BALANCE_SHEET:${item}`) : ['BALANCE_SHEET:NOT_PREPARED']),
    ...(balanceSheet && !scopeMatches ? ['BALANCE_SHEET:SCOPE_CHANGED_RECONCILIATION_REQUIRED'] : [])
  ];
  const ready = corePass && sourcePass && balanceSheetPass && blockers.length === 0;
  const existingApproval = String(close.approval_status || '');
  const existingCloseStatus = String(close.close_status || '');
  const locked = existingCloseStatus === 'LOCKED';
  const reopened = existingCloseStatus === 'REOPENED';
  const approved = existingApproval === 'APPROVED';
  const effectiveReady = ready && !reopened;
  const effectiveBlockers = reopened ? [...blockers, 'CLOSE_REOPENED_REQUIRES_NEW_VERSION'] : blockers;
  const status = locked
    ? 'CLOSED_LOCKED'
    : reopened
      ? 'REOPENED_REQUIRES_NEW_CLOSE'
      : approved
        ? 'APPROVED_READY_TO_LOCK'
        : effectiveReady
          ? 'CONTROLS_PASS_APPROVAL_REQUIRED'
          : corePass
            ? 'LAYER_A_INCOMPLETE'
            : 'EXCEPTIONS_OPEN';
  const approvalStatus = locked || approved ? existingApproval : reopened ? 'INVALIDATED_BY_REOPEN' : effectiveReady ? 'APPROVAL_REQUIRED' : 'BLOCKED_PENDING_LAYER_A';
  const now = Date.now();
  const layerA = {
    engine_version: CLOSE_GOVERNANCE_CAPABILITIES.version,
    source_completeness_id: source.source_completeness_id,
    source_completeness_status: source.status,
    balance_sheet_reconciliation_id: balanceSheet?.balance_sheet_reconciliation_id || null,
    balance_sheet_reconciliation_status: balanceSheet?.status || 'NOT_PREPARED',
    balance_sheet_scope_fingerprint: currentScopeFingerprint,
    balance_sheet_scope_matches_reconciliation: scopeMatches,
    governance_status: reopened ? 'REOPENED_REQUIRES_NEW_CLOSE' : effectiveReady ? 'READY_FOR_APPROVAL' : 'BLOCKED',
    blockers: effectiveBlockers,
    evaluated_at: now
  };
  await realtimeDatabase().ref(`finclose_monthly_closes/${closeId}`).update({
    status,
    approval_status: approvalStatus,
    layer_a: layerA,
    updated_at: now
  });
  return { monthly_close_id: closeId, status, approval_status: approvalStatus, layer_a: layerA };
}

async function approvalEvidenceSnapshot(closeId: string) {
  const db = realtimeDatabase();
  const closeSnap = await db.ref(`finclose_monthly_closes/${closeId}`).once('value');
  const sourceSnap = await db.ref(`finclose_close_source_completeness/${closeId}`).once('value');
  const balanceSnap = await db.ref(`finclose_balance_sheet_reconciliations/${closeId}`).once('value');
  if (!closeSnap.exists()) throw httpError('monthly close not found', 404);
  const close = closeSnap.val() as Record<string, any>;
  const source = sourceSnap.exists() ? sourceSnap.val() as Record<string, any> : null;
  const balance = balanceSnap.exists() ? balanceSnap.val() as Record<string, any> : null;
  return {
    monthly_close_id: closeId,
    finance_cycle_id: close.finance_cycle_id,
    bookkeeping_batch_id: close.bookkeeping_batch_id,
    payroll_run_id: close.payroll_run_id,
    period_start: close.period_start,
    period_end: close.period_end,
    core_control_status: close.control_status,
    core_controls: close.controls,
    core_exceptions: close.exceptions || [],
    source_completeness: source ? {
      engine_version: source.engine_version,
      status: source.status,
      proof_basis: source.proof_basis,
      required_count: source.required_count,
      complete_count: source.complete_count,
      requirements: source.requirements || [],
      blockers: source.blockers || []
    } : null,
    balance_sheet_reconciliation: balance ? {
      engine_version: balance.engine_version,
      status: balance.status,
      material_account_count: balance.material_account_count,
      reconciled_material_account_count: balance.reconciled_material_account_count,
      accounts: balance.accounts || [],
      exceptions: balance.exceptions || []
    } : null
  };
}

export async function approveMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, note?: string) {
  const identity = actorRecord(actor);
  await refreshCloseGovernance(deploymentId, closeId);
  const { deployment, close } = await requireClose(deploymentId, closeId);
  if (String(close.close_status || '') === 'LOCKED') return { ...close, duplicate: true };
  if (String(close.close_status || '') === 'REOPENED') throw httpError('reopened close requires a new close version before approval', 409);
  if (String(close.layer_a?.governance_status || '') !== 'READY_FOR_APPROVAL') throw httpError('monthly close is not ready for approval', 409);
  if (String(close.control_status || '') !== 'PASS') throw httpError('core monthly-close controls have not passed', 409);

  const snapshot = await approvalEvidenceSnapshot(closeId);
  const evidenceHash = fingerprint(snapshot);
  if (String(close.approval_status || '') === 'APPROVED' && String(close.approval_evidence_hash || '') === evidenceHash) {
    return { ...close, duplicate: true };
  }
  const approvalId = crypto.randomUUID();
  const now = Date.now();
  const approval = {
    approval_id: approvalId,
    monthly_close_id: closeId,
    deployment_id: deploymentId,
    company_id: close.company_id,
    actor: identity,
    note: String(note || '').trim().slice(0, 500) || null,
    evidence_hash: evidenceHash,
    evidence_snapshot: snapshot,
    status: 'APPROVED',
    created_at: now
  };
  if (isRealDataMode()) {
    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer approval identity is required in real-data mode', 403);
    const organizationId = String(deployment.organization_id || '').trim();
    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);
    await recordCloseApproval({
      organization_id: organizationId,
      company_id: String(close.company_id),
      close_id: closeId,
      evidence_hash: evidenceHash,
      actor_user_id: String(actor.user_id),
      snapshot
    });
  }
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_close_approvals/${closeId}/${approvalId}`]: approval,
    [`finclose_monthly_closes/${closeId}/status`]: 'APPROVED_READY_TO_LOCK',
    [`finclose_monthly_closes/${closeId}/approval_status`]: 'APPROVED',
    [`finclose_monthly_closes/${closeId}/close_status`]: 'APPROVED_PENDING_LOCK',
    [`finclose_monthly_closes/${closeId}/approval_id`]: approvalId,
    [`finclose_monthly_closes/${closeId}/approval_evidence_hash`]: evidenceHash,
    [`finclose_monthly_closes/${closeId}/approved_by`]: identity,
    [`finclose_monthly_closes/${closeId}/approved_at`]: now,
    [`finclose_monthly_closes/${closeId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'MONTHLY_CLOSE_APPROVED',
      deployment_id: deploymentId,
      monthly_close_id: closeId,
      company_id: close.company_id,
      approval_id: approvalId,
      evidence_hash: evidenceHash,
      actor: identity,
      created_at: now
    }
  });
  return requireClose(deploymentId, closeId).then(result => result.close);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export async function assertDateRangeOpenForCompany(companyId: string, periodStart: string, periodEnd: string, context = 'transaction') {
  const start = isoDate(periodStart, `${context} period_start`);
  const end = isoDate(periodEnd, `${context} period_end`);
  if (start > end) throw httpError(`${context} period_start must not be after period_end`, 400);
  if (isRealDataMode()) await assertProductionDateRangeOpen(companyId, start, end, context);
  const snap = await realtimeDatabase().ref(`finclose_period_locks_by_company/${companyId}`).once('value');
  if (!snap.exists()) return;
  const locks = Object.values(snap.val() as Record<string, any>) as Record<string, any>[];
  const blocking = locks.find(lock => String(lock.status) === 'LOCKED' && rangesOverlap(start, end, String(lock.period_start), String(lock.period_end)));
  if (blocking) throw httpError(`${context} overlaps locked period ${blocking.period_start} to ${blocking.period_end}`, 409);
}

export async function lockMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, note?: string) {
  const identity = actorRecord(actor);
  await refreshCloseGovernance(deploymentId, closeId);
  const { deployment, close } = await requireClose(deploymentId, closeId);
  if (String(close.close_status || '') === 'LOCKED') return { ...close, duplicate: true };
  if (String(close.approval_status || '') !== 'APPROVED') throw httpError('approve the monthly close before locking the period', 409);
  if (String(close.layer_a?.governance_status || '') !== 'READY_FOR_APPROVAL') throw httpError('Layer A controls changed after approval; re-approval is required', 409);
  const snapshot = await approvalEvidenceSnapshot(closeId);
  const currentHash = fingerprint(snapshot);
  if (!close.approval_evidence_hash || String(close.approval_evidence_hash) !== currentHash) {
    throw httpError('close evidence changed after approval; re-approval is required', 409);
  }

  const db = realtimeDatabase();
  const existingSnap = await db.ref(`finclose_period_locks_by_company/${close.company_id}`).once('value');
  if (existingSnap.exists()) {
    const locks = Object.values(existingSnap.val() as Record<string, any>) as Record<string, any>[];
    const overlap = locks.find(lock => String(lock.status) === 'LOCKED' && rangesOverlap(String(close.period_start), String(close.period_end), String(lock.period_start), String(lock.period_end)));
    if (overlap) {
      if (String(overlap.monthly_close_id) === closeId) return { ...close, duplicate: true };
      throw httpError(`another close already locks ${overlap.period_start} to ${overlap.period_end}`, 409);
    }
  }

  let lockId = `${close.company_id}__${close.period_end}__${currentHash.slice(0, 12)}`.replace(/[^A-Za-z0-9_-]/g, '_');
  if (isRealDataMode()) {
    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer lock identity is required in real-data mode', 403);
    const organizationId = String(deployment.organization_id || '').trim();
    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);
    const authoritativeLockId = await commitPeriodLock({
      organization_id: organizationId,
      company_id: String(close.company_id),
      close_id: closeId,
      period_start: String(close.period_start),
      period_end: String(close.period_end),
      evidence_hash: currentHash,
      actor_user_id: String(actor.user_id),
      payload: snapshot
    });
    if (!authoritativeLockId) throw httpError('authoritative PostgreSQL period lock was not created', 503);
    lockId = String(authoritativeLockId);
  }
  const now = Date.now();
  const lock = {
    period_lock_id: lockId,
    lock_version: CLOSE_GOVERNANCE_CAPABILITIES.period_lock_version,
    deployment_id: deploymentId,
    company_id: close.company_id,
    monthly_close_id: closeId,
    finance_cycle_id: close.finance_cycle_id,
    period_start: close.period_start,
    period_end: close.period_end,
    approval_id: close.approval_id,
    approval_evidence_hash: currentHash,
    evidence_snapshot: snapshot,
    status: 'LOCKED',
    locked_by: identity,
    lock_note: String(note || '').trim().slice(0, 500) || null,
    locked_at: now,
    created_at: now,
    updated_at: now
  };
  const eventKey = db.ref('finclose_period_lock_events').push().key!;
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_period_locks/${lockId}`]: lock,
    [`finclose_period_locks_by_company/${close.company_id}/${lockId}`]: lock,
    [`finclose_period_lock_events/${eventKey}`]: { event: 'PERIOD_LOCKED', ...lock },
    [`finclose_monthly_closes/${closeId}/status`]: 'CLOSED_LOCKED',
    [`finclose_monthly_closes/${closeId}/close_status`]: 'LOCKED',
    [`finclose_monthly_closes/${closeId}/period_lock_id`]: lockId,
    [`finclose_monthly_closes/${closeId}/locked_by`]: identity,
    [`finclose_monthly_closes/${closeId}/locked_at`]: now,
    [`finclose_monthly_closes/${closeId}/updated_at`]: now,
    [`finclose_service_deployments/${deploymentId}/latest_locked_period_end`]: close.period_end,
    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'MONTHLY_CLOSE_LOCKED',
      deployment_id: deploymentId,
      monthly_close_id: closeId,
      period_lock_id: lockId,
      company_id: close.company_id,
      actor: identity,
      created_at: now
    }
  });
  return requireClose(deploymentId, closeId).then(result => result.close);
}

export async function reopenMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, reason: string) {
  const identity = actorRecord(actor);
  const { deployment, close } = await requireClose(deploymentId, closeId);
  const reasonText = cleanText(reason, 'reopen reason', 500);
  if (reasonText.length < 10) throw httpError('reopen reason must be at least 10 characters', 400);
  const lockId = String(close.period_lock_id || '');
  if (!lockId || String(close.close_status || '') !== 'LOCKED') throw httpError('monthly close is not locked', 409);
  const db = realtimeDatabase();
  const lockSnap = await db.ref(`finclose_period_locks/${lockId}`).once('value');
  if (!lockSnap.exists()) throw httpError('period lock record not found', 409);
  const lock = lockSnap.val() as Record<string, any>;
  if (String(lock.status) !== 'LOCKED') return { ...close, duplicate: true };
  if (isRealDataMode()) {
    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer reopen identity is required in real-data mode', 403);
    const organizationId = String(deployment.organization_id || '').trim();
    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);
    await reopenPeriodLock({
      organization_id: organizationId,
      company_id: String(close.company_id),
      close_id: closeId,
      actor_user_id: String(actor.user_id),
      reason: reasonText
    });
  }
  const now = Date.now();
  const reopenCount = Number(lock.reopen_count || 0) + 1;
  const reopenNonce = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const eventKey = db.ref('finclose_period_lock_events').push().key!;
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const reopened = {
    ...lock,
    status: 'REOPENED',
    reopen_count: reopenCount,
    reopened_by: identity,
    reopened_at: now,
    reopen_reason: reasonText,
    updated_at: now
  };
  await db.ref().update({
    [`finclose_period_locks/${lockId}`]: reopened,
    [`finclose_period_locks_by_company/${close.company_id}/${lockId}`]: reopened,
    [`finclose_period_lock_events/${eventKey}`]: {
      event: 'PERIOD_REOPENED',
      period_lock_id: lockId,
      monthly_close_id: closeId,
      company_id: close.company_id,
      deployment_id: deploymentId,
      reason: reasonText,
      actor: identity,
      created_at: now
    },
    [`finclose_monthly_closes/${closeId}/status`]: 'REOPENED_REQUIRES_NEW_CLOSE',
    [`finclose_monthly_closes/${closeId}/close_status`]: 'REOPENED',
    [`finclose_monthly_closes/${closeId}/approval_status`]: 'INVALIDATED_BY_REOPEN',
    [`finclose_monthly_closes/${closeId}/reopened_by`]: identity,
    [`finclose_monthly_closes/${closeId}/reopened_at`]: now,
    [`finclose_monthly_closes/${closeId}/reopen_reason`]: reasonText,
    [`finclose_monthly_closes/${closeId}/reopen_count`]: reopenCount,
    [`finclose_monthly_closes/${closeId}/reopen_nonce`]: reopenNonce,
    [`finclose_monthly_closes/${closeId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'MONTHLY_CLOSE_REOPENED',
      deployment_id: deploymentId,
      monthly_close_id: closeId,
      period_lock_id: lockId,
      company_id: close.company_id,
      actor: identity,
      reason: reasonText,
      created_at: now
    }
  });
  return requireClose(deploymentId, closeId).then(result => result.close);
}

export async function getCloseGovernance(deploymentId: string, closeId: string) {
  await refreshCloseGovernance(deploymentId, closeId);
  const { close } = await requireClose(deploymentId, closeId);
  const db = realtimeDatabase();
  const sourceSnap = await db.ref(`finclose_close_source_completeness/${closeId}`).once('value');
  const balanceSnap = await db.ref(`finclose_balance_sheet_reconciliations/${closeId}`).once('value');
  const lockId = String(close.period_lock_id || '');
  const lockSnap = lockId ? await db.ref(`finclose_period_locks/${lockId}`).once('value') : null;
  return {
    monthly_close: close,
    source_completeness: sourceSnap.exists() ? sourceSnap.val() : null,
    balance_sheet_reconciliation: balanceSnap.exists() ? balanceSnap.val() : null,
    period_lock: lockSnap?.exists() ? lockSnap.val() : null
  };
}

export function closeGovernanceSelfTest() {
  const source = calculateSourceCompleteness(
    [{ requirement_id: 'BANK_MAIN', label: 'Main bank', source_type: 'BANK', required: true }],
    [{
      evidence_id: 'E1',
      requirement_id: 'BANK_MAIN',
      coverage_start: '2026-08-01',
      coverage_end: '2026-08-31',
      sequence_complete: true,
      continuity_pass: true,
      source_ids: ['S1'],
      artifact_live: true
    }],
    '2026-08-01',
    '2026-08-31'
  );
  const balance = calculateBalanceSheetReconciliation(
    [{ account_code: '1000', category: 'BANK_CASH', material: true, tolerance: 0, account_name: 'Bank' }],
    [{
      account_code: '1000',
      gl_balance: 100,
      independent_balance: 95,
      evidence_source_ids: ['S1'],
      evidence_live: true,
      reconciling_items: [{ item_id: 'TIMING1', description: 'Deposit in transit', amount: 5, status: 'ACCEPTED_TIMING' }]
    }]
  );
  const blocked = calculateBalanceSheetReconciliation(
    [{ account_code: '1000', category: 'BANK_CASH', material: true, tolerance: 0 }],
    [{
      account_code: '1000',
      gl_balance: 100,
      independent_balance: 95,
      evidence_source_ids: ['S1'],
      evidence_live: true,
      reconciling_items: [{ item_id: 'OPEN1', description: 'Unknown difference', amount: 5, status: 'OPEN' }]
    }]
  );
  return {
    ok: source.status === 'SYSTEM_DERIVED_COMPLETE' && balance.status === 'PASS' && blocked.status === 'EXCEPTIONS_OPEN',
    source,
    balance,
    blocked
  };
}
