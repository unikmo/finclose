# FinClose Controlled Pilot Release Sign-off v0.35.1

Date prepared: 2026-09-07
Release source: `25242880b4c37d14bc4af4c2f85660ad9047be5e`
Scope: controlled PILOT
Status: PRE-ACTIVATION RECORD — DO NOT APPROVE UNTIL ALL MANDATORY GATES PASS

This is the final human release record. It consolidates evidence but does not replace the protected v0.35 certification report or any underlying operational evidence.

## A. Source and CI

- [x] v0.35.1 source merged to `main`.
- [x] Deterministic Firebase hardening tests passed.
- [x] Full Next.js production build passed.
- [x] Stale PostgreSQL period-lock wording corrected to Firestore.
- [x] Vercel masked-secret handling is explicit and fail-closed.
- [x] Firebase session-revocation certification uses bounded, code-specific verification.

CI run/reference: `34140534066`

## B. Live Firebase / runtime gates

Complete only from live evidence. Do not infer from source code.

| Gate | Evidence reference | Result |
|---|---|---|
| v0.35.1 deployed to canonical runtime | | PENDING |
| Firebase Web config discovery ready | | PENDING |
| Firebase Email/Password provider operational | | PENDING |
| RTDB reachable | | PENDING |
| Firestore authoritative ledger reachable | | PENDING |
| Storage reachable | | PENDING |
| Anonymous RTDB/Firestore/Storage access denied | | PENDING |
| Tenant/role isolation certification passed | | PENDING |
| Firestore idempotency/lock concurrency passed | | PENDING |
| Upload-review concurrency passed | | PENDING |

## C. Protected certification

- Certification version: `0.35.0`
- Certification run ID: ________________________________________________
- Completed at: ________________________________________________________
- Evidence hash: _______________________________________________________
- Mandatory FAIL count: _______________________________________________
- Mandatory BLOCKED count: ____________________________________________
- `release_ready=true`: `YES` / `NO`
- `activation_allowed=true`: `YES` / `NO`

Certification result: `PASS` / `FAIL` / `PENDING`

## D. Manual P0 evidence

| Gate | Required record | Result |
|---|---|---|
| Backup / PITR / restore | `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md` completed with PASS | PENDING |
| Controlled upload operator adoption | `CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md` adoption section PASS | PENDING |
| Human Auth email delivery | `AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md` overall PASS | PENDING |
| Security approval | `SECURITY_RELEASE_EVIDENCE_V035.md` final approval supported by live evidence | PENDING |
| Accounting-control approval | `ACCOUNTING_CONTROL_QA_V035.md` plus required live concurrency/tenant evidence | PENDING |

## E. Release environment values

Before PILOT activation, verify the intended values as one controlled change set:

- `FINCLOSE_RUNTIME_MODE=PILOT`
- `FINCLOSE_PILOT_RELEASE_GATE=APPROVED`
- `FINCLOSE_UPLOAD_QUARANTINE_MODE=MANUAL_REVIEW` unless a verified scanner is explicitly approved
- `FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED=YES`
- `FINCLOSE_BACKUP_PITR_VERIFIED=YES`
- `FINCLOSE_SECURITY_REVIEW_APPROVED=YES`
- `FINCLOSE_ACCOUNTING_QA_APPROVED=YES`
- `FINCLOSE_PRODUCTION_RELEASE_GATE=BLOCKED`
- `FINCLOSE_UPLOAD_SCANNER_VERIFIED` must not be represented as `YES` unless an actual scanner has been independently verified

No value in this section may be set merely because this template exists.

## F. Immediate post-activation checks

Run immediately after PILOT activation:

- [ ] Deep health reports PILOT and no release blockers.
- [ ] Managed Firebase registration/login/session/logout path works.
- [ ] Unverified user remains blocked from real financial-data operations.
- [ ] Cross-tenant access remains denied.
- [ ] Controlled upload enters quarantine and requires ADMIN review.
- [ ] Quarantined files cannot reach financial processing.
- [ ] Synthetic bookkeeping/payroll/close path produces expected evidence.
- [ ] Period-lock enforcement remains active.
- [ ] `FINCLOSE_PRODUCTION_RELEASE_GATE` is still blocked.

If any mandatory post-activation check fails, revert runtime to `LAB` and the pilot release latch to `BLOCKED` before further real-data use.

## G. Final sign-off

All P0 gates complete: `YES` / `NO`
Protected certification clean: `YES` / `NO`
Production remains blocked: `YES` / `NO`
Controlled PILOT approved: `YES` / `NO`

Release approver: ___________________________  Date: ____________________
Security approver: __________________________  Date: ____________________
Accounting-control approver: _________________  Date: ____________________

### Activation rule

`Controlled PILOT approved` must remain `NO` until every mandatory gate above is supported by actual evidence. No single source review, CI run, policy document or successful health check is sufficient by itself.
