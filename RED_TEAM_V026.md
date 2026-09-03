# FinClose v0.26 — Independent Red Team

Date: 2026-09-03

## Scope

Review the change from an all-at-once service workflow to progressive onboarding:

1. registration / initialization,
2. historical context,
3. current-system connection.

## Findings

### PASS — cognitive load
The service route no longer exposes agent internals, connector cards, initialization and upload controls at the same time. The customer sees one decision layer at a time.

### PASS — existing initialized company reuse
A service deployment can link to an existing `finclose_companies` record. This avoids re-initializing a company such as MDA for every new service purchase.

### PASS — balance-books boundary
`balance-books` can proceed after registration without a FinClose company initialization. Historical accounting context is still required before current-system connection.

### PASS — history separated from current source
Historical files use a dedicated `finclose_service_history` record and `historical-context` Storage path. Current operational source continues through the connector/source path.

### PASS — country mismatch protection
Linking an initialized company fails if its country conflicts with the service registration country.

### PASS — history skip safeguard
History can only be skipped when the linked initialized company is explicitly marked `NEW`. Balance-books cannot skip history.

### RISK — Lab token is not customer authentication
The progressive flow is still protected by one Lab token. Production requires Firebase Auth or another tenant/user authentication and authorization design.

### RISK — historical files are accepted as opaque source material
The current change stores and fingerprints history, but does not yet parse, classify, reconcile or score the completeness of the historical package.

### RISK — initialization workbook is still the existing general country workbook
The workbook remains the previously agreed company initialization form. Service deployment/billing remains separate, but future UX should generate service-aware views of the initialization form to hide irrelevant fields.

### RISK — upload transport
Files are still base64 encoded through a Vercel API request. Real customer-scale documents require direct/resumable upload, file validation and malware scanning.

### RISK — external connector authorization remains incomplete
The connector catalog is visible only after history, but Xero/QuickBooks/DATEV/SmartAccounts live authorization is still gated by provider credentials, callback/token-vault controls and QA.

## Verdict

**PASS FOR SYNTHETIC LAB TESTING WITH RISKS.**

This change is a product-flow improvement, not a production-readiness certification. Real accounting/payroll data remains prohibited until authentication, authorization, secure uploads, provider auth and independent security QA are complete.
