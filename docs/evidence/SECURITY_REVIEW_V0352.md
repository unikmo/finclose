# FinClose — Independent Security Review

**Pilot-activation blocker P0 #6** (`independent_security_review` certification gate) · issue unikmo/finclose#21

| | |
|---|---|
| Release under review | FinClose `v0.35.2` |
| Source SHA | `6996db90439bc3889c51571cbd7981d621073e69` (bound to certification run `20260909080958_9a77588a3a`) |
| Scope | Controlled **PILOT** activation only (real data, one trusted customer, low volume). **Not** unrestricted PRODUCTION. |
| Reviewer | Claude (Sonnet 5), acting as reviewer-of-record for the written analysis |
| Date | 2026-09-10 |
| Deployment target | Vercel (Linux serverless), project `finclose-lab-preview`; Firebase project `theantibalcony`, EU data residency (Firestore + RTDB `europe-west1`, Storage EU multi-region) |

> **This document does not set `FINCLOSE_SECURITY_REVIEW_APPROVED`.** Per the agreed approach, Claude produces the review and a recommendation; an **independent human** must read it, satisfy themselves, and set the attestation flag. The certification gate stays `BLOCKED` until they do.

---

## 1. Method

- Full read of the security-relevant source at the pinned SHA: `lib/managed-auth.ts`, `lib/lab-auth.ts`, `lib/tenancy.ts`, `lib/runtime-mode.ts`, `lib/pilot-release-gate.ts`, `lib/file-security.ts`, `lib/upload-quarantine.ts`, `lib/finclose-backend.ts`, `lib/close-governance-engine.ts` (authz paths), `lib/pilot-certification*.ts`, all route handlers under `app/api/`, `firestore.rules`, `storage.rules`, `database.rules.json`, `next.config.mjs`.
- Dependency audit (`npm audit`) against the committed lockfile.
- Test suite executed: **19/19 pass** (`firebase-hardening`, `firebase-rules-source`, `pilot-release-gate`).
- Reviewed the live certification report `cert-run6.json` — **16 PASS / 0 FAIL / 3 BLOCKED**; all ten technical/live-infrastructure gates PASS.
- Cross-checked against the prior `docs/SECURITY_RELEASE_EVIDENCE_V035.md` and its `SEC-035-0x` outstanding items.

---

## 2. Summary verdict

**The application design is sound and fail-closed. No architectural or code-level defect blocks a controlled pilot.** The identity, tenancy, ledger-integrity and upload-quarantine controls are well built and are now backed by passing live certification evidence.

The material residual risk is **third-party dependency exposure**, concentrated in two packages. With the current deployment configuration, none of the *critical* dependency advisories are reachable, but the `xlsx` parser processes attacker-influenced files and should be upgraded before or immediately inside the pilot.

**Recommendation to the human approver:** the pilot may proceed on the strength of the application controls, provided the approver accepts the dependency-risk treatment in §4 (specifically: schedule the `xlsx` replacement, and the Next.js upgrade, as tracked pilot fast-follows with owners and dates). If the approver wants zero known-high advisories in the tree at activation, hold for the `xlsx` swap first.

---

## 3. What is working well (evidence-backed)

| Control | Assessment |
|---|---|
| **Client data-plane lockout** | `firestore.rules`, `storage.rules`, `database.rules.json` all deny **all** direct client read/write. Every data path is server-mediated through the Firebase Admin SDK. Certification gate `firebase_public_rules` confirms anonymous RTDB/Firestore/Storage reads are refused (401/403/403). Source test `firebase-rules-source` guards against rule regression. |
| **Managed identity (PILOT/PROD)** | Firebase Authentication; server-minted session cookie that is `httpOnly` + `Secure` + `SameSite=Lax`, 8h TTL; `verifyIdToken(idToken, true)` and `verifySessionCookie(raw, true)` both check revocation; recent-auth window (5 min) enforced before session creation; logout revokes refresh tokens. Verified-email is required before any real financial-data operation (`authenticateRequest` throws 403 otherwise). Cert gate `firebase_auth_end_to_end` PASS (create / sign-in / OOB / cookie / revocation / cleanup). |
| **Account enumeration resistance** | Password-reset returns a constant "if an account exists…" response and swallows `EMAIL_NOT_FOUND` / `INVALID_EMAIL`. |
| **Auth rate limiting** | `consumeAuthRateLimit` — RTDB transaction, 15-min window: login 10, register/reset/verify-resend 5. Layered on top of Firebase's own `TOO_MANY_ATTEMPTS_TRY_LATER`. |
| **Tenant isolation + RBAC** | `VIEWER<ACCOUNTANT<APPROVER<ADMIN<OWNER`. Every real-data branch in `app/api/[...path]/route.ts` and the upload-review route resolves organization/deployment/company ownership and enforces a role floor before acting. Cross-org artifact access is explicitly rejected in `upload-quarantine.ts#loadArtifact` (deployment + organization match). Cert gate `tenant_role_isolation` PASS against live disposable identities. |
| **Ledger integrity** | Firestore is authoritative; writes use deterministic IDs + transactions/idempotency. Cert gate `firestore_idempotency_and_lock_concurrency` PASS: 6 concurrent retries → one create; two overlapping close-locks → one accepted, one rejected. |
| **Upload validation** | `file-security.ts`: 25 MB cap, extension allowlist (`.xlsx/.csv/.pdf/.png/.jpg/.jpeg`), filename sanitisation, magic-byte signature check per type, macro-enabled Office and executables rejected, SHA-256 fingerprint. Storage paths are org/company-scoped with a random UUID segment — no path traversal from the user-supplied name. |
| **Upload quarantine (PILOT)** | `MANUAL_REVIEW`: `history`/`source` artifacts land `QUARANTINED`; an **ADMIN** must issue a `CLEAN`/`REJECTED` decision through the review route before the artifact is usable. Decisions are immutable, applied via a transactional claim (`finclose_upload_review_claims/*`) with a 2-min effect lease. Review download uses `Content-Disposition: attachment`, `no-store`, `nosniff`. Cert gate `upload_review_concurrency` PASS (concurrent CLEAN/REJECTED → one persisted immutable decision). |
| **Release fail-closed design** | `runtime-mode.ts` + `pilot-release-gate.ts`: real-data mode requires server+client Firebase config, Firestore, Storage, the *mode-specific* release gate (`FINCLOSE_PILOT_RELEASE_GATE=APPROVED`), a quarantine mode, **and** a source-and-hash-bound all-pass certification produced *pre-activation*. PRODUCTION is independently gated and additionally requires verified `SCANNER` mode — `MANUAL_REVIEW` cannot satisfy production. Certification refuses to run outside LAB. `pilot-release-gate` unit tests confirm the evidence binding rejects wrong-release, wrong-SHA, hash-mismatch and post-activation reports. |
| **Certification endpoint** | `POST/GET /api/pilot-certification` require the `x-finclose-lab-token` header; unauthenticated calls return 401. |
| **Secret hygiene** | No secrets in source or client bundle. `firebase_client_config` exposed by `/api/runtime` and `/api/health` is public-by-design Firebase web config (API key, auth domain, project id) — not a credential leak. Service-account JSON is read from env only. |

---

## 4. Findings

Severity reflects **residual risk in the controlled-pilot deployment as configured**, not the raw CVSS of the underlying advisory.

### F-1 — `xlsx@0.18.5` (SheetJS): prototype pollution + ReDoS, parser runs on user-influenced files — **MEDIUM-HIGH** *(recommend fixing before pilot)*

- Advisories: **GHSA-4r6h-8v6p-xvw6** prototype pollution (fixed `>=0.19.3`), **GHSA-5pgg-2g8v-p4x9** ReDoS (fixed `>=0.20.2`). Both **HIGH** CVSS. No fixed version is published on the npm registry — SheetJS ships fixes only from `https://cdn.sheetjs.com`.
- **Reachability:** `XLSX.read(buffer)` executes in `parseInitialization`, `workbookMetadata` and `readFieldMap` (`lib/finclose-backend.ts`). `parseInitialization` runs **at upload time inside `saveInitialization`**, i.e. *before* any human quarantine review (the quarantine/review flow covers `history` and `source` artifacts, not the initialization template). An authenticated, email-verified pilot user posting to `/api/initialization/upload` reaches the parser directly.
- **Existing mitigations:** allowlist + magic-byte gate (must be a real ZIP/XLSX), 25 MB cap, and — critically — the pilot onboards **trusted customers only** with individual file review as an operational control. Vercel executes each request in a short-lived isolated function, bounding both a poisoned-prototype blast radius and a ReDoS hang (function timeout) to a single invocation. No shared long-lived process.
- **Residual risk:** a trusted customer's workstation is compromised and sends a crafted template; or an insider. Impact = possible manipulation of that request's object handling / denial of that request. Not a data-exfiltration path on its own given the serverless model, but prototype pollution in a finance parser is not something to carry into real data if avoidable.
- **Recommendation:**
  1. Upgrade to `xlsx@0.20.3` from the SheetJS CDN tarball (`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), **or**
  2. Replace SheetJS with a maintained, registry-published parser (`exceljs`) for the read path. The write path (`aoa_to_sheet` / `XLSX.write` for template generation) is not attacker-facing and can stay.
  3. Either way, add `Object.freeze(Object.prototype)` hardening at process start, and wrap `XLSX.read` in a timeout guard.

### F-2 — `next@14.2.35`: the 14.x line is behind on security advisories — **MEDIUM (availability)** *(recommend pilot fast-follow)*

- `npm audit` flags Next 14.2.35 for a long list of advisories. Assessed by reachability against `next.config.mjs` (which sets only `trailingSlash: false`) and the codebase:
  - **NOT reachable:** Image Optimization AVIF RCE (GHSA-2xp9-vwfh-vxw4, *critical*) — no `next/image` usage anywhere, no `images` config; Image-Optimizer `remotePatterns` DoS — same; rewrites SSRF (GHSA-p9j2-gv94-2wf4 / GHSA-ggv3-7p47-pfv8) — no `rewrites`; middleware / i18n bypass (GHSA-36qx-fr4f-26g5, *high*) — no `middleware.ts`, App Router only; Windows RCE (GHSA-p293-qw3h-jr36, *critical*, CWE-22) — deployment is Vercel/Linux (this one **does** affect the Windows dev workstation running `next dev` — see F-6).
  - **Potentially reachable:** several **HIGH** "DoS with Server Components / Server Actions" advisories, and "unauthenticated disclosure of internal Server Function endpoints" (*moderate*). FinClose has 3 RSC pages and uses route handlers; Server Actions usage is minimal but the framework endpoints exist. Impact is **availability** (and minor endpoint-name disclosure), not customer-data confidentiality or integrity.
- **Reachability of the criticals in the pilot deployment: effectively nil.** Residual is DoS on a one-customer pilot, further cushioned by Vercel platform protections.
- **Recommendation:** plan the upgrade to a current Next.js release (15.5.24+) as a **tracked pilot fast-follow with an owner and a date**. It is a 14→15 major migration and should not be rushed onto the activation critical path given the low reachable risk. Re-run `npm audit` and the full test suite after.

### F-3 — Transitive `firebase-admin` advisories (`google-gax`, `gaxios`, `retry-request`, `teeny-request`, `uuid`) — **LOW**

- All **moderate**, all deep transitive dependencies of `firebase-admin@13`. The notable one is `uuid <11.1.1` (missing buffer bounds check, only triggerable when a caller passes a `buf` argument — the Google libraries do not). No direct FinClose code path.
- **Recommendation:** `npm update firebase-admin` to pick up patched transitives at the next maintenance window; not pilot-blocking.

### F-4 — `assertLabToken` / lab-session token comparison is not constant-time — **LOW**

- `lib/finclose-backend.ts#assertLabToken` uses `supplied !== expected`; `lib/lab-auth.ts#assertCustomerOrLab` uses `supplied === expected`. (The lab-session cookie HMAC in `lab-auth.ts` *does* correctly use `crypto.timingSafeEqual`.)
- Timing side-channel on a high-entropy bearer token over the network is not practically exploitable, and the LAB token is not a customer-data credential. Still, trivially fixable.
- **Recommendation:** route both through a `timingSafeEqual` helper with a length guard.

### F-5 — No enforced segregation of duties in the monthly-close workflow — **LOW for pilot, MEDIUM for production/multi-user**

- `approveMonthlyClose` requires role `APPROVER`; `lockMonthlyClose` `APPROVER`; `reopenMonthlyClose` `ADMIN`. Nothing prevents the *same human* who prepared/ran the finance cycle from also approving and locking, if they hold `APPROVER+`.
- For a solo-operator pilot this is expected and acceptable (one person operates the whole close). It becomes a real control weakness once a customer has multiple finance users and expects maker/checker separation.
- **Recommendation:** before onboarding any multi-user customer, add an optional "approver must differ from preparer" enforcement at the org level. Document the current behaviour in the pilot customer agreement. (Also relevant to P0 #7.)

### F-6 — Windows development workstation runs a Next.js version with an unauthenticated RCE advisory — **INFORMATIONAL (dev hygiene)**

- GHSA-p293-qw3h-jr36 (CWE-22, CVSS 9.0) affects Windows-hosted Next servers `>=13.4.0 <15.5.24`. The pilot is on Vercel/Linux, but `next dev` / `next start` on the Windows 11 workstation used for this work is in range.
- **Recommendation:** only run the dev server bound to `localhost`, never expose it; upgrade Next per F-2 also closes this.

### F-7 — Deep health `errors[]` echoes raw infrastructure error strings — **INFORMATIONAL**

- `/api/health?deep=1` returns `errors: ["database: <raw message>", …]`. Useful operationally; could disclose internal detail (bucket names, project internals) to anyone who can reach the endpoint. It is unauthenticated.
- **Recommendation:** either put `?deep=1` behind the lab token, or map errors to codes in that response. Low priority.

---

## 5. Status of the prior `SEC-035-0x` outstanding items

| Item (from `docs/SECURITY_RELEASE_EVIDENCE_V035.md`) | Now |
|---|---|
| SEC-035-01 — Firebase web/client Auth config | **CLEARED** — client config present; cert `firebase_auth_end_to_end` PASS |
| SEC-035-02 — Auth end-to-end + human mailbox delivery | **CLEARED** — cert PASS; human delivery verified (P0 #5, `FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED=YES`, cert `auth_email_human_delivery` PASS). *Follow-up: publish DKIM + DMARC for antibalcony.com — see §6.* |
| SEC-035-03 — anonymous rules checks | **CLEARED** — cert `firebase_public_rules` PASS |
| SEC-035-04 — tenant/role escalation | **CLEARED** — cert `tenant_role_isolation` PASS |
| SEC-035-05 — upload manual-review operational adoption | **CLEARED** — P0 #3; operator adoption record signed; cert `controlled_upload_procedure` + `controlled_upload_operator_adoption` + `pilot_upload_mode` PASS |
| SEC-035-06 — backup/recovery verification | **OPEN** — this is P0 #2; config done, first scheduled backup + restore rehearsal + `FINCLOSE_BACKUP_PITR_VERIFIED=YES` still pending. **Security approval should not treat data-recovery as complete until #2 closes.** |

---

## 6. Non-blocking follow-ups to schedule

> **Approver decision (Tichi Mbanwie, 2026-09-10):** F-1 and F-2 **accepted for the pilot as tracked fast-follows.** `FINCLOSE_SECURITY_REVIEW_APPROVED=YES` set on this basis.
> - **F-1 `xlsx`** — owner: Tichi Mbanwie. Target: replace `xlsx@0.18.5` with `xlsx@0.20.3` (SheetJS CDN) or `exceljs` **within the pilot window, before scaling past the first customer**. Re-run test suite + `npm audit` after.
> - **F-2 Next.js** — owner: Tichi Mbanwie. Target: upgrade to Next 15.5.24+ as a fast-follow during the pilot. No critical advisory is reachable in the current config (assessed in F-2).

1. **F-1 `xlsx`** — replace/upgrade (accepted above).
2. **F-2 Next.js 15 upgrade** — tracked fast-follow (accepted above).
3. **DKIM + DMARC for antibalcony.com** — publish DKIM (HostEurope/cPanel → TXT at GoDaddy DNS) and `_dmarc.antibalcony.com` `v=DMARC1; p=none; rua=mailto:hello@antibalcony.com`. Improves auth-email deliverability and anti-spoofing for the identity emails.
4. **F-3** — `npm update firebase-admin` at next maintenance.
5. **F-4** — constant-time token compare.
6. **F-5** — approver≠preparer enforcement before any multi-user customer.
7. **F-7** — gate or sanitise deep-health `errors[]`.
8. Add `npm audit --audit-level=high` to CI so new advisories surface on every PR.

---

## 7. Recommendation to the approver

> Based on this review, the FinClose `v0.35.2` application controls are **adequate for a controlled pilot** with one trusted, low-volume customer. The identity, tenancy, ledger-integrity, upload-quarantine and release-gating controls are well designed and are backed by passing live certification evidence at source SHA `6996db9…`.
>
> The outstanding risk is dependency-driven (F-1, F-2). In the pilot deployment as configured, no *critical* advisory is reachable. F-1 (`xlsx`) touches an attacker-influenceable parse path and I recommend fixing it **before** activation or accepting it with a firm, dated remediation commitment. F-2 (Next.js) is an availability concern suitable as a tracked fast-follow.
>
> If you (a) accept the F-1/F-2 risk treatment with owners and dates recorded, and (b) note that P0 #2 (backup/recovery) must still close independently, then it is reasonable to set `FINCLOSE_SECURITY_REVIEW_APPROVED=YES`.
>
> **This flag must be set by a human who has read this review — not by Claude.**

---

## 8. On committing this record

Once countersigned by the human approver, commit to `docs/evidence/SECURITY_REVIEW_V0352.md` alongside the backup/recovery and auth-email evidence records. Reference the source SHA and certification run id in the commit message.
