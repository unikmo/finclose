# FinClose v0.32 — Independent Red Team Review

Date: 2026-09-06
Scope: Layer A close governance only
Verdict: **PASS FOR SYNTHETIC LAB / BLOCK REAL PRODUCTION**

## Reviewed change

Layer A adds source-completeness controls, material balance-sheet reconciliation, evidence-bound close approval, internal period locking, reopen/version handling, and period-lock enforcement in payroll/bookkeeping/finance-cycle preparation.

## Findings resolved before release

1. **Approval evidence hash instability — FIXED.** The first design risked hashing volatile evaluation timestamps. Approval and lock now compare a deterministic control snapshot rather than volatile metadata.
2. **Reopened close could become re-approvable — FIXED.** A reopened close is terminal as `REOPENED_REQUIRES_NEW_CLOSE`; a new close version is required.
3. **Reopen idempotency/version lineage — FIXED.** Reopened periods generate a versioned finance-cycle/close identity and preserve supersession lineage instead of silently returning or overwriting the original close.
4. **Bookkeeping lineage overwrite on reused batches — FIXED.** Bookkeeping batches now keep latest links plus per-finance-cycle lineage rather than replacing a single original link.
5. **Balance-sheet scope drift after reconciliation — FIXED.** Reconciliation stores a scope fingerprint; a changed scope blocks approval/lock until reconciliation is rerun.
6. **Locked-close evidence mutability — FIXED.** Approval and lock store the evidence snapshot; locked close-specific evaluations are not rewritten without reopening.
7. **Deprecated `period_scope_complete` affected finance-cycle identity — FIXED.** The caller attestation remains compatibility metadata only and no longer drives approval or cycle identity.
8. **Reconciling-item input validation — FIXED.** Invalid statuses and duplicate item IDs are rejected rather than silently accepted.

## Remaining production blockers

### P0 — Production identity and authority
The current Lab account/session bridge is not sufficient to establish real close-approval authority. Production use requires managed authentication, tenant/company authorization, explicit approver roles, and separation-of-duties policy.

### P0 — Authoritative ledger architecture
Firebase RTDB remains a Lab persistence layer, not the approved accounting ledger. Production close/lock records require the final authoritative relational/ledger architecture and immutable accounting-grade audit controls.

### P1 — Concurrent irreversible actions
Approval, lock and reopen use guarded reads plus multi-location writes, but they are not yet serialized by a database transaction/compare-and-set mechanism. Concurrent production requests must be protected against double approval/lock/reopen races.

### P1 — Manual-upload completeness strength
For secure file upload, FinClose independently verifies artifact existence, ownership and SHA-256 fingerprints and evaluates configured coverage/sequence expectations. It cannot independently prove that the human-declared coverage window itself is complete. Strong independent completeness requires connector-native sync cursors/statement metadata or another authoritative source-population proof.

### P1 — Balance-sheet population completeness
The engine requires every material account in the configured balance-sheet scope to reconcile and fingerprints that scope. Production use still needs an authoritative trial-balance/chart-of-accounts population feed so FinClose can prove that no material balance-sheet account was omitted from the configured scope.

### P1 — External provider period lock
The internal FinClose lock is implemented. It does not lock periods inside Xero, QuickBooks, DATEV or SmartAccounts; those provider-specific actions belong to the external connector layer.

## Control conclusion

The Layer A architecture is materially stronger than v0.31 and is appropriate for synthetic end-to-end testing. It must not be represented as a production-grade statutory close until the P0/P1 production blockers above are closed and independently QA'd.
