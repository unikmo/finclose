# FinClose — Accounting-Control QA Review

**Pilot-activation blocker P0 #7** (`accounting_control_qa` certification gate) · issue unikmo/finclose#21

| | |
|---|---|
| Release under review | FinClose `v0.35.2` |
| Source SHA | `6996db90439bc3889c51571cbd7981d621073e69` (bound to certification run `20260909080958_9a77588a3a`) |
| Scope | Controlled **PILOT** activation only (real data, one trusted customer, low volume). **Not** unrestricted PRODUCTION. |
| Reviewer | Claude (Sonnet 5), producing the written analysis + recommendation |
| Date | 2026-09-10 |
| Predecessor | `docs/ACCOUNTING_CONTROL_QA_V035.md` (2026-09-07, source-level PASS). **This document closes that review's live-evidence gap and re-confirms at the v0.35.2 SHA.** |

> **This document does not set `FINCLOSE_ACCOUNTING_QA_APPROVED`.** Claude produces the review; an operator/approver who is satisfied with the accounting controls must set the attestation flag. The certification gate stays `BLOCKED` until they do.

---

## 1. Why this review exists

The v0.35 accounting-control QA (`docs/ACCOUNTING_CONTROL_QA_V035.md`) reviewed the source and returned **source-level PASS** with three items left open:

- **QA-035-01** — stale "PostgreSQL period lock" wording in an error message (LOW / truthfulness).
- **QA-035-02** — maker-checker (distinct preparer vs approver) not enforced (ACCEPTED pilot boundary).
- **QA-035-03** — live Firebase certification not yet executed; final flag **blocked** until it proves Firestore idempotency, overlapping period-lock concurrency, tenant/role isolation, and the deterministic engine regression gates (**RELEASE BLOCKER**).

That certification has now run. This review resolves QA-035-01 and QA-035-03 and re-states QA-035-02.

---

## 2. Method

- Re-read the accounting-control source at the pinned SHA: `lib/bookkeeping-engine.ts`, `lib/finance-cycle-engine.ts`, `lib/close-governance-engine.ts`, `lib/payroll-engine.ts`, `lib/production-ledger.ts`, and the authorization paths in `app/api/[...path]/route.ts`.
- `git log` diff of the engine files since v0.35.0 — **no accounting-logic change after v0.35.1**; the v0.35.2 commits are release-gate binding, certification evidence and a deploy trigger only. The v0.35 source review therefore transfers intact.
- Executed the test suite: **19/19 pass**.
- Reviewed the live certification report (`cert-run6.json`, run `20260909080958`) for the four accounting-relevant gates.
- Spot-verified the journal-balance primitive (`lib/bookkeeping-engine.ts` L102–177): cent rounding with `Number.EPSILON`, debit-XOR-credit per line, `debitTotal !== creditTotal → 409`. Deterministic self-test asserts a balanced journal validates and an unbalanced one (100 vs 90) is rejected.

---

## 3. Live certification evidence — the four accounting gates

| Cert gate | Result | Evidence recorded |
|---|---|---|
| `firestore_idempotency_and_lock_concurrency` | **PASS** | Live Firestore: 6 concurrent retries produced **one** deterministic create; two overlapping close-locks → **1 accepted, 1 rejected**. |
| `tenant_role_isolation` | **PASS** | Live RTDB membership checks enforced cross-tenant denial and the `VIEWER<ACCOUNTANT<APPROVER<ADMIN<OWNER` hierarchy on disposable identities. |
| `deterministic_financial_engines` | **PASS** | Payroll, bookkeeping, finance-cycle and close-governance self-tests all pass. |
| `upload_review_concurrency` | **PASS** | Concurrent CLEAN/REJECTED review claims → one immutable persisted decision (supports the source-evidence integrity the close controls depend on). |

**QA-035-03 is resolved** — every live proof it demanded is now green, bound to source SHA `6996db9…` and to certification-evidence hash `13b86931…`.

---

## 4. Control-by-control assessment (re-confirmed at v0.35.2)

All ten areas from the v0.35 review were re-checked. No regression. Summary:

| # | Control | Assessment |
|---|---|---|
| 1 | **Journal integrity** | PASS. External ID + date + description + ISO currency required; ≥2 lines; debit XOR credit per line; non-negative, cent-rounded; Σdebits = Σcredits (exact after rounding); journal currency = batch currency; journal date within batch period; duplicate external IDs in a batch rejected. Stays `PREPARED_NOT_POSTED` — no auto-posting to external ledgers. |
| 2 | **Bank-to-ledger reconciliation** | PASS (deliberately conservative). Auto-match requires equal signed amount **and** ≤3-day date gap **and** a unique highest-confidence candidate. Ties / contested ledger items are isolated as ambiguous, not matched. Favours manual review over false-positive matches — correct for a pilot. |
| 3 | **Source completeness** | PASS. Not taken from a caller assertion — derived from a configured expected-source registry + period evidence linked to stored `RECEIVED` artifacts with same-deployment ownership, SHA-256 fingerprint, date coverage, sequence and statement continuity. An artifact that vanishes, moves deployment, loses RECEIVED or loses its fingerprint cannot silently satisfy completeness. |
| 4 | **Balance-sheet reconciliation (Layer A)** | PASS. Requires a configured account scope with ≥1 material account; per account: reconciliation entry, GL vs independent balance, evidence source IDs backed by verified stored artifacts, reconciling items classified RESOLVED / ACCEPTED_TIMING / OPEN, unexplained difference within tolerance, **zero OPEN items**. Stale evidence, out-of-tolerance differences, open items or a changed scope fingerprint block approval. |
| 5 | **Approval evidence binding** | PASS. Approval gated on core-control PASS + source completeness `SYSTEM_DERIVED_COMPLETE` + balance-sheet PASS + no Layer A blockers. Captures a deterministic SHA-256 snapshot of controls + completeness + reconciliation state. In real-data mode written to authoritative Firestore with tenant/company ownership checks and idempotent audit evidence (`recordCloseApproval`). |
| 6 | **Period locking** | PASS — **and the live concurrency proof QA-035-03 required is now green**. Lock requires approved close + Layer A still ready + evidence hash still equals the approved hash. Firestore transaction verifies ownership, matches the authoritative approval/evidence hash, reads the single per-company active-lock state inside the transaction, rejects overlapping locked ranges, and writes snapshot + lock + index + event + audit atomically. |
| 7 | **Reopen control** | PASS. Requires a locked close + a ≥10-char reason + authenticated real-data identity + Firestore lock-ownership validation. Prior lock/approval history is preserved; the lock is marked reopened and removed from active state; a reopened close needs a new close version before re-approval. |
| 8 | **Authorization hierarchy** | PASS — **live tenant/role proof now green**. `ACCOUNTANT` for source evidence / balance-sheet scope+reconciliation / accounting config; `APPROVER` for approve + lock; `ADMIN` for reopen. Every real-data branch resolves org/deployment/company ownership before acting. |
| 9 | **Payroll / bookkeeping execution boundary** | PASS. Payroll is prepared, not paid/filed. Bookkeeping is prepared, not posted to Xero / QuickBooks / DATEV / SmartAccounts. FinClose locks no external periods. External payments and statutory filings are disabled. This is the single biggest limiter of pilot financial risk. |
| 10 | **Deterministic engines** | PASS. Payroll (GE basic), bookkeeping core, finance cycle, monthly-close controls, source completeness, balance-sheet reconciliation, close approval + period lock — all self-tests green in source and live. |

---

## 5. Findings

### QA-2-01 — QA-035-01 (stale PostgreSQL wording) is **FIXED** — no action

Commit `d4c4ea8` ("Correct Firestore period-lock error wording") corrected it. A repo-wide search for `postgres` / `PostgreSQL` at the review SHA returns **zero matches**. Closed.

### QA-2-02 — maker-checker not enforced — **ACCEPTED PILOT BOUNDARY** (carried from QA-035-02)

Role thresholds exist (`APPROVER` to approve/lock) but nothing requires the approver to be a **different user** from the preparer/accountant. For the defined solopreneur / small-company pilot where one owner legitimately performs both roles, this is acceptable and expected.

- **Condition:** state this plainly in the pilot customer agreement.
- **Before any multi-user customer:** add an org-level policy option requiring a distinct approver identity. Tracked as a backlog item (also raised as F-5 in the security review).

### QA-2-03 — no independent recomputation of customer-supplied balances — **INFORMATIONAL / by design**

The balance-sheet engine compares a customer-entered "independent balance" against the GL balance and checks the unexplained difference is within tolerance with zero open items. It does not itself re-derive the independent balance from primary source documents — that is the human reconciler's job, and the engine correctly requires evidence source IDs backed by verified stored artifacts. This is the right division of labour for the product; noting it so the approver understands the engine assures **process and evidence completeness**, not arithmetic truth of externally-asserted figures.

### QA-2-04 — engines are single-country-pack depth — **INFORMATIONAL**

Payroll rule packs and country requirements cover US / DE / GB / EE / GE / CM at "basic" depth. Fine for a pilot scoped to one customer in one jurisdiction; the pilot customer's country pack should be spot-checked against current local rules before their first real close.

---

## 6. Recommendation to the approver

> The FinClose `v0.35.2` accounting-control architecture is **suitable for a controlled pilot**. Journal integrity, source-completeness derivation, balance-sheet reconciliation gating, approval-evidence binding, period locking and reopen controls are well designed, deterministic, and — as of certification run `20260909080958` — backed by passing **live** Firestore idempotency / concurrency / tenant-role evidence bound to source SHA `6996db9…`. The prepared-not-posted execution boundary materially caps pilot risk.
>
> The v0.35 review's release blocker (QA-035-03) is resolved. QA-035-01 is fixed. The one remaining item, maker-checker (QA-2-02), is an accepted boundary for a single-operator pilot and must be recorded in the customer agreement and added to the backlog for multi-user use.
>
> If you (a) confirm the pilot is scoped to a single-operator / small-company customer where combined preparer+approver is acceptable, (b) commit to the maker-checker backlog item before onboarding any multi-user customer, and (c) spot-check the pilot customer's country payroll/requirements pack before their first real close, then it is reasonable to set `FINCLOSE_ACCOUNTING_QA_APPROVED=YES`.
>
> **This flag must be set by a human who has read this review — not by Claude.**

---

### Approver decision (Tichi Mbanwie, 2026-09-10)

`FINCLOSE_ACCOUNTING_QA_APPROVED=YES` set on the following basis:

- **(a) Confirmed** — the pilot is a single-operator / small-company context where one person legitimately both prepares and approves the close.
- **(b) Recorded as a hard backlog gate** — an org-level "approver ≠ preparer" policy must be added before onboarding any customer with multiple finance users. Tracked alongside security finding F-5.
- **(c) Recorded as a pre-close operational check** — the pilot customer's country payroll / requirements pack is to be spot-checked against current local rules before their first real month-end close.

---

## 7. On committing this record

Once countersigned, commit to `docs/evidence/ACCOUNTING_CONTROL_QA_V0352.md` alongside the v0.35 source review, the security review, and the backup/recovery and auth-email evidence. Reference the source SHA and certification run id in the commit message.
