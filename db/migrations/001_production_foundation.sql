begin;

create table if not exists finclose_schema_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

create table if not exists finclose_organizations (
  organization_id text primary key,
  name text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finclose_companies (
  company_id text primary key,
  organization_id text not null references finclose_organizations(organization_id),
  legal_name text not null,
  country_code text not null,
  base_currency text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finclose_companies_org_idx on finclose_companies(organization_id);

create table if not exists finclose_accounting_periods (
  accounting_period_id uuid primary key,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text not null references finclose_companies(company_id),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('OPEN','CLOSE_IN_PROGRESS','APPROVED_PENDING_LOCK','LOCKED','REOPENED')),
  close_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, period_start, period_end, close_version),
  check (period_start <= period_end)
);

create table if not exists finclose_journal_entries (
  journal_entry_id uuid primary key,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text not null references finclose_companies(company_id),
  accounting_period_id uuid references finclose_accounting_periods(accounting_period_id),
  external_id text,
  journal_date date not null,
  description text not null,
  currency text not null,
  source_type text not null,
  source_id text,
  input_fingerprint text not null,
  status text not null check (status in ('PREPARED','APPROVED','POSTED','REVERSED')),
  created_by_user_id text,
  created_at timestamptz not null default now(),
  unique(company_id, input_fingerprint)
);

create table if not exists finclose_journal_lines (
  journal_line_id uuid primary key,
  journal_entry_id uuid not null references finclose_journal_entries(journal_entry_id) on delete restrict,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text not null references finclose_companies(company_id),
  line_no integer not null,
  account_code text not null,
  account_name text,
  debit numeric(20,2) not null default 0,
  credit numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(journal_entry_id, line_no),
  check (debit >= 0 and credit >= 0),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists finclose_journal_lines_company_idx on finclose_journal_lines(company_id, account_code);

create table if not exists finclose_close_snapshots (
  close_snapshot_id uuid primary key,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text not null references finclose_companies(company_id),
  monthly_close_id text not null,
  evidence_hash text not null,
  snapshot jsonb not null,
  approved_by_user_id text not null,
  created_at timestamptz not null default now(),
  unique(monthly_close_id, evidence_hash)
);

create table if not exists finclose_period_locks (
  period_lock_id uuid primary key,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text not null references finclose_companies(company_id),
  monthly_close_id text not null,
  period_start date not null,
  period_end date not null,
  evidence_hash text not null,
  status text not null check (status in ('LOCKED','REOPENED')),
  locked_by_user_id text not null,
  locked_at timestamptz not null default now(),
  reopened_by_user_id text,
  reopen_reason text,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);
create index if not exists finclose_period_locks_company_idx on finclose_period_locks(company_id, status, period_start, period_end);

create extension if not exists btree_gist;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finclose_no_overlapping_locked_periods') then
    alter table finclose_period_locks
      add constraint finclose_no_overlapping_locked_periods
      exclude using gist (company_id with =, daterange(period_start, period_end, '[]') with &&)
      where (status = 'LOCKED');
  end if;
end $$;

create table if not exists finclose_audit_events (
  event_id uuid primary key,
  organization_id text not null references finclose_organizations(organization_id),
  company_id text,
  actor_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists finclose_audit_events_org_idx on finclose_audit_events(organization_id, created_at);
create index if not exists finclose_audit_events_company_idx on finclose_audit_events(company_id, created_at);

create or replace function finclose_block_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists finclose_journal_entries_immutable on finclose_journal_entries;
create trigger finclose_journal_entries_immutable
before update or delete on finclose_journal_entries
for each row execute function finclose_block_mutation();

drop trigger if exists finclose_journal_lines_immutable on finclose_journal_lines;
create trigger finclose_journal_lines_immutable
before update or delete on finclose_journal_lines
for each row execute function finclose_block_mutation();

drop trigger if exists finclose_close_snapshots_immutable on finclose_close_snapshots;
create trigger finclose_close_snapshots_immutable
before update or delete on finclose_close_snapshots
for each row execute function finclose_block_mutation();

drop trigger if exists finclose_audit_events_immutable on finclose_audit_events;
create trigger finclose_audit_events_immutable
before update or delete on finclose_audit_events
for each row execute function finclose_block_mutation();

create or replace function finclose_reject_locked_period_journal() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from finclose_period_locks l
    where l.company_id = new.company_id
      and l.status = 'LOCKED'
      and new.journal_date between l.period_start and l.period_end
  ) then
    raise exception 'journal date falls within locked period';
  end if;
  return new;
end;
$$;

drop trigger if exists finclose_journal_locked_period_guard on finclose_journal_entries;
create trigger finclose_journal_locked_period_guard
before insert on finclose_journal_entries
for each row execute function finclose_reject_locked_period_journal();

alter table finclose_organizations enable row level security;
alter table finclose_companies enable row level security;
alter table finclose_accounting_periods enable row level security;
alter table finclose_journal_entries enable row level security;
alter table finclose_journal_lines enable row level security;
alter table finclose_close_snapshots enable row level security;
alter table finclose_period_locks enable row level security;
alter table finclose_audit_events enable row level security;

insert into finclose_schema_migrations(version, name)
values (1, 'production_foundation')
on conflict (version) do nothing;

commit;
