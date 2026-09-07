# FinClose v0.35.1 — Hardening Release Notes

Date: 2026-09-07
Source commit: `25242880b4c37d14bc4af4c2f85660ad9047be5e`
Runtime activation state: LAB only; PILOT/PRODUCTION gates unchanged

## Purpose

v0.35.1 is a contained pre-pilot hardening release. It adds no new accounting/payroll jurisdiction, connector, customer-facing product scope or release permission.

## Included

- explicit handling of Vercel local `[SENSITIVE]` placeholders for Firebase service-account credentials;
- fail-closed runtime readiness for masked/invalid Firebase Admin credentials;
- deterministic Firebase Web App selection module and tests;
- bounded, code-specific Firebase session-revocation verification in the pilot certification harness;
- CI execution of deterministic hardening tests before the normal production build;
- corrected Firestore period-lock error wording;
- health/runtime diagnostics remain non-secret;
- release identifier updated to `0.35.1` for live deployment verification.

## CI evidence

Final PR #23 head: `dc077acd10164aba368493623ac2290561c0e30f`
GitHub Actions run: `34140534066`

- deterministic hardening tests: PASS (9/9)
- Next.js production compile: PASS
- type checking: PASS
- overall CI: PASS

## Operational evidence pack

Prepared after the source merge to make remaining P0 checks reproducible:

- `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`
- `CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md`
- `AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md`
- `PILOT_RELEASE_SIGNOFF_V0351.md`
- `SECURITY_RELEASE_EVIDENCE_V0351_ADDENDUM.md`

These records are templates until completed against the real environment. Their existence does not satisfy a release gate.

## Unchanged safety boundaries

- `FINCLOSE_RUNTIME_MODE=LAB`
- `FINCLOSE_PILOT_RELEASE_GATE=BLOCKED`
- `FINCLOSE_PRODUCTION_RELEASE_GATE=BLOCKED`
- upload quarantine remains `BLOCK` until controlled-pilot operator adoption and the rest of the P0 release evidence are complete
- no automated malware scanner is claimed
- no backup/PITR verification is claimed
- no live certification is claimed

## Next release action

Once a v0.35.1 runtime is available, verify the live version and Firebase Web-config discovery, then run the protected v0.35 certification while still in LAB. Only after all automated and manual P0 gates pass may controlled PILOT activation be considered.
