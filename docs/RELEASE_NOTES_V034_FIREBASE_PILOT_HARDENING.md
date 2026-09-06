# FinClose v0.34 — Firebase pilot activation hardening

Date: 2026-09-06

## What changed

- Added explicit PILOT and PRODUCTION release latches; runtime mode alone cannot authorize real-data use.
- Added quarantine-first real-data upload modes: `BLOCK`, controlled-pilot `MANUAL_REVIEW`, and verified `SCANNER`.
- Added ADMIN-only quarantine download/review endpoints.
- Made manual upload-review decisions concurrency-safe and immutable using transactional review claims and idempotent side effects.
- Added Firebase email verification and password-reset flows.
- Added recent-auth session exchange, revocation-aware session checks and authentication rate limiting.
- Prevented unverified managed accounts from entering real financial-data operations.
- Made deep health fail when a real-data release blocker is still present.
- Tightened the Firebase pilot activation checklist.

## Release boundary

v0.34 is **source-ready for merge after CI** but is **not authorization to activate PILOT**.

The canonical deployed FinClose runtime must remain `LAB` until the actual Firebase/Vercel environment passes the mandatory checks in `docs/FIREBASE_PILOT_RELEASE_GATE.md`. In particular, Firestore/Auth/rules, tenant isolation, role escalation, session revocation, locked-period concurrency and controlled upload handling require live verification.

`PRODUCTION` remains blocked. A verified automated malware scanner is required before unrestricted production uploads.
