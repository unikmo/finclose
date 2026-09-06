from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Close governance: PostgreSQL becomes the authoritative irreversible-state boundary in real-data modes.
path = 'lib/close-governance-engine.ts'
replace_once(path,
"import { getServiceDeployment } from './service-deployments';\n",
"import { getServiceDeployment } from './service-deployments';\nimport { appendProductionAuditEvent, assertProductionDateRangeOpen, commitPeriodLock, recordCloseApproval, reopenPeriodLock } from './production-ledger';\nimport { isRealDataMode } from './runtime-mode';\n")
replace_once(path,
"    'This is an internal FinClose lock only; it does not yet lock an external accounting provider.',\n",
"    'In PILOT/PRODUCTION, PostgreSQL is the authoritative FinClose close-evidence and period-lock boundary; external provider locks remain separate.',\n")
replace_once(path,
"  execution_boundary: 'SYNTHETIC_LAB_INTERNAL_CLOSE_ONLY'\n",
"  execution_boundary: 'LAB_OR_CONTROLLED_REAL_DATA_WITH_POSTGRES'\n")
replace_once(path,
"  const { close } = await requireClose(deploymentId, closeId);\n  if (String(close.close_status || '') === 'LOCKED') return { ...close, duplicate: true };\n",
"  const { deployment, close } = await requireClose(deploymentId, closeId);\n  if (String(close.close_status || '') === 'LOCKED') return { ...close, duplicate: true };\n")
# The first occurrence above is approveMonthlyClose. Insert authoritative approval immediately before RTDB update.
replace_once(path,
"  const db = realtimeDatabase();\n  const auditKey = db.ref('finclose_audit_events').push().key!;\n  await db.ref().update({\n    [`finclose_close_approvals/${closeId}/${approvalId}`]: approval,\n",
"  if (isRealDataMode()) {\n    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer approval identity is required in real-data mode', 403);\n    const organizationId = String(deployment.organization_id || '').trim();\n    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);\n    await recordCloseApproval({\n      organization_id: organizationId,\n      company_id: String(close.company_id),\n      close_id: closeId,\n      evidence_hash: evidenceHash,\n      actor_user_id: String(actor.user_id),\n      snapshot\n    });\n  }\n  const db = realtimeDatabase();\n  const auditKey = db.ref('finclose_audit_events').push().key!;\n  await db.ref().update({\n    [`finclose_close_approvals/${closeId}/${approvalId}`]: approval,\n")
replace_once(path,
"  if (start > end) throw httpError(`${context} period_start must not be after period_end`, 400);\n  const snap = await realtimeDatabase().ref(`finclose_period_locks_by_company/${companyId}`).once('value');\n",
"  if (start > end) throw httpError(`${context} period_start must not be after period_end`, 400);\n  if (isRealDataMode()) await assertProductionDateRangeOpen(companyId, start, end, context);\n  const snap = await realtimeDatabase().ref(`finclose_period_locks_by_company/${companyId}`).once('value');\n")
# lockMonthlyClose is now the next requireClose occurrence.
replace_once(path,
"export async function lockMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, note?: string) {\n  const identity = actorRecord(actor);\n  await refreshCloseGovernance(deploymentId, closeId);\n  const { close } = await requireClose(deploymentId, closeId);\n",
"export async function lockMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, note?: string) {\n  const identity = actorRecord(actor);\n  await refreshCloseGovernance(deploymentId, closeId);\n  const { deployment, close } = await requireClose(deploymentId, closeId);\n")
replace_once(path,
"  const lockId = `${close.company_id}__${close.period_end}__${currentHash.slice(0, 12)}`.replace(/[^A-Za-z0-9_-]/g, '_');\n  const now = Date.now();\n",
"  let lockId = `${close.company_id}__${close.period_end}__${currentHash.slice(0, 12)}`.replace(/[^A-Za-z0-9_-]/g, '_');\n  if (isRealDataMode()) {\n    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer lock identity is required in real-data mode', 403);\n    const organizationId = String(deployment.organization_id || '').trim();\n    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);\n    const authoritativeLockId = await commitPeriodLock({\n      organization_id: organizationId,\n      company_id: String(close.company_id),\n      close_id: closeId,\n      period_start: String(close.period_start),\n      period_end: String(close.period_end),\n      evidence_hash: currentHash,\n      actor_user_id: String(actor.user_id),\n      payload: snapshot\n    });\n    if (!authoritativeLockId) throw httpError('authoritative PostgreSQL period lock was not created', 503);\n    lockId = String(authoritativeLockId);\n  }\n  const now = Date.now();\n")
replace_once(path,
"export async function reopenMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, reason: string) {\n  const identity = actorRecord(actor);\n  const { close } = await requireClose(deploymentId, closeId);\n",
"export async function reopenMonthlyClose(deploymentId: string, closeId: string, actor: CloseActor, reason: string) {\n  const identity = actorRecord(actor);\n  const { deployment, close } = await requireClose(deploymentId, closeId);\n")
replace_once(path,
"  const now = Date.now();\n  const reopenCount = Number(lock.reopen_count || 0) + 1;\n",
"  if (isRealDataMode()) {\n    if (actor.kind !== 'customer' || !actor.user_id) throw httpError('authenticated customer reopen identity is required in real-data mode', 403);\n    const organizationId = String(deployment.organization_id || '').trim();\n    if (!organizationId) throw httpError('monthly close deployment is missing organization ownership', 409);\n    await reopenPeriodLock({\n      organization_id: organizationId,\n      company_id: String(close.company_id),\n      close_id: closeId,\n      actor_user_id: String(actor.user_id),\n      reason: reasonText\n    });\n  }\n  const now = Date.now();\n  const reopenCount = Number(lock.reopen_count || 0) + 1;\n")

# API: retain the existing customer UX but switch account operations to Firebase Auth in real-data modes,
# and mirror prepared bookkeeping journals into the authoritative PostgreSQL ledger.
path = 'app/api/[...path]/route.ts'
replace_once(path,
"import { authenticateRequest, createFirebaseSessionResponse, currentManagedUser, logoutManagedResponse, type RequestIdentity } from '../../../lib/managed-auth';\n",
"import { authenticateRequest, createFirebaseSessionResponse, currentManagedUser, loginManagedAccount, logoutManagedResponse, registerManagedAccount, type RequestIdentity } from '../../../lib/managed-auth';\n")
replace_once(path,
"import { ledgerHealth } from '../../../lib/production-ledger';\n",
"import { ledgerHealth, persistBookkeepingBatch } from '../../../lib/production-ledger';\n")
replace_once(path,
"    if (p.join('/') === 'account/register') {\n      if (isRealDataMode()) return NextResponse.json({ detail: 'use Firebase Authentication for PILOT/PRODUCTION accounts' }, { status: 409 });\n      const user = await registerLabAccount(await req.json());\n      return accountResponse(user);\n    }\n    if (p.join('/') === 'account/login') {\n      if (isRealDataMode()) return NextResponse.json({ detail: 'use Firebase Authentication for PILOT/PRODUCTION accounts' }, { status: 409 });\n      const user = await loginLabAccount(await req.json());\n      return accountResponse(user);\n    }\n",
"    if (p.join('/') === 'account/register') {\n      if (isRealDataMode()) return registerManagedAccount(await req.json());\n      const user = await registerLabAccount(await req.json());\n      return accountResponse(user);\n    }\n    if (p.join('/') === 'account/login') {\n      if (isRealDataMode()) return loginManagedAccount(await req.json());\n      const user = await loginLabAccount(await req.json());\n      return accountResponse(user);\n    }\n")
replace_once(path,
"    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'bookkeeping' && p[3] === 'batches') {\n      await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      return NextResponse.json(await prepareBookkeepingBatch(p[1], await req.json()));\n    }\n",
"    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'bookkeeping' && p[3] === 'batches') {\n      const scoped = await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      const batch = await prepareBookkeepingBatch(p[1], await req.json()) as Record<string, any>;\n      if (isRealDataMode() && scoped.auth.kind === 'customer') {\n        await persistBookkeepingBatch({\n          organization_id: String(scoped.deployment.organization_id),\n          company_id: String(scoped.deployment.company_id),\n          actor_user_id: scoped.auth.user.user_id,\n          batch\n        });\n      }\n      return NextResponse.json(batch);\n    }\n")
replace_once(path,
"    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'finance-cycles') {\n      await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      return NextResponse.json(await prepareFinanceCycle(p[1], await req.json()));\n    }\n",
"    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'finance-cycles') {\n      const scoped = await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      const cycle = await prepareFinanceCycle(p[1], await req.json()) as Record<string, any>;\n      if (isRealDataMode() && scoped.auth.kind === 'customer' && cycle.bookkeeping_batch_id) {\n        const batch = await getBookkeepingBatch(p[1], String(cycle.bookkeeping_batch_id)) as Record<string, any>;\n        await persistBookkeepingBatch({\n          organization_id: String(scoped.deployment.organization_id),\n          company_id: String(scoped.deployment.company_id),\n          actor_user_id: scoped.auth.user.user_id,\n          batch\n        });\n      }\n      return NextResponse.json(cycle);\n    }\n")

print('v0.33 production hardening patches applied')
