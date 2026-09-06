# FinClose v0.33 — Firebase-only production foundation

## Added

- Firebase Authentication real-data identity path.
- Organization and role-based tenant authorization.
- Cloud Firestore authoritative ledger/evidence layer.
- Firestore-backed payroll, bookkeeping, finance-cycle and close evidence.
- Transactional company period-lock state and reopen history.
- Private tenant/company Firebase Storage paths.
- Financial upload size/type/signature validation.
- Firestore deny-by-default client rules.
- Explicit LAB / PILOT / PRODUCTION runtime modes.

## Removed

- Proposed Supabase/PostgreSQL production ledger.
- PostgreSQL dependencies, SQL migrations and connection-string configuration.

## Not activated yet

The live deployment remains LAB until Firebase Authentication, Firestore, security rules, upload controls and independent pilot QA are verified in the actual Firebase project.
