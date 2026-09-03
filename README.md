# FinClose

Canonical repository for the FinClose financial-operations product and Lab.

## Canonical architecture — v0.25 test build

- **Source:** `unikmo/finclose`
- **Hosting/runtime:** Vercel
- **Test database:** Firebase Realtime Database
- **File storage:** Firebase Cloud Storage
- **Frontend/API:** Next.js
- **Supabase:** not used

## Product deployment rule

FinClose does not initialize or bill a customer for capabilities the customer did not choose.

| Customer choice | Agents activated | Minimum onboarding |
|---|---|---|
| Help me balance my books | Orchestrator + Close & Reconciliation | Registration + accounting source connection. No full company initialization. |
| Help me do payroll | Orchestrator + Payroll | Registration + payroll/company essentials + relevant connector. |
| Do my bookkeeping | Orchestrator + Bookkeeping | Registration + bookkeeping/company essentials + accounting connector. |
| Bookkeeping & Payroll | Orchestrator + Bookkeeping + Payroll | Registration + combined essentials + relevant connectors; full company initialization only where required. |

Homepage cards route to `/start/<service>` instead of the generic Lab workflow.

## Connector layer

The connector layer is shared by the specialist agents and enforces the service deployment boundary.

Current connector catalog:

- Xero — OAuth 2.0 adapter slot
- QuickBooks Online — OAuth 2.0 adapter slot
- DATEV — partner/API adapter slot
- SmartAccounts — company API-key adapter slot
- Secure file upload — functional synthetic-Lab connector

External provider authorization is **not yet production-enabled**. Provider credentials, secure OAuth callback/token-vault handling, tenant authorization and provider-specific QA remain mandatory before real customer data may flow through Xero, QuickBooks, DATEV or SmartAccounts.

The secure file-upload connector is functional in the synthetic Lab and can attach source files directly to a service deployment without first creating a full FinClose company.

## Security boundary

The browser never talks directly to Firebase Realtime Database or Storage. Vercel server routes use Firebase Admin credentials. Firebase client rules deny direct reads/writes. Lab API operations require `FINCLOSE_LAB_TOKEN`.

Use synthetic/test financial data only until user authentication, tenant authorization, production database architecture and full security QA are complete.

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_STORAGE_BUCKET`
- `FINCLOSE_LAB_TOKEN`

Optional connector provider variables are documented in `.env.example`.

## v0.25 service-deployment acceptance path

1. `/api/health?deep=1` reports Realtime Database and Storage reachable.
2. `/api/service-deployments/catalog` exposes four service profiles and connector availability.
3. Start `balance-books` with registration only; no company record or company initialization is required.
4. Select `manual-upload` and upload a synthetic accounting source file.
5. Confirm the service deployment reaches `READY_FOR_AGENT` and the source is stored in Firebase Storage.
6. Upload the same source again and confirm `ALREADY_RECEIVED`.
7. Start payroll/bookkeeping/combined deployments and confirm each requests only its declared service essentials.

## Production database gate

Firebase Realtime Database is being used for the current deployment test because it is already active and provides durable test persistence. It is **not approved as the final ledger database**. Before real accounting journals/ledger logic are introduced, FinClose must run a relational-storage decision gate. PostgreSQL remains the preferred production candidate for ledger-grade relational data.
