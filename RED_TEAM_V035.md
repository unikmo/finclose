# Independent Red Team — FinClose v0.35 Pilot Release Verification & Activation

Date: 2026-09-07
Scope: PR #20 / `feature/pilot-release-verification-v035-active`

## Verdict

**PASS FOR SOURCE MERGE AND LAB DEPLOYMENT.**

**PILOT ACTIVATION REMAINS BLOCKED UNTIL A LIVE CERTIFICATION REPORT HAS ZERO MANDATORY FAIL/BLOCKED GATES.**

## What v0.35 improves

1. Release verification is executable rather than checklist-only.
2. Certification runs before activation while runtime remains LAB, avoiding circular logic where PILOT must already be enabled to prove PILOT is safe.
3. Live Firebase tests use disposable synthetic `finclose_cert_*` records and clean them up after each gate.
4. The protected certification endpoint reuses the internal Lab secret and is not publicly invokable without authorization.
5. Live tests cover RTDB/Firestore/Storage round trips, anonymous-access denial, tenant/role isolation, Firestore transaction idempotency, overlapping-period-lock races, upload-review decision races and deterministic accounting engines.
6. Firebase Auth becomes a mandatory BLOCKED gate until the web/client API configuration exists; the source does not treat server Admin credentials alone as proof of customer authentication readiness.
7. Manual operational evidence is represented as explicit mandatory gates rather than prose: backup/PITR, independent security review, accounting-control QA and the trusted-source manual upload-review procedure.
8. `FINCLOSE_UPLOAD_QUARANTINE_MODE=BLOCK` correctly prevents the certification from declaring a controlled pilot ready.
9. `FINCLOSE_PRODUCTION_RELEASE_GATE` is independently checked and must remain blocked during pilot certification.
10. The public v0.35 health endpoint exposes only certification summary/hash, not credentials, tokens or detailed security evidence.

## Remaining release blockers expected on the current environment

Based on the verified v0.34 live state immediately before this release:

- Firebase server Auth credentials are present, but Firebase web/client Auth configuration is incomplete.
- Upload quarantine mode is still `BLOCK`, not `MANUAL_REVIEW`.
- The v0.35 manual release-attestation flags have not yet been approved.
- Therefore the first certification run is expected to be BLOCKED even if infrastructure, rules, concurrency and engine gates pass.

That is the intended result; v0.35 must not silently convert missing operational evidence into a pass.

## Important interpretation boundary

The Auth certification verifies Firebase account creation, Email/Password API sign-in, acceptance of verification/password-reset OOB requests, session-cookie validation and revocation. An accepted OOB request is evidence that Firebase accepted the flow, but it is not proof that a real mailbox received and rendered the email correctly. Before onboarding a real pilot customer, perform one human end-to-end verification/reset email delivery check using a controlled test mailbox and retain that evidence with the release record.

The Firestore concurrency tests use disposable certification collections but exercise the same live Firestore transaction semantics and overlapping-range control pattern used by the authoritative ledger. They supplement, not replace, post-activation smoke testing of the actual real-data API path.

## Release recommendation

Merge v0.35 after CI passes. Deploy it to the canonical Vercel project **without changing `FINCLOSE_RUNTIME_MODE=LAB` or approving the pilot latch**. Run the protected certification, resolve every mandatory blocker, rerun it, and only then perform a controlled deployment that changes both the runtime to `PILOT` and the pilot release latch to `APPROVED`. Keep PRODUCTION blocked.
