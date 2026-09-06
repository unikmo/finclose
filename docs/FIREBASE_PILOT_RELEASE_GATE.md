# FinClose Firebase Pilot Activation Gate

`PILOT` may not be enabled until every item below is verified against the actual Firebase project and Vercel deployment.

## Firebase platform

- Firebase Email/Password Authentication enabled.
- Firebase web-app API key/auth domain/project ID configured in Vercel.
- Cloud Firestore enabled in the `theantibalcony` project.
- Firestore Admin SDK read/write health succeeds from Vercel.
- Firestore deny-by-default rules deployed.
- Realtime Database deny-by-default client rules verified.
- Cloud Storage deny-by-default client rules verified.
- Firebase/Google backup and point-in-time recovery policy selected and enabled as appropriate.

## Identity and tenancy

- Account registration/login/session revocation tested.
- Email verification and password recovery flow completed before unrestricted production.
- Tenant A cannot list/read/write Tenant B companies, deployments, uploads, payroll, bookkeeping or closes.
- Role escalation tests cover VIEWER, ACCOUNTANT, APPROVER, ADMIN and OWNER.

## Financial controls

- Payroll/bookkeeping evidence reaches Firestore with deterministic IDs.
- Duplicate API retries do not duplicate ledger evidence.
- Locked-period payroll/bookkeeping/finance-cycle attempts are rejected.
- Simultaneous lock attempts cannot create overlapping company period locks.
- Reopen requires ADMIN and preserves prior lock/approval evidence.
- Reconciliation and source-completeness exceptions block approval.

## Uploads

- Tenant-specific private storage path verified.
- Type/size/signature checks verified.
- Quarantine/malware handling approved for the pilot risk level.
- No real financial file is accepted while the release gate is incomplete.

## Release

- Independent security review complete.
- Accounting-control QA complete.
- `FINCLOSE_RUNTIME_MODE=PILOT` set only after all mandatory gates pass.
- Live post-release verification complete before onboarding the pilot customer.
