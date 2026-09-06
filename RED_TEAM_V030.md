# FinClose v0.30 — Independent Red Team

Date: 2026-09-06
Scope: deterministic bookkeeping core after the Georgia payroll engine.

## Verdict

**PASS WITH MATERIAL LIMITS — SYNTHETIC LAB ONLY**

The change is suitable as a controlled bookkeeping validation/reconciliation core. It is not a complete autonomous bookkeeping system and must not be represented as one.

## What was challenged

### Journal integrity
- Every prepared journal must have at least two lines.
- Each line must contain one side only: debit or credit.
- Journal debit and credit totals must match exactly after cent rounding.
- Duplicate external journal IDs inside one batch are rejected.
- Journal date and currency must agree with the batch.
- The persisted batch currency is checked against the linked company's authoritative `base_currency` record.

Result: deterministic controls are appropriate for the declared Lab scope.

### Bank reconciliation
- Matching requires exact signed amount.
- Candidates outside three calendar days are rejected.
- Same reference + same date receives the highest score.
- Same reference within three days is lower confidence.
- Amount + same date without reference is lower still.
- A tied highest score is isolated as ambiguous and is not auto-matched.
- Competing bank transactions cannot silently claim the same ledger item.
- Input order does not determine the winner: proposals are evaluated globally and a unique higher-confidence contender wins; ties remain ambiguous.

**Red-team defect found and fixed before merge:** the first implementation assigned ledger items sequentially, so input order could affect which bank transaction claimed a shared ledger candidate. The matcher was rewritten to be order-independent and conservative, with explicit `LEDGER_CONTENTION` exceptions. A permutation regression case was added.

Result: conservative enough for a first core. No fuzzy/AI-generated auto-match is allowed at this layer.

## Material limitations

### P1 — caller-supplied journals are not autonomous bookkeeping
The engine validates journals supplied to it. It does not yet infer the correct account, tax code, counterparty or accounting treatment from source documents.

**Required before autonomous bookkeeping:** document extraction, transaction classification, chart-of-accounts mapping, tax/VAT rule packs and exception workflow.

### P1 — no VAT/sales-tax logic
No country tax treatment is calculated or validated.

**Required before live bookkeeping:** versioned country rule packs with authoritative evidence and regression cases.

### P1 — no posting or period lock
Prepared batches are not ledger postings. They carry `PREPARED_NOT_APPROVED`, `PREPARED_NOT_POSTED` and `NO_EXTERNAL_POSTING` boundaries.

**Required before posting:** approval workflow, immutable accounting audit controls, external-ledger connector authorization and period-lock semantics.

### P1 — Firebase Realtime Database is not the final ledger
RTDB remains Lab persistence. The final relational ledger decision is still open.

**Required before ledger-grade use:** relational storage decision and migration/consistency design.

### P1 — reconciliation sign convention is contractual
Bank and ledger cash items must use the same signed cash-flow convention. Import adapters must normalize provider-specific signs before calling the engine.

### P2 — date-window matching is intentionally narrow
A three-day window may leave valid settlements unmatched around holidays, card clearing or payment processors.

**Mitigation:** unmatched items remain exceptions; do not widen automatically without source-specific evidence.

### P2 — combined payroll/bookkeeping service is not yet fully orchestrated
Both engines are callable under `bookkeeping-payroll`, but payroll journals are not automatically transformed into a bookkeeping batch or posted.

**Mitigation:** CTR explicitly records this boundary. Add an explicit payroll-to-bookkeeping handoff with account-role mapping and approval rather than implicit coupling.

## Regression expectations

Synthetic regression must continue to prove:
1. balanced journal accepted;
2. unbalanced journal rejected;
3. duplicate external journal ID rejected;
4. exact reference/date/amount match accepted;
5. tied candidates isolated as ambiguous;
6. shared-ledger contention is resolved by confidence rather than input order;
7. ambiguous/contention losers remain unmatched;
8. company base currency enforced before persistence;
9. bookkeeping service scope enforced;
10. no external posting state remains explicit.

## Release boundary

Do not classify v0.30 as production bookkeeping. Live use requires at minimum:
- production identity + tenant authorization;
- authoritative input adapters;
- document/receipt extraction and evidence linkage;
- chart-of-accounts and tax/VAT rule packs;
- AR/AP and close controls;
- approval and period-lock workflow;
- relational ledger architecture;
- independent accounting-domain QA;
- security/release QA and live post-release verification.
