# FinClose Cloud Firestore Ledger Model

## Purpose

Cloud Firestore is the authoritative financial-state store for `PILOT` and `PRODUCTION`. Realtime Database remains the workflow/control plane. If a financial-state conflict exists between Realtime Database and Firestore, Firestore wins for authoritative real-data evidence and period-lock state.

## Collections

- `finclose_prod_meta` — ledger schema metadata and health marker.
- `finclose_prod_organizations` — production organization identity mirror.
- `finclose_prod_companies` — production company identity and ownership mirror.
- `finclose_prod_payroll_runs` — authoritative prepared payroll-run evidence.
- `finclose_prod_bookkeeping_batches` — authoritative bookkeeping-batch summary.
- `finclose_prod_journal_entries` — immutable prepared journal evidence with journal lines embedded for the controlled pilot.
- `finclose_prod_finance_cycles` — finance-cycle lineage.
- `finclose_prod_monthly_closes` — monthly-close control snapshots.
- `finclose_prod_close_approvals` — current approval for a monthly close.
- `finclose_prod_close_approval_events` — immutable approval history.
- `finclose_prod_close_snapshots` — evidence-bound close snapshots.
- `finclose_prod_company_lock_state` — one transactionally updated active-lock document per company.
- `finclose_prod_period_locks` — authoritative period-lock records.
- `finclose_prod_close_lock_index` — close-to-lock lookup.
- `finclose_prod_period_lock_events` — immutable lock/reopen event history.
- `finclose_prod_audit_events` — deterministic append-only application audit events.

## Transaction rules

1. Financial writes use deterministic document IDs or idempotency keys.
2. The company active-lock-state document is read in the same Firestore transaction that records new financial evidence or a new period lock.
3. A close lock requires an authoritative close approval with the same evidence hash.
4. A reopen removes the lock from active-lock state but retains the lock record and appends a reopen event.
5. Journal documents are size/line capped in the controlled pilot to stay safely below Firestore document and transaction limits.
6. Direct browser reads/writes are denied. The Vercel server uses Firebase Admin after server-side tenant/RBAC checks.
