# FinClose v0.31 — Independent Red Team

Date: 2026-09-06
Scope: Payroll run → payroll journal → bookkeeping → bank reconciliation → monthly-close control handoff.

## Verdict

**PASS WITH MATERIAL LIMITS — SYNTHETIC LAB ONLY**

The v0.31 change closes the previous orchestration gap without pretending that FinClose can yet post, pay, file, lock a period or certify a production accounting close. The implemented object is a deterministic finance-cycle/control package, not an autonomous production close.

## What was challenged

### 1. Payroll → bookkeeping account translation

Risk: silently inventing chart-of-accounts codes would make a mechanically balanced journal accounting-incorrect.

Control implemented:
- all payroll journal roles require explicit account mapping;
- the V1 roles are salary expense, employer pension expense, net-payroll payable, income-tax payable, pension payable and bank/cash;
- missing mappings fail before a new payroll run is prepared through the orchestration path.

Result: acceptable for the Lab. Company-specific account mapping still needs a governed source and approval workflow before real use.

### 2. Payroll settlement accounting

Risk: treating a payroll accrual as if cash had already moved, or clearing the wrong liability.

Control implemented:
- payroll recognition journal remains accrual/payable based;
- supplied settlement events separately debit the selected payroll liability and credit bank/cash;
- bank-reconciliation cash items are derived from those settlement events;
- over-settlement becomes a close exception;
- unpaid payroll liabilities are permitted at period end and reported rather than falsely treated as errors.

Result: correct control direction for a first orchestration layer.

### 3. Bank reconciliation

Risk: declaring a close because journals balance even though cash does not reconcile.

Control implemented:
- v0.31 reuses the conservative v0.30 reconciliation engine;
- ambiguous and unmatched bank/ledger items block the close-control pass;
- a separate statement-closing-balance versus ledger-closing-balance check is mandatory for a controls-pass result.

Result: materially stronger than transaction matching alone.

### 4. Monthly-close completeness

Risk: a payroll-derived batch could be called a complete monthly close despite missing non-payroll activity.

Control implemented:
- `period_scope_complete` must be explicitly true before controls can pass;
- lack of the attestation is an exception;
- broader balance-sheet reconciliations are explicitly listed as unimplemented;
- even a clean result remains `CONTROLS_PASS_APPROVAL_REQUIRED` and `PREPARED_NOT_CLOSED`.

Result: the implementation does not silently equate this pipeline with a final accounting close.

### 5. Idempotency and ordering

Risk: the same logical cycle supplied in a different array order could generate a different finance-cycle fingerprint.

Finding during review: the first implementation preserved input-array ordering in the finance-cycle fingerprint.

Correction made before merge:
- stable fingerprinting now recursively sorts object keys and array values for cycle identity;
- payroll lineage fields are explicitly `latest_*` where a later cycle may supersede an earlier attempt.

Result: acceptable for sequential synthetic Lab execution.

## Material limitations

### P1 — source completeness is still asserted, not independently proven

`period_scope_complete` is caller-supplied. Until connectors can prove that all relevant source streams and documents were ingested, the monthly-close engine cannot independently establish completeness.

**Production requirement:** source manifests, connector cursors/checkpoints, missing-document controls and completeness evidence.

### P1 — bank reconciliation is not the whole balance-sheet close

The control package checks journal balance, bank transaction reconciliation and one closing-bank-balance comparison. It does not yet perform AP, AR, tax, payroll-liability, fixed-asset, prepayment, accrual, intercompany or other balance-sheet reconciliations.

**Production requirement:** account-class close controls and evidence-backed reconciliation schedules.

### P1 — no posting, approval or period lock

The chain prepares records only. There is no external posting, formal reviewer approval, immutable close sign-off or period lock.

**Production requirement:** approval state machine, segregation-of-duties rules, immutable audit trail, connector write authorization and period-lock semantics.

### P1 — partial multi-stage persistence is recoverable but not atomic

A new payroll run can persist before a later settlement/bookkeeping validation fails. A bookkeeping batch can also persist before the finance-cycle/close linkage write fails.

Mitigation in current design:
- payroll and bookkeeping stages are deterministic/idempotent;
- a retry can reuse the same stage records;
- finance-cycle persistence uses a deterministic fingerprint.

**Production requirement:** explicit orchestration state machine with compensating/recovery states and stronger transactional boundaries.

### P1 — payroll recognition date is a V1 convention

The generated payroll recognition journal uses `pay_period_end`. That is explicit in capabilities but is not yet configurable for alternative accounting policies or cut-off rules.

**Production requirement:** governed accounting-policy configuration and cut-off tests.

### P1 — account mapping governance is not yet implemented

Explicit mapping avoids guessing, but v0.31 does not version, approve or validate those mappings against an authoritative chart of accounts.

**Production requirement:** company chart-of-accounts registry, account-role mapping versioning, effective dates and approval evidence.

### P2 — settlement matching quality depends on source references

Missing or weak settlement references can legitimately create ambiguous bank matches. The engine correctly leaves those as exceptions rather than guessing.

### P2 — close coverage is one payroll run per finance-cycle request

V1 accepts one payroll run as the payroll source for a cycle. Weekly/biweekly/multiple-run monthly aggregation is not yet a first-class orchestration object.

**Next extension:** allow an ordered set of payroll-run IDs with duplicate-period and overlap controls.

## Regression expectations

The release must continue to prove:
1. payroll journal roles translate only through explicit account mapping;
2. generated payroll journal remains balanced;
3. settlement journal debits liability and credits bank/cash;
4. settlement cash item uses the same signed cash-flow convention as bank reconciliation;
5. matching bank transaction reconciles to the settlement cash item;
6. ambiguous/unmatched reconciliation items block the close-control pass;
7. missing bank closing-balance control blocks the pass;
8. incomplete period-scope attestation blocks the pass;
9. outstanding payroll liabilities may remain without blocking the close, but over-settlement blocks it;
10. a clean synthetic case returns `CONTROLS_PASS_APPROVAL_REQUIRED` and never `CLOSED`;
11. finance-cycle identity remains deterministic when equivalent input arrays are reordered;
12. health regression covers payroll, bookkeeping, finance-cycle and monthly-close controls.

## Release boundary

Do not classify v0.31 as production accounting automation. Real-customer readiness still requires at minimum:
- managed customer identity and tenant authorization;
- authoritative source ingestion/completeness controls;
- governed chart-of-accounts mapping;
- broader accounting and tax rule packs;
- multi-payroll-run monthly aggregation;
- full balance-sheet close controls;
- approval/sign-off and period locking;
- relational ledger architecture;
- orchestration recovery/compensation controls;
- independent accounting-domain QA;
- security/release QA and live post-release verification.
