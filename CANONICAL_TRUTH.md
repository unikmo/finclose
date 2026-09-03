# FinClose Canonical Truth Registry

Version: 3
Effective date: 2026-09-03

| Field | Canonical value | Authority | Status | Supersedes |
|---|---|---|---|---|
| Product | FinClose / FinClose Lab | User decision | ACTIVE | — |
| Canonical repository | `unikmo/finclose` | Verified GitHub repository | ACTIVE | FinClose branches inside `unikmo/Unikmo` |
| Hosting/runtime | Vercel | User decision | ACTIVE | Firebase Hosting candidate |
| Test database | Firebase Realtime Database | User-provided active Firebase database + implementation | ACTIVE | Firebase Cloud Firestore test candidate |
| Realtime Database URL | `https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/` | User-provided Firebase endpoint | ACTIVE | — |
| File storage | Firebase Cloud Storage | User decision + verified connectivity | ACTIVE | Supabase Storage |
| Firebase project | `theantibalcony` | User-provided Firebase project | ACTIVE | — |
| Test data policy | Synthetic/test data only | FinClose safety boundary | ACTIVE | — |
| Final ledger database | NOT YET LOCKED; relational gate required | Architecture gate required | OPEN | — |
| Production readiness | NOT READY | QA/release gate | ACTIVE | — |
