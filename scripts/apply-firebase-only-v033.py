from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# Close governance language: Firestore, not PostgreSQL.
replace_once(
    'lib/close-governance-engine.ts',
    "    'In PILOT/PRODUCTION, PostgreSQL is the authoritative FinClose close-evidence and period-lock boundary; external provider locks remain separate.',\n",
    "    'In PILOT/PRODUCTION, Cloud Firestore is the authoritative FinClose close-evidence and period-lock boundary; external provider locks remain separate.',\n",
)
replace_once(
    'lib/close-governance-engine.ts',
    "  execution_boundary: 'LAB_OR_CONTROLLED_REAL_DATA_WITH_POSTGRES'\n",
    "  execution_boundary: 'LAB_OR_CONTROLLED_REAL_DATA_WITH_FIRESTORE'\n",
)

# API health and authoritative persistence.
replace_once(
    "app/api/[...path]/route.ts",
    "import { ledgerHealth, persistBookkeepingBatch } from '../../../lib/production-ledger';\n",
    "import { assertProductionLedgerReady, ledgerHealth, persistBookkeepingBatch, persistFinanceCycle, persistPayrollRun } from '../../../lib/production-ledger';\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "      const reachable = { database: false, storage: false, postgres: false };\n",
    "      const reachable = { database: false, storage: false, firestore: false };\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "      const postgres = await ledgerHealth();\n      reachable.postgres = postgres.ready;\n      if (readiness.real_data_mode && !postgres.ready) errors.push(`postgres-ledger: ${postgres.error || 'schema not ready'}`);\n",
    "      const firestore = await ledgerHealth();\n      reachable.firestore = firestore.ready;\n      if (readiness.real_data_mode && !firestore.ready) errors.push(`firestore-ledger: ${firestore.error || 'ledger not ready'}`);\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "      const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || postgres.ready);\n",
    "      const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || firestore.ready);\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "        authoritative_ledger: 'postgresql',\n",
    "        authoritative_ledger: 'firebase-firestore',\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "        postgres,\n",
    "        firestore,\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "    const auth = await authenticateRequest(req);\n    const organization = auth.kind === 'customer' && isRealDataMode() ? await ensurePersonalOrganization(auth.user) : null;\n\n",
    "    const auth = await authenticateRequest(req);\n    const organization = auth.kind === 'customer' && isRealDataMode() ? await ensurePersonalOrganization(auth.user) : null;\n    if (isRealDataMode()) await assertProductionLedgerReady();\n\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'payroll' && p[3] === 'runs') {\n      await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      return NextResponse.json(await preparePayrollRun(p[1], await req.json()));\n    }\n",
    "    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'payroll' && p[3] === 'runs') {\n      const scoped = await authorizedDeployment(req, p[1], 'ACCOUNTANT');\n      const run = await preparePayrollRun(p[1], await req.json()) as Record<string, any>;\n      if (isRealDataMode() && scoped.auth.kind === 'customer') {\n        await persistPayrollRun({\n          organization_id: String(scoped.deployment.organization_id),\n          company_id: String(scoped.deployment.company_id),\n          actor_user_id: scoped.auth.user.user_id,\n          run\n        });\n      }\n      return NextResponse.json(run);\n    }\n",
)
replace_once(
    "app/api/[...path]/route.ts",
    "      if (isRealDataMode() && scoped.auth.kind === 'customer' && cycle.bookkeeping_batch_id) {\n        const batch = await getBookkeepingBatch(p[1], String(cycle.bookkeeping_batch_id)) as Record<string, any>;\n        await persistBookkeepingBatch({\n          organization_id: String(scoped.deployment.organization_id),\n          company_id: String(scoped.deployment.company_id),\n          actor_user_id: scoped.auth.user.user_id,\n          batch\n        });\n      }\n      return NextResponse.json(cycle);\n",
    "      if (isRealDataMode() && scoped.auth.kind === 'customer') {\n        if (cycle.bookkeeping_batch_id) {\n          const batch = await getBookkeepingBatch(p[1], String(cycle.bookkeeping_batch_id)) as Record<string, any>;\n          await persistBookkeepingBatch({\n            organization_id: String(scoped.deployment.organization_id),\n            company_id: String(scoped.deployment.company_id),\n            actor_user_id: scoped.auth.user.user_id,\n            batch\n          });\n        }\n        await persistFinanceCycle({\n          organization_id: String(scoped.deployment.organization_id),\n          company_id: String(scoped.deployment.company_id),\n          actor_user_id: scoped.auth.user.user_id,\n          cycle\n        });\n      }\n      return NextResponse.json(cycle);\n",
)

# Canonical truth registry.
replace_once('CANONICAL_TRUTH.md', 'Version: 14\n', 'Version: 15\n')
replace_once(
    'CANONICAL_TRUTH.md',
    '| Production authentication | Proper managed customer authentication/tenant authorization remains required before real customer use; Firebase Auth is the preferred current candidate but is not yet verified/configured for FinClose | Security architecture gate | OPEN | — |',
    '| Production authentication | v0.33 implements Firebase Authentication with server-side HTTP-only session cookies, token revocation checks and organization/role authorization for PILOT/PRODUCTION. Actual Firebase Email/Password enablement and live release verification remain required before the mode is switched from LAB | User architecture decision + implementation | ACTIVE / CONFIGURATION REQUIRED | Preferred-candidate-only Firebase Auth |',
)
replace_once(
    'CANONICAL_TRUTH.md',
    '| Test database | Firebase Realtime Database | User-provided active Firebase database + implementation | ACTIVE | Firebase Cloud Firestore test candidate |',
    '| Workflow/control database | Firebase Realtime Database remains the workflow/orchestration control plane while real-data ledger state is authoritative in Cloud Firestore | User architecture decision + implementation | ACTIVE | RTDB as candidate final ledger |',
)
replace_once(
    'CANONICAL_TRUTH.md',
    '| Test data policy | Synthetic/test data only | FinClose safety boundary | ACTIVE | — |',
    '| Data-mode policy | LAB = synthetic/test data only; PILOT = controlled real customer/company data only after Firebase Auth, Firestore, tenant, upload and QA gates pass; PRODUCTION remains a separate release gate | User architecture decision + safety boundary | ACTIVE | Global synthetic-only policy |',
)
replace_once(
    'CANONICAL_TRUTH.md',
    '| Final ledger database | NOT YET LOCKED; relational gate required | Architecture gate required | OPEN | — |',
    '| Final ledger database | Cloud Firestore in the existing Firebase project is the authoritative FinClose ledger for PILOT/PRODUCTION. Firestore transactions, deterministic idempotency, immutable evidence records and transactional company-period lock state replace the abandoned PostgreSQL/Supabase proposal | User decision + v0.33 implementation | ACTIVE / NOT YET LIVE | Relational/PostgreSQL gate |',
)
replace_once(
    'CANONICAL_TRUTH.md',
    '| Production readiness | NOT READY | QA/release gate | ACTIVE | — |',
    '| Production readiness | NOT READY. v0.33 is a Firebase-only controlled-real-data foundation branch; PILOT cannot be declared live until Firestore/Auth/rules are enabled and independently QA-tested in the actual Firebase project | QA/release gate | ACTIVE | — |',
)
# Insert Firebase-only rows immediately after Firebase project.
replace_once(
    'CANONICAL_TRUTH.md',
    '| Firebase project | `theantibalcony` | User-provided Firebase project | ACTIVE | — |\n',
    '| Firebase project | `theantibalcony` | User-provided Firebase project | ACTIVE | — |\n| Firebase-only production architecture | Vercel application/API + Firebase Authentication + Firebase Realtime Database control plane + Cloud Firestore authoritative ledger + Firebase Cloud Storage; Supabase/PostgreSQL is not part of FinClose | Explicit user decision | ACTIVE | Proposed Supabase-hosted PostgreSQL ledger |\n| Firestore authoritative ledger | v0.33 stores production organizations/companies, payroll evidence, bookkeeping batches/journals, finance cycles, monthly-close snapshots, approvals, period locks and append-only audit events in Cloud Firestore. Direct browser access is denied; server writes use Firebase Admin | User decision + implementation | ACTIVE / NOT YET LIVE | PostgreSQL production-ledger implementation |\n',
)

print('Firebase-only v0.33 patch applied')
