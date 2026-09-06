# FinClose Canonical Truth Registry

Version: 12
Effective date: 2026-09-06

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
| Lab account authentication | v0.27+ uses a temporary server-side Lab account bridge: scrypt-hashed password records in Firebase RTDB plus signed HTTP-only session cookie. This is for synthetic Lab testing only and is not the production identity architecture | Implementation + security gate | ACTIVE | Customer-facing shared Lab token |
| Production authentication | Proper managed customer authentication/tenant authorization remains required before real customer use; Firebase Auth is the preferred current candidate but is not yet verified/configured for FinClose | Security architecture gate | OPEN | — |
| Existing initialized companies | An already initialized FinClose company can be linked to a new service deployment instead of initialized again; MDA remains an existing initialized company from prior Lab work | User decision + existing Lab state | ACTIVE | Re-initializing every service deployment |
| Balance-books onboarding | Account → historical accounting information → current-system connection; no company initialization required | User decision | ACTIVE | Registration only before history |
| Payroll onboarding | Account → company country + pay schedule → reuse or initialize company → prior payroll information → current payroll source → payroll handoff | User decision + v0.28 UX implementation | ACTIVE | Generic account/company/history/connector screen |
| Payroll screen rule | Payroll has a dedicated four-screen customer flow: Account, Company, Payroll history, Current payroll. Internal connector states and provider-credential requirements are never exposed as customer actions | User decision + UX safeguard | ACTIVE | Shared generic service onboarding UI for payroll |
| Payroll connector presentation | Secure file upload is shown whenever it is the currently usable payroll path. Direct payroll integrations appear only when configured and country-supported; unavailable internal provider slots stay hidden | UX truthfulness rule | ACTIVE | Customer-facing `PROVIDER_CREDENTIALS_REQUIRED` / `PARTNER_APP_REQUIRED` states |
| Payroll operational engine | FinClose v0.29 introduces a deterministic payroll calculation engine with a versioned country rule-pack boundary, prepared-run persistence, duplicate-input fingerprinting, balanced payroll journal output and no-payment/no-filing execution boundary | User implementation authorization + implementation | ACTIVE | Onboarding-only payroll capability |
| Georgia payroll rule pack | `GE-2026-BASIC-EMPLOYMENT-V1`: regular cash salary, 20% income-tax withholding; explicit pension-participant input; 2% employee pension, 2% employer pension; state pension contribution calculated across GEL 24,000 / 60,000 annual bands; GEL/tetri rounding; special exemptions/benefits/foreign cases excluded | Matsne Tax Code + Law on Funded Pension + implementation | ACTIVE / SYNTHETIC LAB ONLY | No operational Georgia payroll calculation |
| Payroll rule-pack country coverage | Georgia basic employment is implemented first. US, DE, GB, EE and CM operational payroll calculations remain `NOT_IMPLEMENTED` until their statutory rule packs are separately researched, tested and approved | Reliability boundary | ACTIVE | Implied multi-country payroll completeness |
| Payroll execution boundary | Payroll runs are `PREPARED_NOT_APPROVED` and `NO_PAYMENT_NO_FILING`; FinClose does not yet submit payroll declarations, tax/pension filings or initiate salary payments | Safety / release gate | ACTIVE | — |
| Bookkeeping onboarding | Account → initialized company → prior bookkeeping information → accounting connector | User decision | ACTIVE | Registration + initialized company |
| Bookkeeping operational engine | FinClose v0.30 introduces `BOOKKEEPING-CORE-V1`: balanced journal validation, duplicate journal-ID controls, linked-company base-currency enforcement, deterministic bank-to-ledger cash reconciliation, ambiguous-match isolation and prepared-batch persistence | User implementation authorization + implementation | ACTIVE / SYNTHETIC LAB ONLY | Onboarding-only bookkeeping capability |
| Bookkeeping reconciliation rule | Automatic reconciliation requires exact signed amount and a unique highest-confidence candidate within a 3-day window. Same normalized reference + same date scores highest; tied candidates remain ambiguous and are not auto-matched | Implementation reliability rule | ACTIVE | — |
| Bookkeeping sign convention | Bank and ledger cash items use the same signed cash-flow convention for matching | Implementation contract | ACTIVE | — |
| Bookkeeping execution boundary | Bookkeeping batches are `PREPARED_NOT_APPROVED`, `PREPARED_NOT_POSTED` and `NO_EXTERNAL_POSTING`; no external accounting system posting or period locking is enabled | Safety / release gate | ACTIVE | — |
| Bookkeeping scope not yet implemented | Automatic chart-of-accounts classification, VAT/sales-tax coding, invoice/receipt extraction and matching, AR/AP subledger automation, period locks and country-specific bookkeeping/tax rule packs remain unimplemented | Reliability boundary | ACTIVE | — |
| Bookkeeping + Payroll onboarding | Account → initialized company → prior bookkeeping/payroll information → relevant current-system connectors | User decision | ACTIVE | Registration + initialized company |
| Bookkeeping + Payroll engine availability | The combined service is permitted to invoke both Payroll and Bookkeeping engines under the same service deployment. Automatic payroll-run → bookkeeping-batch handoff/posting is not yet implemented and must not be implied | Product architecture + implementation boundary | ACTIVE | Implied full cross-module automation |
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
