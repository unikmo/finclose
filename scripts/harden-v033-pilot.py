from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Clean unused close-governance import.
replace_once('lib/close-governance-engine.ts',
"import { appendProductionAuditEvent, assertProductionDateRangeOpen, commitPeriodLock, recordCloseApproval, reopenPeriodLock } from './production-ledger';",
"import { assertProductionDateRangeOpen, commitPeriodLock, recordCloseApproval, reopenPeriodLock } from './production-ledger';")

# Make authoritative reopen idempotent after a PostgreSQL-success / RTDB-failure retry.
replace_once('lib/production-ledger.ts',
"    const result = await client.query(\n      `update finclose_period_locks\n       set status = 'REOPENED', reopened_by_user_id = $1, reopen_reason = $2, reopened_at = now(), updated_at = now()\n       where organization_id = $3 and company_id = $4 and monthly_close_id = $5 and status = 'LOCKED'\n       returning period_lock_id`,\n      [input.actor_user_id, input.reason, input.organization_id, input.company_id, input.close_id]\n    );\n    if (!result.rowCount) throw httpError('authoritative PostgreSQL period lock was not found', 409);",
"    const current = await client.query(\n      `select period_lock_id, status from finclose_period_locks\n       where organization_id = $1 and company_id = $2 and monthly_close_id = $3\n       order by created_at desc limit 1`,\n      [input.organization_id, input.company_id, input.close_id]\n    );\n    if (!current.rowCount) throw httpError('authoritative PostgreSQL period lock was not found', 409);\n    if (String(current.rows[0].status) === 'REOPENED') return;\n    const result = await client.query(\n      `update finclose_period_locks\n       set status = 'REOPENED', reopened_by_user_id = $1, reopen_reason = $2, reopened_at = now(), updated_at = now()\n       where organization_id = $3 and company_id = $4 and monthly_close_id = $5 and status = 'LOCKED'\n       returning period_lock_id`,\n      [input.actor_user_id, input.reason, input.organization_id, input.company_id, input.close_id]\n    );\n    if (!result.rowCount) throw httpError('authoritative PostgreSQL period lock could not be reopened', 409);")

# Real-data deployment uploads may not be attached to a company explicitly marked synthetic.
replace_once('lib/service-deployments.ts',
"  const validation = validateFinancialUpload(filename, buffer, 'current_source');\n  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');",
"  if (isRealDataMode() && deployment.company_id) {\n    const companySnap = await realtimeDatabase().ref(`finclose_companies/${deployment.company_id}`).once('value');\n    if (!companySnap.exists()) {\n      const error = new Error('linked company was not found');\n      (error as Error & { status?: number }).status = 404;\n      throw error;\n    }\n    const company = companySnap.val() as Record<string, any>;\n    if (company.data_is_synthetic === true) {\n      const error = new Error('real financial data cannot be attached to a company explicitly marked synthetic');\n      (error as Error & { status?: number }).status = 409;\n      throw error;\n    }\n  }\n  const validation = validateFinancialUpload(filename, buffer, 'current_source');\n  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');")

replace_once('lib/onboarding-history.ts',
"  const validation = validateFinancialUpload(filename, buffer, 'historical_context');\n\n  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');",
"  if (isRealDataMode() && deployment.company_id) {\n    const companySnap = await realtimeDatabase().ref(`finclose_companies/${deployment.company_id}`).once('value');\n    if (!companySnap.exists()) throw httpError('initialized company not found', 404);\n    const company = companySnap.val() as Record<string, any>;\n    if (company.data_is_synthetic === true) throw httpError('real financial history cannot be attached to a company explicitly marked synthetic', 409);\n  }\n  const validation = validateFinancialUpload(filename, buffer, 'historical_context');\n\n  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');")

# Strengthen PostgreSQL schema: RLS denies accidental browser/PostgREST access and DB-level exclusion prevents overlapping locks.
p = Path('db/migrations/001_production_foundation.sql')
text = p.read_text()
needle = "create index if not exists finclose_period_locks_company_idx on finclose_period_locks(company_id, status, period_start, period_end);\n"
replacement = needle + "\ncreate extension if not exists btree_gist;\ndo $$\nbegin\n  if not exists (select 1 from pg_constraint where conname = 'finclose_no_overlapping_locked_periods') then\n    alter table finclose_period_locks\n      add constraint finclose_no_overlapping_locked_periods\n      exclude using gist (company_id with =, daterange(period_start, period_end, '[]') with &&)\n      where (status = 'LOCKED');\n  end if;\nend $$;\n"
if needle not in text:
    raise SystemExit('period lock index marker not found')
text = text.replace(needle, replacement, 1)
needle2 = "insert into finclose_schema_migrations(version, name)\n"
rls = "alter table finclose_organizations enable row level security;\nalter table finclose_companies enable row level security;\nalter table finclose_accounting_periods enable row level security;\nalter table finclose_journal_entries enable row level security;\nalter table finclose_journal_lines enable row level security;\nalter table finclose_close_snapshots enable row level security;\nalter table finclose_period_locks enable row level security;\nalter table finclose_audit_events enable row level security;\n\n"
if needle2 not in text:
    raise SystemExit('migration insert marker not found')
text = text.replace(needle2, rls + needle2, 1)
p.write_text(text)

print('v0.33 pilot hardening applied')
