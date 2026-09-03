# FinClose homepage — Red Team review

Date: 2026-09-03

## Decision under review

Make `/` a service-first `How Can We Help?` layer and move the technical FinClose Lab to `/lab`.

## Independent critique

1. **First-impression clarity — PASS.** The homepage now answers the visitor's immediate question before exposing technical setup or infrastructure.
2. **Cognitive load — PASS.** Four large actions replace the previous multi-step technical interface on first load.
3. **Technical continuity — PASS.** Existing Firebase/Vercel workflow remains available under `/lab`; no persistence or API behavior is changed.
4. **Accessibility — PASS WITH MINOR RISK.** Service choices are full-card links with visible focus treatment and responsive one-column behavior on small screens.
5. **Expectation management — PASS.** The direct technical link is explicitly labelled `Open test lab`; `/lab` retains the synthetic-data warning.
6. **Semantic overlap — OPEN ASSUMPTION.** User-provided choices `Do my bookkeeping` and `I need bookkeeping` overlap. The implementation preserves both titles and differentiates them as ongoing bookkeeping vs bookkeeping setup. **HYPOTHESIS:** this is the intended distinction. This does not block the requested homepage structure but should be confirmed in a later copy pass.
7. **Balance-books routing — PASS WITH RISK.** `Help me balance my books` preselects `opening_state`; the Lab still lets the tester change stage. Full reconciliation/close automation is not implied as production-ready.
8. **Release risk — LOW.** The change is additive/relocational: new root page, existing Lab moved to `/lab`, no backend schema migration.

## Verdict

**PASS WITH MINOR COPY RISK** for deployment to the current synthetic FinClose test environment.
