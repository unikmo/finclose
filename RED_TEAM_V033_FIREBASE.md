# Independent Red Team — FinClose v0.33 Firebase-only production foundation

Date: 2026-09-06
Scope: `feature/production-foundation-v033d`

## Verdict

**PASS FOR MERGE AS THE CANONICAL FIREBASE-ONLY FOUNDATION.**

**BLOCK PILOT ACTIVATION UNTIL THE ACTUAL FIREBASE PROJECT AND remaining security controls are verified.**

The source architecture no longer depends on PostgreSQL or Supabase. The Vercel application uses Firebase Authentication, Realtime Database, Cloud Firestore and Firebase Cloud Storage in the same Firebase project boundary.

## Controls that materially improved

1. Customer real-data identity is separated from the Lab scrypt/token bridge.
2. Organization/company tenancy replaces email-address ownership as the real-data authorization boundary.
3. Close approval requires an approver role and reopening requires an admin role.
4. Cloud Firestore is the authoritative real-data ledger/evidence store.
5. Firestore transactions enforce idempotent authoritative writes and serialize period-lock state per company.
6. The active company lock state is checked when payroll/bookkeeping/finance-cycle evidence is recorded.
7. Close approval evidence, lock evidence and reopen events are retained as separate records.
8. Direct browser access to Firestore and Storage is denied by rules; server writes use Firebase Admin.
9. Financial uploads are tenant-path scoped, fingerprinted and content-signature validated.
10. Supabase/PostgreSQL dependencies, schema migrations and connection-string configuration have been removed.

## Remaining blockers before `PILOT`

### P0 — Firebase project activation and live proof

- Cloud Firestore must actually be enabled in `theantibalcony` and reachable with the Vercel service account.
- Firebase Email/Password Authentication and the web-app configuration must be enabled/verified.
- Firestore deny-by-default rules and existing Storage/RTDB rules must be deployed and checked live.
- `FINCLOSE_RUNTIME_MODE` must stay `LAB` until these checks pass.

### P0 — Upload malware/quarantine control

File type, size, extension and magic bytes are validated, but malware scanning is not integrated. Unrestricted customer file upload must remain blocked until a Firebase/Google-backed quarantine-and-scan workflow or equivalent controlled pilot procedure exists.

### P0 — Real-data release QA

Tenant-isolation, authorization escalation, session revocation, concurrent approve/lock/reopen and locked-period write attempts need integration tests against the real Firebase project, not only compile/self-tests.

## P1 risks

- Firebase Admin bypasses Firestore security rules, so server-side tenant checks remain security-critical and require regression tests.
- Application-level append-only records are not equivalent to external WORM storage; backup/PITR and administrative-access controls are still required.
- The controlled-pilot journal shape embeds journal lines in each Firestore journal document and deliberately caps journal size/line count. High-volume ledger sharding is a later scale requirement.
- The per-company active-lock-state document is suitable for close-frequency writes but would be a hotspot if reused for high-frequency transaction posting.
- Existing Realtime Database workflow state is still a mirror/control plane. Real-data financial evidence and close locks must treat Firestore as authoritative when the two stores disagree.
- Password reset, email-verification UX, abuse/rate limiting and organization invitation/admin workflows still need completion before unrestricted production.
- External connector OAuth/token vault, payment execution, statutory filing and external provider period locks remain separate release scopes.

## Release recommendation

Merge v0.33 source after normal CI. Do **not** label the live product `PILOT` merely because the code is deployed. Activation requires live Firebase configuration, security testing, controlled real-data acceptance criteria and post-release verification.
