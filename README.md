# FinClose

Canonical repository for the FinClose financial-operations product and Lab.

## Canonical architecture — v0.26 test build

- **Source:** `unikmo/finclose`
- **Hosting/runtime:** Vercel
- **Test database:** Firebase Realtime Database
- **File storage:** Firebase Cloud Storage
- **Frontend/API:** Next.js
- **Supabase:** not used

## Product deployment rule

FinClose deploys and bills only the service selected on the homepage. Company initialization is company/master-data setup; it does not automatically activate or bill unrelated agents.

## Onboarding order

Every customer-facing service route now follows a progressive sequence:

1. **Registration / initialization first** — no connector grid or later workflow is shown yet.
2. **Prior information second** — upload former accounting/payroll records so FinClose understands the starting position.
3. **Current system connection third** — only after setup/history does FinClose offer the service-appropriate connector.

### Service-specific first step

| Customer choice | Registration / initialization |
|---|---|
| Help me balance my books | Registration only. No company initialization. |
| Help me do payroll | Registration + link an existing initialized company or complete a FinClose initialization form. |
| Do my bookkeeping | Registration + link an existing initialized company or complete a FinClose initialization form. |
| Bookkeeping & Payroll | Registration + link an existing initialized company or complete a FinClose initialization form. |

An existing initialized company can be reused for a new service deployment. It must not be initialized again. The previously initialized MDA company therefore remains reusable in the Lab.

## Historical context

Historical uploads are stored separately from current/operational source files under the service deployment. Examples include general ledgers, trial balances, bank reconciliations/statements, open AR/AP, payroll registers, YTD payroll and unresolved-item lists.

- Balance-books requires historical context.
- A company initialized as `NEW` may explicitly mark history as not applicable.
- Historical files use SHA-256 duplicate detection.

## Connector layer

The connector layer remains shared by the specialist agents and is only shown after registration/initialization and historical context are complete.

Current connector catalog:

- Xero — OAuth 2.0 adapter slot
- QuickBooks Online — OAuth 2.0 accounting adapter slot
- DATEV — Germany partner/API adapter slot
- SmartAccounts — Estonia API-key adapter slot
- Secure file upload — functional synthetic-Lab connector

External provider authorization is **not yet production-enabled**. Provider credentials, secure OAuth callback/token-vault handling, tenant authorization and provider-specific QA remain mandatory before real customer data may flow through Xero, QuickBooks, DATEV or SmartAccounts.

## Security boundary

The browser never talks directly to Firebase Realtime Database or Storage. Vercel server routes use Firebase Admin credentials. Firebase client rules deny direct reads/writes. Lab API operations require `FINCLOSE_LAB_TOKEN`.

Use synthetic/test financial data only until user authentication, tenant authorization, production database architecture and full security QA are complete.

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_STORAGE_BUCKET`
- `FINCLOSE_LAB_TOKEN`

Optional connector provider variables are documented in `.env.example`.

## v0.26 acceptance path

1. `/api/health?deep=1` reports Realtime Database and Storage reachable.
2. Open a homepage service route and confirm only registration/initialization is exposed initially.
3. For balance-books, register and confirm no company initialization is requested.
4. For payroll/bookkeeping/combined, register and link an existing initialized company or initialize a new one with the existing country workbook.
5. Confirm historical upload is the next visible stage and accepts multiple synthetic files.
6. Confirm an existing-company deployment cannot skip history; a `NEW` initialized company can.
7. Confirm connectors appear only after historical context is received or marked not applicable for a new company.
8. Confirm historical files and current source files use separate Firebase Storage paths.

## Production database gate

Firebase Realtime Database is being used for the current deployment test because it is already active and provides durable test persistence. It is **not approved as the final ledger database**. Before real accounting journals/ledger logic are introduced, FinClose must run a relational-storage decision gate. PostgreSQL remains the preferred production candidate for ledger-grade relational data.
