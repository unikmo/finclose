import crypto from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { isRealDataMode } from './runtime-mode';

const REQUIRED_SCHEMA_VERSION = 1;
let pool: Pool | null = null;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export function productionLedgerConfigured() {
  return Boolean(process.env.FINCLOSE_DATABASE_URL);
}

function databasePool() {
  const connectionString = String(process.env.FINCLOSE_DATABASE_URL || '').trim();
  if (!connectionString) throw httpError('FINCLOSE_DATABASE_URL is not configured', 503);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 6,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.FINCLOSE_DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function ledgerHealth() {
  if (!productionLedgerConfigured()) return { configured: false, reachable: false, schema_version: null, ready: false };
  try {
    const db = databasePool();
    const ping = await db.query('select 1 as ok');
    const migration = await db.query('select max(version)::int as version from finclose_schema_migrations');
    const version = Number(migration.rows[0]?.version || 0);
    return { configured: true, reachable: ping.rows[0]?.ok === 1, schema_version: version, ready: version >= REQUIRED_SCHEMA_VERSION };
  } catch (error) {
    return { configured: true, reachable: false, schema_version: null, ready: false, error: (error as Error).message };
  }
}

export async function assertProductionLedgerReady() {
  if (!isRealDataMode()) return;
  const health = await ledgerHealth();
  if (!health.ready) throw httpError(`PostgreSQL production ledger is not ready${health.error ? `: ${health.error}` : ''}`, 503);
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await databasePool().connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function registerProductionOrganization(input: {
  organization_id: string;
  name: string;
  actor_user_id: string;
}) {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  await databasePool().query(
    `insert into finclose_organizations (organization_id, name, created_by_user_id)
     values ($1, $2, $3)
     on conflict (organization_id) do update set name = excluded.name, updated_at = now()`,
    [input.organization_id, input.name, input.actor_user_id]
  );
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
  await databasePool().query(
    `insert into finclose_companies (organization_id, company_id, legal_name, country_code, base_currency, created_by_user_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (company_id) do update set
       legal_name = excluded.legal_name,
       country_code = excluded.country_code,
       base_currency = excluded.base_currency,
       updated_at = now()
     where finclose_companies.organization_id = excluded.organization_id`,
    [input.organization_id, input.company_id, input.legal_name, input.country_code, input.base_currency, input.actor_user_id]
  );
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
  const eventId = crypto.randomUUID();
  const payload = input.payload === undefined ? null : JSON.stringify(input.payload);
  const key = input.idempotency_key || `${input.action}:${input.entity_type}:${input.entity_id}:${eventId}`;
  const result = await databasePool().query(
    `insert into finclose_audit_events
       (event_id, organization_id, company_id, actor_user_id, action, entity_type, entity_id, payload, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     on conflict (idempotency_key) do nothing
     returning event_id`,
    [eventId, input.organization_id, input.company_id || null, input.actor_user_id || null, input.action, input.entity_type, input.entity_id, payload, key]
  );
  return result.rows[0]?.event_id || null;
}

export async function assertProductionDateRangeOpen(companyId: string, periodStart: string, periodEnd: string, context = 'transaction') {
  if (!isRealDataMode()) return;
  await assertProductionLedgerReady();
  const result = await databasePool().query(
    `select period_start, period_end from finclose_period_locks
     where company_id = $1 and status = 'LOCKED'
       and daterange(period_start, period_end, '[]') && daterange($2::date, $3::date, '[]')
     order by period_start limit 1`,
    [companyId, periodStart, periodEnd]
  );
  if (result.rowCount) {
    const row = result.rows[0];
    throw httpError(`${context} overlaps authoritative locked period ${String(row.period_start).slice(0, 10)} to ${String(row.period_end).slice(0, 10)}`, 409);
  }
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
  return transaction(async client => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${input.company_id}:${input.period_start}:${input.period_end}`]);
    const overlap = await client.query(
      `select period_lock_id from finclose_period_locks
       where company_id = $1 and status = 'LOCKED'
         and daterange(period_start, period_end, '[]') && daterange($2::date, $3::date, '[]')
       limit 1`,
      [input.company_id, input.period_start, input.period_end]
    );
    if (overlap.rowCount) throw httpError('PostgreSQL ledger reports an overlapping locked period', 409);
    const lockId = crypto.randomUUID();
    await client.query(
      `insert into finclose_close_snapshots
       (close_snapshot_id, organization_id, company_id, monthly_close_id, evidence_hash, snapshot, approved_by_user_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)
       on conflict (monthly_close_id, evidence_hash) do nothing`,
      [crypto.randomUUID(), input.organization_id, input.company_id, input.close_id, input.evidence_hash, JSON.stringify(input.payload), input.actor_user_id]
    );
    await client.query(
      `insert into finclose_period_locks
       (period_lock_id, organization_id, company_id, monthly_close_id, period_start, period_end, evidence_hash, status, locked_by_user_id)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, 'LOCKED', $8)`,
      [lockId, input.organization_id, input.company_id, input.close_id, input.period_start, input.period_end, input.evidence_hash, input.actor_user_id]
    );
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
  await transaction(async client => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${input.company_id}:${input.close_id}`]);
    const result = await client.query(
      `update finclose_period_locks
       set status = 'REOPENED', reopened_by_user_id = $1, reopen_reason = $2, reopened_at = now(), updated_at = now()
       where organization_id = $3 and company_id = $4 and monthly_close_id = $5 and status = 'LOCKED'
       returning period_lock_id`,
      [input.actor_user_id, input.reason, input.organization_id, input.company_id, input.close_id]
    );
    if (!result.rowCount) throw httpError('authoritative PostgreSQL period lock was not found', 409);
  });
}
