# FinClose v0.27 — Independent Red Team

Date: 2026-09-05

## Scope

Review the customer-flow correction triggered by live screenshots of v0.26:

1. remove the technical Lab token from customer onboarding,
2. make `Create account / Sign in` the first customer step,
3. ingest/link company only when the selected service requires it,
4. keep historical context before current-system access.

## Findings

### PASS — customer mental model
A customer no longer has to understand `FINCLOSE_LAB_TOKEN`. The service route begins with normal account language: create account or sign in. This matches the product mental model and removes an internal testing concept from the public journey.

### PASS — progressive disclosure
Before authentication, company initialization, historical uploads, connectors and agent details are hidden. After authentication, only the next required layer is exposed.

### PASS — service-specific company gate
`balance-books` skips company initialization. Payroll, bookkeeping and combined service ask for company country, then allow reuse of an existing initialized FinClose company or the existing country initialization workbook.

### PASS — existing initialization reuse
Previously initialized companies remain reusable. The UI explicitly treats MDA as an example of an existing company that should not be initialized again.

### PASS — technical Lab token moved out of customer UX
Customer service routes use an HTTP-only account session. `FINCLOSE_LAB_TOKEN` remains an internal server/test secret and may still be used by the legacy `/lab` workflow.

### PASS — password-at-rest handling for the temporary Lab bridge
The temporary Lab account bridge stores a per-user random salt plus an `scrypt`-derived password value, not plaintext passwords. The browser receives only a signed HTTP-only session cookie.

### PASS — deployment session ownership improvement
Customer requests to an existing service-deployment ID are checked against the account email stored when that service deployment was created. A different signed-in account cannot reuse the same service-deployment ID through the customer API path.

### RISK — custom Lab authentication is not production identity
The account layer is a temporary Lab bridge, not Firebase Authentication or another managed identity provider. It lacks production-grade identity lifecycle features such as verified email, password reset, MFA, breached-password controls and mature abuse detection.

### RISK — no login/register rate limiting
The current API does not yet rate-limit repeated account registration or password attempts. This is acceptable only for synthetic Lab testing behind the existing release boundary.

### RISK — company tenancy is not complete
`/api/companies` still exposes the shared synthetic Lab company list to an authenticated Lab account. This is useful for the MDA reuse test, but it is not acceptable for real tenants. Production must bind companies to authorized users/organizations and filter every company lookup server-side.

### RISK — initialization ownership is not complete
Initialization upload/initialize records are not yet owned by a customer/tenant identity. Before real use, initialization records and resulting companies must inherit account/organization ownership and authorization checks.

### RISK — session secret is coupled to the Lab token
The temporary signed session cookie uses `FINCLOSE_LAB_TOKEN` as its signing secret. Rotating that token invalidates customer Lab sessions. Production should use a separate session/identity secret or a managed auth provider.

### RISK — account data is still real personal data if testers enter real details
Although financial uploads remain synthetic-only, account email/name values can be real personal data. Testers should use non-sensitive test credentials until the production privacy/security controls are complete.

### RISK — existing upload and connector production gates remain
Base64 uploads through the Vercel API, malware/file validation, provider OAuth/API token vaulting and relational ledger architecture remain unresolved production gates.

## Verdict

**PASS FOR SYNTHETIC LAB UX TESTING ONLY.**

The v0.27 flow is materially clearer than v0.26 and correctly removes the Lab token from the customer journey. It is not a production authentication or tenant-isolation certification. Do not use real accounting/payroll data until managed authentication, tenant/company authorization, identity lifecycle controls, rate limiting, secure upload hardening, provider authorization QA and independent security QA are complete.
