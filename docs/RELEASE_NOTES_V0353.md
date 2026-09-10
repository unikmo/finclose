# FinClose v0.35.3 — certification evidence hash fix

## Fix

**The release-bound pilot certification could never validate its own evidence in PILOT / PRODUCTION.**

`computePilotCertificationEvidenceHash` (and the equivalent inline hash in `runPilotCertification`) hashed a plain `JSON.stringify` of the certification report. Each gate's `detail` object is an arbitrary nested shape, and Firebase Realtime Database does not preserve object key order on read. So the hash computed when the report was written (and stored as `evidence_hash`) did not match the hash recomputed by `validatePilotCertificationEvidence` after reading the report back from RTDB.

In LAB this was invisible because `getPilotReleaseEvidenceStatus` is not enforced there. On PILOT activation it surfaced immediately as `real_data_release_evidence.ready: false` / code `PILOT_CERTIFICATION_HASH_MISMATCH`, and `assertRealDataReleaseCertified()` returned 503 on every authenticated real-data request — i.e. the pilot could be "activated" but no real customer data could flow.

### Change

- New `canonicalJSONStringify()` in `lib/pilot-release-evidence.ts` — recursively sorts object keys before serialization, so the digest is stable across a Firebase RTDB write/read round-trip.
- Both evidence-hash sites (`computePilotCertificationEvidenceHash` and the inline hash in `lib/pilot-certification.ts`) now use it.
- New regression tests: key-order insensitivity, and end-to-end evidence validation after a simulated RTDB read round-trip (with a gate that carries a `detail` object).

### Operational note

The hash scheme changed, so **any certification run produced before v0.35.3 no longer validates**. After deploying v0.35.3, run a fresh `POST /api/pilot-certification` **while still in LAB**, then confirm `GET /api/health?deep=1` reports `real_data_release_evidence.ready: true` before setting `FINCLOSE_RUNTIME_MODE=PILOT`.

No change to gate logic, thresholds, or what the certification checks.
