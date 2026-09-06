# FinClose

Canonical repository for the FinClose financial-operations product.

## Canonical architecture — v0.33 production foundation

- **Source:** `unikmo/finclose`
- **Application/API runtime:** Vercel + Next.js
- **Customer identity:** Firebase Authentication in `PILOT` / `PRODUCTION`
- **Workflow/control plane:** Firebase Realtime Database
- **Authoritative accounting ledger:** Cloud Firestore
- **Financial documents:** Firebase Cloud Storage
- **Firebase project:** `theantibalcony`
- **Supabase/PostgreSQL:** not used

Cloud Firestore is the authoritative financial-state boundary for real-data modes. Realtime Database remains the workflow/orchestration control plane while existing engines are progressively migrated. Direct browser access to Realtime Database, Firestore and Storage is denied; Vercel server routes use the Firebase Admin SDK.

## Runtime modes

FinClose has three explicit modes:

- `LAB` — synthetic/test financial data and the legacy internal test bridge.
- `PILOT` — controlled real customer/company data with Firebase Authentication, tenant isolation, Firestore ledger controls and human approval.
- `PRODUCTION` — unrestricted production only after security, connector, compliance and release gates pass.

`FINCLOSE_RUNTIME_MODE` controls the mode. Moving from `LAB` to `PILOT` is a release decision, not a UI rename.

## Customer onboarding

The customer flow is account-first:

1. **Sign in or create an account.** No technical Lab token is requested.
2. **Company only if required.** Existing initialized companies are reused rather than re-initialized.
3. **Prior information.** Historical accounting/payroll information is ingested separately from current operational data.
4. **Current system connection.** Xero, QuickBooks, DATEV, SmartAccounts or secure upload is shown only after earlier gates pass.

Balance-books skips company initialization. Payroll, bookkeeping and combined service require a company link or initialization.

## Managed identity and tenancy

In `PILOT` / `PRODUCTION`:

- Firebase Authentication provides the user identity.
- FinClose exchanges Firebase credentials for secure HTTP-only server session cookies.
- Organizations and memberships use `OWNER`, `ADMIN`, `ACCOUNTANT`, `APPROVER` and `VIEWER` roles.
- Service deployments and companies are organization-owned.
- Company lists and financial actions are tenant-scoped server-side.
- Close approval requires `APPROVER`; reopening requires `ADMIN`.

The legacy scrypt Lab account bridge and `FINCLOSE_LAB_TOKEN` remain restricted to `LAB`.

## Authoritative Firestore ledger

The v0.33 real-data ledger uses Cloud Firestore collections for:

- production organizations and companies;
- payroll-run evidence;
- bookkeeping batches and journal entries;
- finance-cycle and monthly-close snapshots;
- close approvals and approval history;
- company period-lock state;
- period-lock/reopen events;
- append-only production audit events.

Firestore transactions enforce deterministic idempotency and concurrent close/lock controls. A per-company lock-state document is updated transactionally with the authoritative period-lock record so concurrent operations cannot create overlapping active locks.

Prepared journal entries are stored with SHA-256 immutable fingerprints. Controlled-pilot limits prevent oversized Firestore journal documents; larger posting architecture remains a later scale gate.

## Layer A close governance

The current close path is:

**Payroll → bookkeeping → bank reconciliation → source completeness → balance-sheet reconciliation → approval → period lock**

For real-data modes, approval evidence and period locking are recorded in Cloud Firestore before the Realtime Database workflow mirror is treated as complete. Reopening preserves prior evidence and creates append-only events.

External accounting-provider locks, filings and payments remain separate execution layers.

## Financial source documents

Firebase Cloud Storage stores historical and current source files under tenant/company-specific private paths. FinClose currently enforces:

- SHA-256 fingerprints;
- filename sanitization;
- 25 MB file limit;
- XLSX, CSV, PDF, PNG and JPEG allowlist;
- magic-byte/content-signature checks;
- macro-enabled/executable formats rejected by the allowlist;
- direct client Storage access denied.

A dedicated malware-scanning/quarantine workflow remains a release gate before unrestricted production upload volume.

## Connector layer

Connector slots currently exist for:

- Xero
- QuickBooks Online
- DATEV
- SmartAccounts
- Secure file upload

Provider OAuth/API execution remains disabled until provider credentials, token-vault handling, least-privilege scopes and provider-specific QA are complete.

## Required Vercel/Firebase configuration

Core server configuration:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_WEB_PROJECT_ID`
- `FIREBASE_WEB_APP_ID` where applicable
- `FINCLOSE_RUNTIME_MODE`
- `FINCLOSE_LAB_TOKEN` only for `LAB`

No Supabase or PostgreSQL connection string is part of FinClose.

## Real-data release gate

The v0.33 source establishes the Firebase-only production foundation, but `PILOT` must not be declared live until the actual Firebase project has been verified for:

1. Firebase Email/Password Authentication enabled and tested;
2. Cloud Firestore database enabled and reachable from the Vercel service account;
3. Firestore and Storage deny-by-default rules deployed;
4. tenant-isolation tests passing;
5. close-approval/lock concurrency tests passing against Firestore;
6. upload quarantine/malware handling appropriate for the pilot risk level;
7. independent security and accounting-control QA;
8. live post-release verification.

Production readiness remains a separate gate from successful deployment.
