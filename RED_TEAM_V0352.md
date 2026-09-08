# FinClose v0.35.2 — Independent Release Red Team

Date: 2026-09-08
Scope: Firebase-only controlled PILOT release integrity
Review target: PR #27 (`pilot-release-hardening-v0352`)

## Verdict

**CONFIRM WITH CONDITIONS**

The v0.35.2 hardening is the correct direction and should replace the v0.35.1 pre-activation release boundary before any real-data PILOT switch. The release must remain in `LAB` until every condition at the end of this review is proven live.

## Challenge 1 — Was the earlier `release_gate_approved=true` live observation proof that the PILOT latch had already been approved?

**No.**

The prior `runtime-mode.ts` implementation returned `true` for `release_gate_approved` whenever the runtime was `LAB`. Therefore the live v0.35.0 health field was ambiguous and did **not** prove that `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` had been configured.

v0.35.2 corrects the observability problem by:

- returning `release_gate_approved=false` in `LAB`;
- exposing `pilot_release_gate_approved` separately;
- exposing `production_release_gate_approved` separately.

This correction prevents a misleading health field from becoming release evidence.

## Challenge 2 — Could configuration alone activate PILOT without a successful certification?

**Before this change: yes, at the runtime-config layer.**

The v0.35.1 certification procedure correctly required a clean pre-activation certification, but the real-data ingress gate itself only checked environment/configuration readiness. An operator could theoretically set `PILOT`, approve the latch and satisfy the other configuration values without the application independently re-reading a clean stored certification report.

v0.35.2 closes that gap by requiring persisted certification evidence at managed-auth and authenticated real-data ingress.

## Challenge 3 — Could an already-issued real-data session continue after the release gate was withdrawn?

**This was an avoidable risk.**

The previous managed-auth flow checked runtime readiness during login/registration/session creation, but the authenticated request path did not independently recheck the real-data release state.

v0.35.2 rechecks both runtime configuration and release certification on every authenticated real-data request. Withdrawing the latch or invalidating the release evidence therefore fail-closes subsequent protected requests.

## Challenge 4 — Could an old certification be reused for changed code?

**Version-only binding is insufficient if code changes without a version bump.**

v0.35.2 therefore requires an exact 40-character release source SHA from `VERCEL_GIT_COMMIT_SHA` or the controlled fallback `FINCLOSE_RELEASE_SOURCE_SHA`. The certification report is bound to both:

- FinClose release/certification version; and
- exact Git source SHA.

A PILOT runtime whose source identity differs from the pre-activation certification fails closed.

## Challenge 5 — Was matching the stored evidence hash to the latest pointer sufficient?

**No.**

Pointer equality alone can detect some partial writes but does not independently prove that the stored gate payload still matches its hash.

v0.35.2 recomputes the SHA-256 evidence hash from the persisted release version, source SHA, run ID and complete gate evidence before accepting the certification.

## Challenge 6 — Did the automated Firebase OOB API test prove customer email delivery?

**No.**

Firebase accepting verification/password-reset OOB requests does not prove delivery to a real mailbox, link usability, branding or the resulting user flow. The repository already contained `AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md` as a human P0 record.

v0.35.2 adds `FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED=YES` as a mandatory release-completion gate. It may be set only after both verification and password-reset flows pass against a controlled real mailbox.

## Challenge 7 — Did existence of the upload procedure prove that a human operator had actually adopted it?

**No.**

A documented procedure and an operating checklist are different controls. v0.35.2 adds `FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED=YES` as a separate mandatory completion gate.

## Remaining limitations intentionally preserved

The controlled PILOT release does **not** certify unrestricted production. In particular:

- unrestricted production uploads still require a verified automated scanner;
- external accounting-system posting/locking is not automatically enabled by PILOT;
- payroll payments and statutory filings remain outside the current execution boundary;
- `FINCLOSE_PRODUCTION_RELEASE_GATE` must remain blocked.

These are separate implementation/release tracks, not reasons to weaken the PILOT controls.

## Mandatory conditions before merge/activation

1. PR #27 deterministic tests and production build pass.
2. v0.35.2 is deployed to the canonical Vercel runtime while still in `LAB`.
3. Exact source identity is present and matches the deployed v0.35.2 source.
4. Firebase Web Auth configuration becomes ready and Email/Password Auth passes live certification.
5. Effective anonymous RTDB/Firestore/Storage denial passes live certification.
6. Backup/PITR/restore evidence is completed before its verification flag becomes `YES`.
7. Human Auth email-delivery record passes before its verification flag becomes `YES`.
8. Controlled upload operator adoption passes before its verification flag becomes `YES`.
9. Security and accounting-control approvals are backed by their actual evidence records.
10. Protected certification reports zero mandatory `FAIL` and zero mandatory `BLOCKED` gates and `activation_allowed=true`.
11. Only then may `FINCLOSE_RUNTIME_MODE=PILOT` and `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` be deployed together.
12. Immediate live post-activation verification must pass; otherwise revert to `LAB` + blocked pilot latch.

## Final Red Team result

**CONFIRM WITH CONDITIONS.** No condition above may be replaced by source-code presence, a successful deployment status, or an unverified environment flag.
