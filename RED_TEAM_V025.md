# FinClose v0.25 — Independent Red Team

Date: 2026-09-03

## Scope

Review of the service-specific deployment router, four agent deployment profiles and shared connector layer.

## Pass conditions verified in code design

1. **Balance-books is no longer forced through company initialization.** Its profile requires registration only, activates Orchestrator + Close & Reconciliation, and can receive a source through the service-deployment path.
2. **Payroll and bookkeeping are separated.** Each profile activates only its specialist agent plus the Orchestrator and requests only declared essentials.
3. **Combined service is composition, not a new agent.** Bookkeeping & Payroll activates Orchestrator + Bookkeeping + Payroll.
4. **Billing scope is explicit per deployment.** `BALANCE_BOOKS`, `PAYROLL_ONLY`, `BOOKKEEPING_ONLY`, and `BOOKKEEPING_AND_PAYROLL` are persisted with the service deployment.
5. **Connector boundary is centralized.** Agents do not own separate provider integrations.
6. **Connector-country routing is constrained.** DATEV is routed to DE, SmartAccounts to EE, Xero payroll is currently routed only to GB, and QuickBooks Online is not exposed as a payroll connector.
7. **Secure file upload works without a company record.** A deployment-specific source object is stored under `finclose/service-deployments/...` and duplicate files are fingerprinted by SHA-256.

## Risks / blockers

1. **External OAuth/API connectors are adapter slots, not live integrations.** Xero, QuickBooks Online, DATEV and SmartAccounts must not be described as live until provider credentials, OAuth callback/token exchange, encrypted token storage/rotation, reconnect/revoke behavior and provider-specific acceptance tests exist.
2. **Lab registration is not customer authentication.** `FINCLOSE_LAB_TOKEN` remains a test control. Real user registration/authentication and tenant authorization are still required before confidential financial data.
3. **Provider capability drift.** API scopes, certifications, regional payroll availability and commercial terms can change. The country/capability matrix must remain evidence-backed and versioned.
4. **Manual upload remains base64 through Vercel.** It is acceptable for small synthetic tests but not large accounting exports. Production needs direct/resumable uploads, size limits, malware/file validation and recovery.
5. **No accounting work is executed yet by these agents.** v0.25 routes and persists the correct deployment/source context; it does not yet implement the reconciliation, booking or payroll calculation engines themselves.
6. **Realtime Database remains non-ledger storage.** Do not expand it into authoritative journal/ledger logic before the relational database gate.

## Verdict

**PASS WITH RISKS — SERVICE ROUTING LAB ONLY.**

The architecture now enforces the commercial deployment boundary, but real provider connectors and real financial-agent execution remain gated.
