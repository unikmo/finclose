# FinClose Firebase Pilot Activation Gate

`PILOT` may not be enabled until every mandatory item below is verified against the actual Firebase project and the deployed runtime. Source code or a successful build is not proof that the Firebase environment is ready.

## Firebase platform

- Firebase Email/Password Authentication enabled in `theantibalcony`.
- Firebase Web App configuration resolved through explicit environment configuration or the fail-closed Firebase Management API discovery path.
- Cloud Firestore enabled in the `theantibalcony` project.
- Firestore Admin SDK read/write health succeeds from the deployed runtime.
- Firestore deny-by-default client rules deployed and verified.
- Realtime Database deny-by-default client rules verified.
- Cloud Storage deny-by-default client rules verified.
- Firebase/Google backup and point-in-time recovery controls verified under `FIREBASE_BACKUP_PITR_POLICY_V1.md` and recorded in `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`.

## Identity and tenancy

- Registration, login, logout and server-session revocation tested against Firebase Authentication.
- New managed accounts receive an email-verification message.
- An unverified managed account cannot access company or real financial-data operations.
- Password reset returns a non-enumerating response and the Firebase reset flow is tested end to end.
- Human mailbox delivery is verified using `AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md`.
- Authentication rate limiting is tested for registration, login, verification resend and password reset.
- Tenant A cannot list/read/write Tenant B companies, deployments, uploads, payroll, bookkeeping or closes.
- Role escalation tests cover VIEWER, ACCOUNTANT, APPROVER, ADMIN and OWNER.

## Financial controls

- Payroll/bookkeeping evidence reaches Firestore with deterministic IDs.
- Duplicate API retries do not duplicate ledger evidence.
- Locked-period payroll/bookkeeping/finance-cycle attempts are rejected.
- Simultaneous lock attempts cannot create overlapping company period locks.
- Reopen requires ADMIN and preserves prior lock/approval evidence.
- Reconciliation and source-completeness exceptions block approval.
- Deep health returns `ok: false` whenever a real-data release blocker remains.

## Uploads

- Tenant-specific private Storage paths verified.
- Type/size/signature checks verified.
- `FINCLOSE_UPLOAD_QUARANTINE_MODE` is not left at `BLOCK` when the controlled pilot begins.
- For a controlled trusted-source pilot, `MANUAL_REVIEW` may be used only after the operator adoption section of `CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md` is `PASS`.
- Uploaded files remain `QUARANTINED`, cannot unlock onboarding or source-completeness controls, and require ADMIN review before becoming `RECEIVED`.
- The ADMIN review download is forced as an attachment, uses no-store/nosniff headers, and is tenant/deployment scoped.
- Review decisions are immutable through the quarantine-review endpoint; an already cleared/rejected artifact cannot be flipped by a second review call.
- `SCANNER` must not be selected unless an actual automated scanner worker and failure/timeout behavior have been independently verified and `FINCLOSE_UPLOAD_SCANNER_VERIFIED=YES` is justified.
- `PRODUCTION` requires verified `SCANNER` mode; manual review alone is not sufficient for unrestricted production uploads.
- No real financial file is processed while it remains quarantined.

## Release latch

- `FINCLOSE_RUNTIME_MODE=PILOT` alone is insufficient to activate real-data use.
- `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` is set only after all mandatory pilot checks pass.
- A controlled pilot may use `FINCLOSE_UPLOAD_QUARANTINE_MODE=MANUAL_REVIEW` only with trusted pilot sources and an explicitly adopted human review procedure.
- `FINCLOSE_PRODUCTION_RELEASE_GATE` remains `BLOCKED` during the pilot.
- Final human sign-off is recorded in `PILOT_RELEASE_SIGNOFF_V0351.md`.

## Independent release QA

- Fresh independent security review complete.
- Accounting-control QA complete.
- Tenant isolation/concurrency tests run against the actual deployed Firebase environment.
- FinClose source release `v0.35.1` (`25242880b4c37d14bc4af4c2f85660ad9047be5e`) is deployed to the intended canonical runtime before activation.
- Live `/api/health?deep=1`, account, upload quarantine, Firestore ledger and close-lock paths are verified post-release.
- The protected v0.35 certification report has zero mandatory `FAIL` or `BLOCKED` gates and reports `release_ready=true` and `activation_allowed=true` before the activation change set.
- Only after those checks may the first controlled real-data pilot customer be onboarded.
