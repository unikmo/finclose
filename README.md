# FinClose

Canonical repository for the FinClose financial-operations product and Lab.

## Canonical architecture — v0.27 test build

- **Source:** `unikmo/finclose`
- **Hosting/runtime:** Vercel
- **Test database:** Firebase Realtime Database
- **File storage:** Firebase Cloud Storage
- **Frontend/API:** Next.js
- **Supabase:** not used

## Product deployment rule

FinClose deploys and bills only the service selected on the homepage. Company initialization is company/master-data setup; it does not automatically activate or bill unrelated agents.

## Customer onboarding order

The customer flow is account-first:

1. **Sign in or create an account.** The shared technical Lab token is never requested in the customer journey.
2. **Company only if required.** Payroll, bookkeeping and combined service link an already initialized FinClose company or initialize one with the existing country form. Balance-books skips company initialization.
3. **Prior information.** Historical accounting/payroll records give FinClose context about balances, open items and prior decisions.
4. **Current system connection.** Only after the earlier gates are complete are Xero, QuickBooks, DATEV, SmartAccounts or secure upload shown.

An existing initialized company can be reused for a new service deployment. It must not be initialized again. The previously initialized MDA company therefore remains reusable in the synthetic Lab.

## Account layer

v0.27 removes `FINCLOSE_LAB_TOKEN` from the customer UI. The token remains an internal server/test secret and is still available to the legacy `/lab` technical workflow.

For the current synthetic Lab, account registration/login uses a temporary server-side authentication bridge:

- email + password account
- password derived with Node `scrypt` and a per-user random salt
- account record stored in Firebase Realtime Database
- signed HTTP-only session cookie
- server-side session signing uses the existing private Lab secret

This is **not** the final production identity architecture. Managed authentication and tenant/company authorization remain mandatory before real customer use. Firebase Authentication is the preferred current candidate, but FinClose has not yet verified/configured it for production.

## Historical context

Historical uploads are stored separately from current/operational source files under the service deployment. Examples include general ledgers, trial balances, bank reconciliations/statements, open AR/AP, payroll registers, YTD payroll and unresolved-item lists.

- Balance-books requires historical context.
- A company initialized as `NEW` may explicitly mark history as not applicable.
- Historical files use SHA-256 duplicate detection.

## Connector layer

The connector layer remains shared by the specialist agents and is only shown after account/company/history gates are complete.

Current connector catalog:

- Xero — OAuth 2.0 adapter slot
- QuickBooks Online — OAuth 2.0 accounting adapter slot
- DATEV — Germany partner/API adapter slot
- SmartAccounts — Estonia API-key adapter slot
- Secure file upload — functional synthetic-Lab connector

External provider authorization is **not yet production-enabled**. Provider credentials, secure OAuth callback/token-vault handling, tenant authorization and provider-specific QA remain mandatory before real customer data may flow through Xero, QuickBooks, DATEV or SmartAccounts.

## Security boundary

The browser never talks directly to Firebase Realtime Database or Storage. Vercel server routes use Firebase Admin credentials. Firebase client rules deny direct reads/writes.

Customer-facing service routes authenticate with an HTTP-only session cookie. The technical `/lab` workflow can still use `FINCLOSE_LAB_TOKEN` for synthetic backend testing. Use synthetic/test financial data only until managed authentication, tenant authorization, production database architecture and full security QA are complete.

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_STORAGE_BUCKET`
- `FINCLOSE_LAB_TOKEN`

Optional connector provider variables are documented in `.env.example`.

## v0.27 acceptance path

1. `/api/health?deep=1` reports Realtime Database and Storage reachable.
2. Open a homepage service route and confirm **Create account / Sign in** is the only customer action exposed first and no Lab token field exists.
3. Create a synthetic Lab account, sign out, then sign back in.
4. For balance-books, confirm company initialization is skipped and prior-information upload is next.
5. For payroll/bookkeeping/combined, choose a company country, then link an existing initialized company (including MDA when available for that country) or initialize a new one using the existing country workbook.
6. Confirm historical upload is the next visible stage and accepts multiple synthetic files.
7. Confirm connectors/current source cannot be used until the history gate is complete.
8. Confirm historical files and current source files use separate Firebase Storage paths.

## Production gates

The v0.27 account bridge is a Lab mechanism, not a production authentication certification. Before real customer data, FinClose still requires managed identity, tenant/company authorization, password-recovery and email-verification flows, abuse/rate-limit controls, secure upload hardening, connector authorization QA, independent security QA and live release verification.

Firebase Realtime Database is being used for the current deployment test because it is already active and provides durable test persistence. It is **not approved as the final ledger database**. Before real accounting journals/ledger logic are introduced, FinClose must run a relational-storage decision gate. PostgreSQL remains the preferred production candidate for ledger-grade relational data.
