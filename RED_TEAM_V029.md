# FinClose v0.29 — Independent Red Team

Date: 2026-09-06
Scope: first operational payroll engine, Georgia basic regular cash employment only.

## Verdict

**PASS WITH MATERIAL LIMITS — SYNTHETIC LAB ONLY**

The change is suitable as a deterministic calculation core for controlled synthetic testing. It is not suitable for live payroll execution, filings or salary payments.

## Evidence checked

- Georgian 20% individual income-tax rate: Legislative Herald of Georgia (Matsne), Tax Code, Article 81.
- Salary-income treatment: Tax Code, Article 101.
- Funded-pension contributions: Law of Georgia on Funded Pension, Article 3: 2% employee, 2% employer, state contribution bands at GEL 24,000 and GEL 60,000 for participants.
- Code refuses non-Georgia operational calculation instead of inventing rules.
- Pension participation is explicit input; the engine does not infer legal participation/opt-out status.

## Challenge findings

### P0 — none found inside the declared synthetic/basic scope

### P1 — year-to-date source is not yet system-derived
State pension banding depends on `ytd_taxable_salary_before`, which is currently caller-supplied. A wrong YTD value can produce a wrong state-pension amount.

**Mitigation:** retained as an explicit declared limitation. Before live use, normalize payroll history and derive YTD from authoritative prior runs/imports with reconciliation controls.

### P1 — rule pack intentionally excludes payroll edge cases
The engine does not calculate special exemptions, non-cash benefits, expense reimbursements, foreign/diplomatic cases, garnishments or voluntary deductions.

**Mitigation:** reject any claim that Georgia payroll is fully implemented. Extend the rule pack only with official evidence and regression cases.

### P1 — pension participation is a legal status, not a mathematical default
Age, historical opt-out and voluntary participation can change whether contributions apply.

**Mitigation:** the current engine requires a boolean supplied from verified employee master data. Before production, participation status must be evidence-backed and change-controlled.

### P1 — no execution authority
Prepared numbers could be mistaken for an executable payroll.

**Mitigation:** persisted runs explicitly carry `PREPARED_NOT_APPROVED` and `NO_PAYMENT_NO_FILING`. No payment or filing endpoint exists.

### P2 — concurrency/idempotency
Payroll run IDs use deployment + pay date + SHA-256 input fingerprint. Concurrent identical requests converge on the same deterministic key. Last-write timestamps may differ, but duplicate financial content does not create a second run ID.

### P2 — accounting journal is semantic, not chart-of-accounts posting
The engine emits balanced account roles, not customer ledger account numbers.

**Mitigation:** mapping/posting belongs to the bookkeeping engine and approval controls. Do not auto-post these semantic lines yet.

## Regression expectations

Synthetic cases must continue to cover:
1. 20% income tax.
2. 2% employee and 2% employer pension for participants.
3. non-participant pension = 0.
4. state contribution crossing GEL 24,000 annual threshold.
5. state contribution crossing GEL 60,000 annual threshold.
6. balanced payroll journal.
7. unsupported-country refusal.
8. no payment / no filing state.

## Release boundary

Do not classify v0.29 as production payroll. Live payroll requires, at minimum:
- production authentication and tenant authorization;
- verified employee master data and pension participation status;
- authoritative YTD derivation and takeover reconciliation;
- comprehensive Georgia edge-case rule coverage;
- statutory filing/payment integration controls;
- approval workflow and immutable audit requirements;
- independent payroll-domain QA against authoritative examples;
- production security and post-release verification.
