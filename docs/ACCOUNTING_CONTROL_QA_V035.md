# FinClose v0.35 Accounting-Control QA

Date: 2026-09-07
Scope: controlled PILOT release review
Verdict: **SOURCE-LEVEL PASS; LIVE CERTIFICATION PENDING**

`FINCLOSE_ACCOUNTING_QA_APPROVED` must remain `NO` until the protected v0.35 live certification has executed successfully and the pilot operator has reviewed this evidence. This document is the source/control review, not the final live release attestation.

## 1. Journal integrity — PASS

The bookkeeping core rejects journals unless:

- each entry has an external ID, date, description and valid three-letter currency;
- each journal contains at least two lines;
- each line has either a debit or a credit, but not both/neither;
- debit and credit amounts are non-negative and rounded to cents;
- total debits equal total credits;
- journal currency matches batch currency;
- journal date falls inside the batch period;
- duplicate external journal IDs within a batch are rejected.

Execution remains `PREPARED_NOT_POSTED`; FinClose does not yet post these journals automatically into external accounting systems.

## 2. Bank-to-ledger reconciliation — PASS WITH DELIBERATELY CONSERVATIVE MATCHING

Automatic matching requires:

- equal signed amounts;
- date difference within three days;
- and a unique highest-confidence match based on normalized reference/date.

Tied candidates and contention for one ledger item are isolated as ambiguous rather than auto-matched. Unmatched bank/ledger items remain explicit exceptions.

This is appropriate for a controlled pilot because the engine favors false negatives/manual review over false-positive reconciliation.

## 3. Source completeness — PASS

Close source completeness is not accepted from a caller-provided `period_scope_complete` assertion. It is derived from:

- a separately configured expected-source registry;
- period evidence linked to stored FinClose source artifacts;
- same-deployment ownership validation;
- `RECEIVED` artifact status;
- SHA-256 artifact fingerprint presence;
- date coverage;
- sequence completeness;
- statement continuity where relevant.

A stored artifact that disappears, changes deployment, loses RECEIVED state or lacks its fingerprint cannot silently satisfy close completeness.

## 4. Balance-sheet reconciliation — PASS

The Layer A engine requires a configured balance-sheet account scope and at least one material account.

For each material account, approval readiness requires:

- a reconciliation entry;
- GL balance vs independent balance;
- evidence source IDs backed by verified stored source artifacts;
- reconciling items classified as `RESOLVED`, `ACCEPTED_TIMING` or `OPEN`;
- unexplained difference within configured tolerance;
- zero OPEN reconciling items.

Missing material reconciliations, stale evidence, unexplained differences outside tolerance, open reconciling items and a changed account-scope fingerprint block close approval.

## 5. Approval evidence binding — PASS

Monthly-close approval is gated by:

- core close-control status PASS;
- source completeness `SYSTEM_DERIVED_COMPLETE`;
- balance-sheet reconciliation PASS;
- no Layer A blockers.

Approval captures a deterministic SHA-256 evidence snapshot containing the core controls, source completeness and balance-sheet reconciliation state.

In real-data mode, approval evidence is written to the authoritative Firestore ledger with tenant/company ownership checks and deterministic/idempotent audit evidence.

## 6. Period locking — PASS AT SOURCE LEVEL; LIVE CONCURRENCY TEST REQUIRED

A period cannot be locked unless:

- the close is approved;
- Layer A remains ready;
- the evidence snapshot hash still equals the approved hash.

If evidence changes after approval, locking is rejected and re-approval is required.

For real-data mode, Firestore is the authoritative lock boundary. The lock transaction:

- verifies company/organization ownership;
- verifies the matching authoritative approval/evidence hash;
- reads one per-company active-lock state inside the transaction;
- rejects overlapping locked date ranges;
- creates the snapshot, lock, index, event and audit record transactionally.

The v0.35 certification harness separately exercises live Firestore concurrent idempotency and an overlapping-lock race; that test is mandatory before the final accounting QA flag may become YES.

## 7. Reopen control — PASS

Reopen requires:

- a currently locked close;
- a meaningful reason of at least 10 characters;
- authenticated real-data customer identity;
- authoritative Firestore lock ownership validation.

Reopening does not delete prior lock/approval history. It marks the lock reopened, removes it from active lock state, records events/audit evidence and invalidates the prior close approval workflow state. A reopened close requires a new close version before it can be approved again.

## 8. Authorization hierarchy — PASS AT SOURCE LEVEL; LIVE TENANT/ROLE TEST REQUIRED

API authorization currently requires:

- `ACCOUNTANT` for close source evidence, balance-sheet scope/reconciliation and accounting configuration;
- `APPROVER` for monthly-close approval and locking;
- `ADMIN` for reopening a locked close.

The v0.35 live certification must still prove cross-tenant denial and the VIEWER/ACCOUNTANT/APPROVER/ADMIN/OWNER hierarchy against the actual Firebase control plane.

### Segregation-of-duties boundary

FinClose does **not** currently require the APPROVER to be a different physical user from the ACCOUNTANT/preparer. That is acceptable for the initial solopreneur/small-company pilot where one owner may legitimately perform both roles, but it is not a full enterprise maker-checker control. Before marketing FinClose for larger organizations that require formal segregation of duties, add an optional policy requiring a distinct approver identity.

## 9. Payroll/bookkeeping execution boundary — PASS

The current control architecture deliberately stops short of higher-risk external actions:

- payroll remains prepared, not paid/filed;
- bookkeeping remains prepared, not posted to external accounting systems;
- FinClose does not lock periods in Xero, QuickBooks, DATEV or SmartAccounts;
- external payments and statutory filings remain disabled.

This materially limits pilot operational risk while the internal accounting evidence/close process is validated.

## 10. Findings requiring correction or follow-up

### QA-035-01 — stale database wording — LOW / truthfulness

`lockMonthlyClose` contains an error message stating that an "authoritative PostgreSQL period lock" was not created, while the implementation is Firebase Firestore-only. This does not change control behavior, but the wording is obsolete and should be corrected to "authoritative Firestore period lock" in the next source deployment.

### QA-035-02 — maker-checker not enforced — ACCEPTED PILOT BOUNDARY

As noted above, role thresholds exist but distinct preparer/approver user IDs are not enforced. Accepted for the defined solopreneur/small-company controlled pilot; revisit for multi-user enterprise deployments.

### QA-035-03 — live certification not yet executed — RELEASE BLOCKER

Source review and deterministic self-tests are not substitutes for the installed v0.35 live Firebase certification. The final accounting QA attestation remains blocked until that run proves:

- Firestore transaction idempotency;
- overlapping period-lock concurrency;
- tenant/role isolation;
- deterministic financial engine regression gates.

## Final source-level assessment

No source-level accounting-control defect was found that requires rollback of v0.35 or prevents keeping it deployed in LAB. The internal accounting/close architecture is suitable to proceed to **live controlled-pilot certification**, subject to the explicitly documented boundaries above.

Final pilot approval remains fail-closed until the live certification passes and the operator explicitly sets `FINCLOSE_ACCOUNTING_QA_APPROVED=YES` based on this source review plus live evidence.
