# FinClose Canonical Truth Registry

Version: 6
Effective date: 2026-09-03

| Field | Canonical value | Authority | Status | Supersedes |
|---|---|---|---|---|
| Product | FinClose / FinClose Lab | User decision | ACTIVE | — |
| Canonical repository | `unikmo/finclose` | Verified GitHub repository | ACTIVE | FinClose branches inside `unikmo/Unikmo` |
| Hosting/runtime | Vercel | User decision | ACTIVE | Firebase Hosting candidate |
| Main homepage | `How Can We Help?` service-selection layer | User decision | ACTIVE | Technical Lab as homepage |
| Homepage choices | Help me balance my books; Help me do payroll; Do my bookkeeping; Bookkeeping & Payroll | User wording | ACTIVE | Previous #4 `I need bookkeeping` |
| Deployment principle | Deploy and bill only the agent capabilities required by the selected service | User decision | ACTIVE | Generic full-company onboarding for every customer |
| Core internal agents | Orchestrator; Close & Reconciliation; Bookkeeping; Payroll | User/product architecture | ACTIVE | Ad hoc task-specific agents |
| Balance-books onboarding | Registration + accounting source connection; no full company initialization | User decision | ACTIVE | Generic initialization workbook |
| Payroll onboarding | Registration + payroll/company essentials + relevant connector | User decision | ACTIVE | Generic initialization workbook |
| Bookkeeping onboarding | Registration + bookkeeping/company essentials + accounting connector | User decision | ACTIVE | Generic initialization workbook |
| Bookkeeping + Payroll onboarding | Registration + combined essentials + relevant connectors; full company initialization allowed when required | User decision | ACTIVE | Generic initialization for all services |
| Connector architecture | Shared connector layer with service-specific least-privilege access | Product architecture | ACTIVE | Connectors embedded separately in each agent |
| Connector catalog | Xero; QuickBooks Online; DATEV; SmartAccounts; secure file upload | Implementation + official provider evidence | ACTIVE | — |
| Live external connector status | Provider slots implemented; external OAuth/API authorization not production-enabled until provider credentials, callback/token-vault controls and QA are complete | Security gate | ACTIVE | — |
| Secure file upload connector | Functional for synthetic Lab service-deployment tests | Verified implementation target | ACTIVE | Company-only file upload path |
| Legacy technical workflow | `/lab` retained for initialization/testing only | Implementation | ACTIVE | `/` |
| Test database | Firebase Realtime Database | User-provided active Firebase database + implementation | ACTIVE | Firebase Cloud Firestore test candidate |
| Realtime Database URL | `https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/` | User-provided Firebase endpoint | ACTIVE | — |
| File storage | Firebase Cloud Storage | User decision + verified connectivity | ACTIVE | Supabase Storage |
| Firebase project | `theantibalcony` | User-provided Firebase project | ACTIVE | — |
| Test data policy | Synthetic/test data only | FinClose safety boundary | ACTIVE | — |
| Final ledger database | NOT YET LOCKED; relational gate required | Architecture gate required | OPEN | — |
| Production readiness | NOT READY | QA/release gate | ACTIVE | — |
