# FinClose v0.23 Red Team Gate

Date: 2026-09-03
Scope: Vercel runtime + Firebase Firestore/Storage Lab migration

## Verdict

**PASS FOR SYNTHETIC LAB TESTING ONLY.**

This branch must not be presented as production-ready and must not receive real confidential accounting/payroll data.

## Checks

| Risk | Result | Treatment |
|---|---|---|
| Serverless state loss | PASS by design | Company/import state is persisted in Firestore, not process memory. Live verification still required. |
| Stable company identity | PASS by design | UUID-like company IDs are created server-side. |
| Wrong company ID | PASS by design | Backend returns 404 before storing a data chunk. Live verification required. |
| Duplicate upload | PARTIAL | SHA-256 + deterministic import ID handles ordinary sequential duplicates. Concurrent identical uploads can still race; fix before production-grade ingestion. |
| Cross-company leakage | LAB-ONLY | API uses a shared Lab token, not tenant/user authorization. Synthetic single-operator testing only. |
| Firebase credentials | PASS by design | Admin credentials are server-only Vercel environment variables; never `NEXT_PUBLIC_`. |
| Direct client Firestore/Storage access | REPO PASS / LIVE UNKNOWN | Deny-all rules are committed. They are not considered active until deployed and verified in Firebase. |
| Partial storage/database failure | PARTIAL | Failure can leave an orphaned object or incomplete import state in some edge cases. Add transactional/resumable import state before production. |
| Large files | BLOCKED FOR PRODUCTION | Current Lab sends files as base64 through a Vercel API request. Use direct signed/resumable uploads before large real-world files. |
| Ledger relational integrity | NOT APPROVED | Firestore is only the Lab persistence store. Run the relational database gate before journals/ledger become authoritative; Firebase SQL Connect/PostgreSQL is the preferred candidate. |
| Authentication | BLOCKED FOR PRODUCTION | Shared Lab token must be replaced by user authentication + tenant/company authorization. |
| Audit trail | PARTIAL PASS | Initialization/company/import events are append-created, but full immutable accounting audit controls are not yet implemented. |

## Release boundary

Before real data or production use:

1. Replace shared Lab token with authenticated user/tenant authorization.
2. Verify deployed Firestore and Storage security rules.
3. Add robust concurrent idempotency/reservation for uploads.
4. Add direct/resumable file upload path and malware/file validation controls.
5. Add failure recovery for DB/storage partial commits.
6. Decide and implement the authoritative relational ledger store.
7. Run independent security/QA and live post-release verification.
