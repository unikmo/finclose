# FinClose Canonical Truth Registry

Version: 7
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
| Service onboarding order | 1) registration / required company initialization; 2) upload prior information for context; 3) connect the current accounting/payroll system | User decision | ACTIVE | Showing connectors and agent details before setup/history |
| First-view rule | After a homepage service choice, show only registration / initialization content until that stage is complete | User decision | ACTIVE | Multi-step workflow exposed all at once |
| Existing initialized companies | An already initialized FinClose company can be linked to a new service deployment instead of initialized again; MDA remains an existing initialized company from prior Lab work | User decision + existing Lab state | ACTIVE | Re-initializing every service deployment |
| Balance-books onboarding | Registration only; no company initialization; historical accounting information follows before current-system connection | User decision | ACTIVE | Registration + immediate connector |
| Payroll onboarding | Registration + initialized company; prior payroll information follows; then relevant current-system connector | User decision | ACTIVE | Reduced essentials + immediate connector |
| Bookkeeping onboarding | Registration + initialized company; prior bookkeeping information follows; then relevant current-system connector | User decision | ACTIVE | Reduced essentials + immediate connector |
| Bookkeeping + Payroll onboarding | Registration + initialized company; prior bookkeeping/payroll information follows; then relevant current-system connectors | User decision | ACTIVE | Generic all-at-once onboarding |
| Historical-context storage | Historical files are stored separately from current/operational source data under the service deployment and are used to understand the starting position | User decision + implementation | ACTIVE | Treating all uploads as current source data |
| Historical-context skip | Only a company initialized as `NEW` may skip prior-history upload; balance-books cannot skip historical context | Product safeguard | ACTIVE | Unrestricted skip |
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
