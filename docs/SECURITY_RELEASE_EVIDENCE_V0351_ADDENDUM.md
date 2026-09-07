# FinClose v0.35.1 Security Release Evidence Addendum

Date: 2026-09-07
Scope: controlled PILOT
Source release: `25242880b4c37d14bc4af4c2f85660ad9047be5e`
Status: SOURCE/CI PASS; LIVE P0 GATES STILL PENDING

This addendum supplements `SECURITY_RELEASE_EVIDENCE_V035.md`. It does not supersede the requirement for a successful protected live certification, backup/recovery evidence, controlled-upload adoption and human Auth delivery verification.

## Changes reviewed in v0.35.1

### Vercel masked-secret handling

Local Vercel environment pulls can expose a literal `[SENSITIVE]` placeholder for protected values. v0.35.1 now detects that condition explicitly instead of attempting to parse it as Firebase service-account JSON.

Security effect:

- masked/invalid credentials are treated as unavailable;
- local runtime readiness no longer falsely reports Firebase Admin/server Auth or Firestore as configured merely because a placeholder string exists;
- health diagnostics return a non-secret configuration error code;
- the production sensitive credential remains protected and is not downgraded or copied into source.

### Firebase Web App selection

The Web-config discovery selection logic is isolated and deterministic. CI covers:

- deleted Web Apps excluded;
- explicit Web App ID authoritative;
- single active Web App selected;
- unique FinClose/canonical-host match selected;
- ambiguous or absent candidates fail closed.

No API key, Admin access token or service-account credential is returned in discovery diagnostics.

### Firebase session revocation certification

The Auth certification now tolerates bounded Firebase propagation timing while remaining fail closed:

- verification accounts for the session/auth timestamp boundary;
- revoked-session checking retries only for a bounded interval;
- only recognized revocation/session-invalid error codes count as revocation success;
- unrelated Firebase/Auth errors do not satisfy the gate;
- a session that remains valid after the bounded window fails certification.

### Accounting wording cleanup

The stale message `authoritative PostgreSQL period lock was not created` was corrected to `authoritative Firestore period lock was not created`. The authoritative ledger/period-lock implementation was already Firestore; no accounting control semantics changed.

## CI evidence

PR #23 final head: `dc077acd10164aba368493623ac2290561c0e30f`
CI run: `34140534066`

Results:

- 9/9 deterministic hardening tests passed;
- full Next.js production build compiled successfully;
- type checking passed;
- build completed successfully.

## Remaining mandatory security evidence

The following remain P0 and must not be inferred from source/CI:

1. v0.35.1 deployed and live Firebase Web-config discovery verified.
2. Protected v0.35 certification executed successfully in LAB with zero mandatory FAIL/BLOCKED gates.
3. Anonymous RTDB/Firestore/Storage access denial verified live.
4. Tenant/role isolation and Firestore/upload concurrency gates verified live.
5. `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md` completed with overall PASS.
6. `CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md` adoption section completed with PASS.
7. `AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md` completed with overall PASS.
8. Final security and accounting-control approvals supported by the above evidence.

## Security approval rule

`FINCLOSE_SECURITY_REVIEW_APPROVED` must remain `NO` until the outstanding live and operational P0 evidence is complete. v0.35.1 reduces ambiguity and strengthens certification reliability; it does not by itself authorize real-data PILOT activation.
