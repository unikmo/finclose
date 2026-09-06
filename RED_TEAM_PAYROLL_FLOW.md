# FinClose Payroll Onboarding — Independent Red Team

Date: 2026-09-06
Scope: customer route `Help me do payroll` only
Verdict target: synthetic preview UX, not production payroll readiness

## What was challenged

1. **Does the customer see a technical access concept?**
   - No Lab token field is present in the payroll customer flow.
   - Account access is the first visible action.

2. **Is company setup shown before authentication?**
   - No. Company content is gated behind an authenticated customer session.

3. **Does payroll ask for unrelated bookkeeping setup?**
   - The visible flow remains payroll-only.
   - The completion screen explicitly confirms that bookkeeping was not added.

4. **Is the company step understandable?**
   - Country and pay schedule are collected first.
   - The customer then reuses an initialized company or initializes it once.
   - Existing companies are not reinitialized.

5. **Is historical payroll confused with current payroll data?**
   - No. Historical payroll has a dedicated screen and storage path.
   - Current payroll data is requested only after history is received or legitimately not applicable for a new company.

6. **Are internal connector failures exposed as customer actions?**
   - The dedicated payroll flow does not present provider-credential errors as CTAs.
   - Secure file upload remains the dependable customer path in the current preview.

## Risks still open

- The temporary customer account bridge is not production identity infrastructure.
- Company discovery is still based on the synthetic Lab company store; production tenant/company authorization remains mandatory.
- External payroll OAuth/API authorization is not production-enabled.
- The country initialization workbook is still broader than an ideal future inline payroll onboarding experience.
- Real payroll validation, approvals, filing authority and run execution are outside this UI change.
- The final ledger/database production architecture remains open.

## UX judgement

The revised payroll path now follows the expected customer mental model:

**Account → Company → Payroll history → Current payroll**

Each screen exposes one primary decision, later stages are gated, and technical test credentials are removed from the customer journey.

**RED TEAM VERDICT: PASS FOR SYNTHETIC PREVIEW UX, subject to CI build and live post-deployment verification.**
