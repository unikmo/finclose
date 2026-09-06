# Independent Red Team — FinClose v0.34 Firebase pilot activation hardening

Date: 2026-09-06
Scope: `feature/firebase-pilot-activation-v034` / PR #19

## Verdict

**PASS FOR SOURCE MERGE AFTER CI.**

**BLOCK PILOT ACTIVATION UNTIL LIVE FIREBASE/Vercel RELEASE QA PASSES.**

v0.34 materially improves the v0.33 Firebase-only foundation by adding an explicit release latch, stronger managed-account flows, quarantine-first real-data uploads and an ADMIN-only review path. The source remains deliberately fail-closed: real-data mode is not considered ready merely because `FINCLOSE_RUNTIME_MODE` is changed.

## Controls that materially improved

1. `PILOT` and `PRODUCTION` require separate explicit release-gate approval variables in addition to runtime mode.
2. Production upload handling requires verified automated scanner mode; manual review is permitted only as a controlled-pilot boundary.
3. Real-data uploads are stored under tenant/deployment-scoped quarantine paths and do not advance onboarding or agent readiness while quarantined.
4. Manual review downloads require ADMIN authorization and are returned with attachment, no-store and nosniff controls.
5. Upload review decisions now use an RTDB transactional review claim and lease so concurrent CLEAN/REJECTED decisions cannot race with last-writer-wins semantics.
6. Review side effects are applied by one lease holder through an atomic multi-location RTDB update, with a deterministic audit record and idempotent terminal-state behavior.
7. Managed Firebase accounts gain email verification, password-reset support, recent-auth session exchange, revocation checks and application-level authentication rate limiting.
8. Unverified Firebase accounts cannot enter real financial-data operations.
9. Deep health reports a failed real-data release state when configuration/release blockers remain.

## Red-team finding fixed before merge

### P0-quality source issue — concurrent upload review race

The initial v0.34 branch read a `QUARANTINED` artifact and then wrote CLEAN/REJECTED through a non-transactional multi-location update. Two admins could therefore review the same artifact concurrently and allow the last write to win, contradicting the immutable-review contract.

The branch was corrected before merge. Each artifact now has a deterministic transactional review claim. A conflicting decision is rejected, one request holds the side-effect lease, failed applications release the lease for retry, stale leases can be recovered, and the successful terminal update marks the claim applied atomically with the artifact/deployment/audit effects.

## Remaining blockers before `PILOT`

### P0 — Live Firebase platform proof

- Firebase Email/Password Authentication must be enabled and exercised in `theantibalcony`.
- Firestore must be enabled and reachable from the deployed Vercel service account.
- Firestore, RTDB and Storage deny-by-default client rules must be deployed and verified live.
- Backup/PITR and administrative-access controls must be selected for pilot financial evidence.

### P0 — Real-data security and financial-control QA

- Tenant A/B isolation must be tested against the deployed environment.
- VIEWER/ACCOUNTANT/APPROVER/ADMIN/OWNER escalation attempts must be tested.
- Session revocation and unverified-email denial must be tested end to end.
- Concurrent close approval/lock/reopen and locked-period write attempts must be tested against real Firestore.
- Deterministic payroll/bookkeeping evidence and retry idempotency must be verified live.

### P0 — Controlled upload procedure

- Default upload mode remains `BLOCK` until the release gate is explicitly approved.
- A controlled pilot may use `MANUAL_REVIEW` only for trusted-source files with a documented human handling procedure.
- Manual review is not equivalent to malware scanning. Unrestricted production uploads remain blocked until a real scanner worker, failure/timeout behavior and scanner verification are independently tested.

## P1 risks

- The application authentication rate limit is email/action based. It reduces brute force but can also be abused to temporarily rate-limit a targeted account; add trusted request/network dimensions before unrestricted production.
- Firebase Admin bypasses client security rules, so server-side tenant checks remain security-critical and need regression coverage.
- Manual review downloads still expose the reviewer to the submitted file; controlled pilot handling should use trusted sources and an isolated inspection procedure.
- RTDB remains the workflow/control plane while Firestore is authoritative for real financial evidence. Any disagreement must continue to resolve in favor of Firestore for ledger/close truth.
- External OAuth connectors, payment execution, statutory filing and external accounting-system period locks remain outside this release.

## Release recommendation

Merge v0.34 after the final CI build succeeds. Keep the deployed runtime in `LAB`. Deploy the source to the canonical FinClose Vercel project, verify `/api/health?deep=1`, then complete every item in `docs/FIREBASE_PILOT_RELEASE_GATE.md` against the actual Firebase/Vercel environment before setting `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` or onboarding any real-data pilot customer.
