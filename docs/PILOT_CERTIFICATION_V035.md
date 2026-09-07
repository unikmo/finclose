# FinClose v0.35 — Pilot Release Verification & Activation

Date: 2026-09-07

## Purpose

v0.35 converts the Firebase pilot release checklist into executable release evidence. Certification runs while the canonical application remains in `LAB`; it uses only disposable synthetic `finclose_cert_*` records against the actual Firebase project and removes those temporary records after each gate.

A successful source build is not a pilot approval. `FINCLOSE_PILOT_RELEASE_GATE` must remain `BLOCKED` until the latest certification report has no mandatory FAIL/BLOCKED gates and the manual release attestations have real supporting evidence.

## Internal endpoint

`POST /api/pilot-certification`

- Protected by the existing internal `x-finclose-lab-token` header.
- Refuses to run unless `FINCLOSE_RUNTIME_MODE=LAB`.
- Executes live synthetic certification checks and stores a hashed report in RTDB.

`GET /api/pilot-certification`

- Protected by the same internal token.
- Returns the latest persisted certification report.

## Automated gates

The certification harness verifies:

1. The runtime is still LAB and the pilot release latch has not been pre-approved.
2. Cloud Firestore ledger health/schema is reachable.
3. Live RTDB, Firestore and Storage synthetic write/read/delete round trips.
4. Anonymous/public reads are denied for disposable RTDB, Firestore and Storage evidence.
5. Firebase Auth end to end when the web/client API configuration is present:
   - synthetic account creation,
   - Email/Password REST sign-in,
   - ID-token verification,
   - verification-email OOB request,
   - password-reset OOB request,
   - server session-cookie creation/verification,
   - refresh/session revocation enforcement,
   - test-user cleanup.
6. Live tenant isolation and VIEWER / ACCOUNTANT / APPROVER / ADMIN / OWNER role hierarchy using disposable RTDB memberships.
7. Firestore transaction idempotency under concurrent retries.
8. Firestore overlapping-period-lock concurrency: two simultaneous overlapping lock attempts must result in exactly one success and one rejection.
9. RTDB upload-review decision concurrency: simultaneous CLEAN/REJECTED claims must persist one immutable decision.
10. Deterministic payroll, bookkeeping, finance-cycle and close-governance self-tests.
11. Production release remains separately blocked.

## Manual mandatory gates

These remain BLOCKED until explicit release evidence exists and the corresponding Vercel environment value is set to `YES`:

- `FINCLOSE_BACKUP_PITR_VERIFIED`
- `FINCLOSE_SECURITY_REVIEW_APPROVED`
- `FINCLOSE_ACCOUNTING_QA_APPROVED`
- `FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED`

The controlled pilot also requires `FINCLOSE_UPLOAD_QUARANTINE_MODE=MANUAL_REVIEW`, unless a separately verified automated scanner is already available.

## Activation sequence

1. Keep `FINCLOSE_RUNTIME_MODE=LAB`.
2. Configure Firebase web/client Auth (`FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN`; optional `FIREBASE_WEB_APP_ID`).
3. Configure controlled pilot upload mode as `MANUAL_REVIEW` only after the human review procedure exists.
4. Set each manual attestation to YES only after the corresponding evidence is complete.
5. Run `POST /api/pilot-certification` with the internal lab token.
6. Review the stored report and evidence hash.
7. Do not activate if any mandatory gate is FAIL or BLOCKED.
8. Once all gates pass, set `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` and `FINCLOSE_RUNTIME_MODE=PILOT` together in one controlled deployment.
9. Immediately run post-activation smoke checks: deep health, login/session, tenant isolation, upload quarantine and a synthetic accounting/lock path. If any post-activation check fails, revert to LAB and restore the pilot release latch to BLOCKED.
10. Keep `FINCLOSE_PRODUCTION_RELEASE_GATE=BLOCKED` throughout the controlled pilot.

## Evidence policy

Certification records contain only synthetic IDs, status, gate evidence and hashes. They must never include passwords, Firebase ID tokens, session cookies, service-account material or customer financial data.
