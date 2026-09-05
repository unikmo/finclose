# FinClose Canonical Truth Registry

Version: 9
Effective date: 2026-09-05

| Field | Canonical value | Authority | Status | Supersedes |
|---|---|---|---|---|
| Product | FinClose / FinClose Lab | User decision | ACTIVE | — |
| Canonical repository | `unikmo/finclose` | Verified GitHub repository | ACTIVE | FinClose branches inside `unikmo/Unikmo` |
| Hosting/runtime | Vercel | User decision | ACTIVE | Firebase Hosting candidate |
| Main homepage | `How Can We Help?` service-selection layer; no technical Lab entry is exposed to customers | User decision + UX correction | ACTIVE | Homepage `Open test lab` link |
| Homepage choices | Help me balance my books; Help me do payroll; Do my bookkeeping; Bookkeeping & Payroll | User wording | ACTIVE | Previous #4 `I need bookkeeping` |
| Deployment principle | Deploy and bill only the agent capabilities required by the selected service | User decision | ACTIVE | Generic full-company onboarding for every customer |
| Core internal agents | Orchestrator; Close & Reconciliation; Bookkeeping; Payroll | User/product architecture | ACTIVE | Ad hoc task-specific agents |
| Customer entry rule | After choosing a service, the first customer action is `Sign in` or `Create account`; technical Lab credentials must never be requested in the customer flow | User decision | ACTIVE | Customer-facing Lab token field |
| Customer onboarding order | 1) sign in / register; 2) ingest or link company if the selected service requires it; 3) upload prior information for context; 4) connect the current accounting/payroll system | User decision | ACTIVE | Registration/company setup combined as the first visible step |
| First-view rule | A service route initially exposes only account access. Company setup, historical upload and connectors remain hidden until their preceding gate is complete | User decision | ACTIVE | Registration / initialization shown before account access |
| Lab access token | `FINCLOSE_LAB_TOKEN` is an internal server/test secret only. It remains available for `/lab` and backend test access but is not part of customer onboarding | User decision + implementation | ACTIVE | Customer enters Lab token |
| Lab account authentication | v0.27 uses a temporary server-side Lab account bridge: scrypt-hashed password records in Firebase RTDB plus signed HTTP-only session cookie. This is for synthetic Lab testing only and is not the production identity architecture | Implementation + security gate | ACTIVE | Customer-facing shared Lab token |
| Production authentication | Proper managed customer authentication/tenant authorization remains required before real customer use; Firebase Auth is the preferred current candidate but is not yet verified/configured for FinClose | Security architecture gate | OPEN | — |
| Existing initialized companies | An already initialized FinClose company can be linked to a new service deployment instead of initialized again; MDA remains an existing initialized company from prior Lab work | User decision + existing Lab state | ACTIVE | Re-initializing every service deployment |
| Balance-books onboarding | Account → historical accounting information → current-system connection; no company initialization required | User decision | ACTIVE | Registration only before history |
| Payroll onboarding | Account → initialized company → prior payroll information → relevant current-system connector | User decision | ACTIVE | Registration + initialized company |
| Bookkeeping onboarding | Account → initialized company → prior bookkeeping information → accounting connector | User decision | ACTIVE | Registration + initialized company |
| Bookkeeping + Payroll onboarding | Account → initialized company → prior bookkeeping/payroll information → relevant current-system connectors | User decision | ACTIVE | Registration + initialized company |
| Historical-context storage | Historical files are stored separately from current/operational source data under the service deployment and are used to understand the starting position | User decision + implementation | ACTIVE | Treating all uploads as current source data |
| Historical-context skip | Only a company initialized as `NEW` may skip prior-history upload; balance-books cannot skip historical context | Product safeguard | ACTIVE | Unrestricted skip |
| Connector architecture | Shared connector layer with service-specific least-privilege access | Product architecture | ACTIVE | Connectors embedded separately in each agent |
| Connector catalog | Xero; QuickBooks Online; DATEV; SmartAccounts; secure file upload | Implementation + official provider evidence | ACTIVE | — |
| Live external connector status | Provider slots implemented; external OAuth/API authorization not production-enabled until provider credentials, callback/token-vault controls and QA are complete | Security gate | ACTIVE | — |
| Secure file upload connector | Functional for synthetic Lab service-deployment tests | Verified implementation target | ACTIVE | Company-only file upload path |
| Legacy technical workflow | `/lab` is retained as a direct/internal initialization/testing route but is not linked from the customer homepage | Implementation + UX boundary | ACTIVE | Public homepage Lab entry |
| Test database | Firebase Realtime Database | User-provided active Firebase database + implementation | ACTIVE | Firebase Cloud Firestore test candidate |
| Realtime Database URL | `https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/` | User-provided Firebase endpoint | ACTIVE | — |
| File storage | Firebase Cloud Storage | User decision + verified connectivity | ACTIVE | Supabase Storage |
| Firebase project | `theantibalcony` | User-provided Firebase project | ACTIVE | — |
| Test data policy | Synthetic/test data only | FinClose safety boundary | ACTIVE | — |
| Final ledger database | NOT YET LOCKED; relational gate required | Architecture gate required | OPEN | — |
| Production readiness | NOT READY | QA/release gate | ACTIVE | — |
