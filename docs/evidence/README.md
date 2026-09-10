# FinClose Pilot-Activation Evidence — v0.35.2

Signed / verified evidence for the seven P0 pilot-activation blockers in issue #21.

**Certification of record:** run `20260910100816_3d1f24a83c` — **19 PASS / 0 FAIL / 0 BLOCKED**, `release_ready: true`, `activation_allowed: true`.
**Bound source SHA:** `6996db90439bc3889c51571cbd7981d621073e69`.

| Blocker | Cert gate(s) | Evidence |
|---|---|---|
| #1 Firebase web/client auth | `firebase_auth_end_to_end` | (in the certification report) |
| #2 Backup / recovery | `backup_pitr_policy` | [BACKUP_RECOVERY_VERIFICATION_V0352.md](BACKUP_RECOVERY_VERIFICATION_V0352.md) |
| #3 Controlled upload operator adoption | `controlled_upload_procedure`, `controlled_upload_operator_adoption`, `pilot_upload_mode` | [UPLOAD_OPERATOR_ADOPTION_V0352.md](UPLOAD_OPERATOR_ADOPTION_V0352.md) |
| #4 Source-bound certification | `release_source_identity` + all technical gates | (the certification report itself) |
| #5 Auth email human delivery | `auth_email_human_delivery` | [AUTH_EMAIL_DELIVERY_VERIFICATION_V0352.md](AUTH_EMAIL_DELIVERY_VERIFICATION_V0352.md) |
| #6 Independent security review | `independent_security_review` | [SECURITY_REVIEW_V0352.md](SECURITY_REVIEW_V0352.md) |
| #7 Accounting-control QA | `accounting_control_qa` | [ACCOUNTING_CONTROL_QA_V0352.md](ACCOUNTING_CONTROL_QA_V0352.md) |

These supersede, at the v0.35.2 SHA, the source-level predecessors `docs/SECURITY_RELEASE_EVIDENCE_V035.md` and `docs/ACCOUNTING_CONTROL_QA_V035.md`, and operationalise the policy templates `docs/FIREBASE_BACKUP_PITR_POLICY_V1.md`, `docs/BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`, `docs/AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md`, `docs/CONTROLLED_PILOT_UPLOAD_PROCEDURE_V1.md`, `docs/CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md`.

## Outstanding before real customer data flows

1. Operator countersignature on §G/§H of `BACKUP_RECOVERY_VERIFICATION_V0352.md` (recovery authority).
2. Activation change set: `FINCLOSE_RUNTIME_MODE=PILOT`, `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` (keep `FINCLOSE_PRODUCTION_RELEASE_GATE=BLOCKED`) + post-activation smoke checks.

## Accepted pilot fast-follows (from the #6 / #7 reviews)

- Replace `xlsx@0.18.5` (prototype pollution + ReDoS) with `xlsx@0.20.3` (SheetJS CDN) or `exceljs`.
- Upgrade Next.js 14.2.35 → 15.5.24+.
- Publish DKIM + DMARC for `antibalcony.com`.
- Add an org-level "approver ≠ preparer" policy before any multi-user customer.
- `npm audit --audit-level=high` in CI.

None of the above is reachable as a critical issue in the pilot deployment as configured; each has an owner and a target inside the pilot window.
