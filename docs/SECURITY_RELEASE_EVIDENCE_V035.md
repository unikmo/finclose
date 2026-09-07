# FinClose v0.35 Security Release Evidence

Date: 2026-09-07
Scope: controlled PILOT
Verdict: **SOURCE/LAB-DEPLOYMENT PASS; LIVE AUTH/RULES CERTIFICATION PENDING**

`FINCLOSE_SECURITY_REVIEW_APPROVED` must remain `NO` until the protected v0.35 certification has executed successfully and the remaining live security gates below have passed.

## Evidence already established

### Source and CI

- PR #20 (`FinClose v0.35: Pilot release verification and activation`) passed CI on its final head.
- The squash-merged `main` commit also passed CI.
- Independent v0.35 red-team review concluded the source is suitable for merge and LAB deployment while explicitly blocking PILOT activation until certification has no mandatory FAIL/BLOCKED gates.

### Canonical live deployment

The canonical Vercel deployment reports:

- FinClose version `0.35.0`;
- runtime `LAB`;
- real-data mode disabled;
- Firebase server/Admin authentication credential configured;
- Firebase web/client authentication configuration not ready;
- Firestore configured and reachable;
- Firebase Realtime Database reachable;
- Firebase Cloud Storage reachable;
- upload quarantine mode `BLOCK`;
- `real_data_allowed_by_config=false`;
- deterministic payroll/bookkeeping/finance-cycle/close controls passing;
- no pilot certification report yet.

This is the correct fail-closed pre-activation state.

### Certification endpoint protection

The deployed `GET /api/pilot-certification` route was called without the internal Lab token and returned HTTP `401 Unauthorized` with `invalid lab access token`.

The route therefore does not expose certification execution/report retrieval anonymously through the application layer.

## Source-level security controls reviewed

### Managed Firebase identity

PILOT/PRODUCTION authentication uses:

- Firebase Authentication;
- server-generated HTTP-only session cookie;
- `Secure` cookie attribute;
- `SameSite=Lax`;
- recent-auth requirement before session creation;
- Firebase token/session revocation checks;
- verified-email requirement before real financial-data operations;
- non-enumerating password-reset response;
- rate limiting for login, registration, reset and verification resend.

The current live environment cannot yet exercise the complete customer Auth path because the Firebase web/client API configuration is incomplete. That remains a mandatory certification blocker rather than being waived.

### Tenant and role authorization

Real-data routes bind access to organization/deployment/company ownership and use the hierarchy:

`VIEWER < ACCOUNTANT < APPROVER < ADMIN < OWNER`

Sensitive operations have explicit role floors. The v0.35 certification includes disposable cross-tenant and role-escalation tests against the live RTDB control plane.

### Authoritative ledger

Real financial evidence and close/period-lock truth use Firestore through Firebase Admin, not direct browser writes. Financial writes use deterministic IDs, transactions/idempotency patterns and organization/company ownership checks.

The v0.35 certification includes live Firestore retry/concurrency tests before PILOT approval.

### Upload security

The current release is fail-closed:

- real-data upload mode is still `BLOCK`;
- file type, size and content signatures are validated;
- executable and macro-enabled Office types are not allowed;
- accepted formats are fingerprinted with SHA-256;
- real-data paths are tenant/deployment scoped;
- controlled PILOT `MANUAL_REVIEW` requires ADMIN authorization;
- review downloads use attachment/no-store/nosniff response controls;
- concurrent conflicting review decisions use an immutable transactional claim;
- unrestricted PRODUCTION requires verified automated scanner mode.

The separate controlled-pilot upload procedure defines the required human process. Manual review is explicitly not represented as malware scanning.

## Mandatory live security gates still outstanding

### SEC-035-01 — Firebase web/client Auth configuration — BLOCKED

Required configuration is not yet present on the canonical deployment. At minimum the registered Firebase web-app configuration must provide:

- `FIREBASE_WEB_API_KEY`;
- `FIREBASE_WEB_PROJECT_ID`;
- `FIREBASE_AUTH_DOMAIN`;
- optionally `FIREBASE_WEB_APP_ID`.

Until this is configured, the certification must remain BLOCKED for the live customer Auth gate.

### SEC-035-02 — Firebase Auth end-to-end certification — NOT RUN

Once client configuration exists, the synthetic certification must prove:

- test account creation;
- Email/Password sign-in;
- unverified identity state;
- verification-email OOB request acceptance;
- password-reset OOB request acceptance;
- session-cookie creation/verification;
- session revocation enforcement;
- test-user cleanup.

Separately, one human-controlled mailbox must verify actual verification/reset email delivery before the first real pilot customer. API acceptance alone does not prove inbox delivery/rendering.

### SEC-035-03 — anonymous Firebase rules checks — NOT RUN

The certification must prove that disposable RTDB, Firestore and Storage evidence cannot be read anonymously/publicly. A live Admin SDK connection does not prove client rules are deny-by-default.

### SEC-035-04 — tenant/role escalation — NOT RUN

The disposable live test must prove cross-tenant denial and each role threshold.

### SEC-035-05 — upload manual-review operational adoption — BLOCKED

The code supports MANUAL_REVIEW, but the live mode remains `BLOCK`. Do not change it until the controlled upload procedure has been adopted and the operator can execute it reliably.

### SEC-035-06 — backup/recovery verification — BLOCKED

The backup/PITR policy is now defined but live settings and recovery evidence have not been verified. Security approval therefore cannot treat data-recovery controls as complete.

## Temporary platform constraint encountered

After v0.35 was successfully deployed, the Vercel account reached its daily API deployment limit. A planned same-version deployment that would have used the existing Vercel build environment to invoke the protected certification internally could therefore not be created.

This does not affect the running v0.35 deployment or its security state; it only prevented using an additional deployment as an authenticated certification trigger in this session.

## Final security assessment

No source-level issue requires removing v0.35 from LAB. The application is correctly fail-closed and the protected certification mechanism is deployed.

**Do not set `FINCLOSE_SECURITY_REVIEW_APPROVED=YES` yet.** Final approval requires the live certification to pass the Auth, public-rules, tenant/role and concurrency gates, plus confirmation of the backup/recovery and controlled-upload operational controls.
