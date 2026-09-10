# FinClose Controlled Pilot Upload — Operator Adoption Record

**Status: ADOPTED — PASS**
**Date prepared:** 2026.09.09
**Prepared by:** Claude · **Adopted + signed by:** Tichi Mbanwie, 09/09/2026
**Templates:** `docs/CONTROLLED_PILOT_UPLOAD_PROCEDURE_V1.md`, `docs/CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md`
**Runtime at adoption:** `LAB` (pre-activation).

---

## What this gate is

P0 #3 in issue #21 is **not a code task** — the certification checks three env-var attestations, and the procedure doc is explicit that setting them requires the operator to have actually read the procedure, confirmed a real review workstation exists, and accepted responsibility. "Merely having this document in the repository is not sufficient."

The technical side is already proven by the live certification (`upload_review_concurrency` gate PASSES as of run `20260909071911`): quarantine-first behaviour, immutable review decisions, concurrent-conflict resolution, magic-byte / allowlist / size / SHA-256 enforcement. The manual-review code path (`lib/upload-quarantine.ts` → `downloadServiceUploadForReview`, `reviewServiceUpload`) only activates in PILOT/PRODUCTION and is ADMIN-gated + org/deployment-scoped.

---

## Section A — Operator readiness

| Check | Notes | Confirmed |
|---|---|---|
| Read `CONTROLLED_PILOT_UPLOAD_PROCEDURE_V1.md` in full | 97-line procedure; summary below | ✅ |
| Understand `MANUAL_REVIEW` is a controlled-pilot exception, **not** a malware-scanning substitute | Production still requires verified `SCANNER` mode | ✅ |
| Review workstation is current and patched | Windows 11 Home, kept current | ✅ |
| Endpoint protection active and current | Microsoft Defender enabled + updating | ✅ |
| Reviewer uses a **non-privileged** workstation account for document inspection | i.e. not the admin account | ✅ |
| Macros / scripts / external content / embedded active content **not** enabled during review | Open `.xlsx` in data/structural view; never "Enable content" | ✅ |
| Pilot volume kept low enough that **every** file gets individual human review | One pilot customer to start | ✅ |
| Only trusted pilot customers + known financial-source files admitted | Direct system exports, bank/tax/payroll statements, customer-prepared-from-own-records | ✅ |

**Reviewer / workstation notes:** Review performed by Tichi Mbanwie on the primary Windows 11 Home workstation with Microsoft Defender active and up to date; documents inspected under a standard (non-administrator) account with active content disabled. *(Tichi to amend if a different machine/AV/account is used for a given pilot.)*

### Procedure summary

- **Allowed sources only:** direct export from the customer's accounting/payroll/banking system; a statement the customer downloaded themselves from a known bank/tax/payroll/accounting provider; or a file the customer prepared from their own records and sent straight to FinClose. **Reject** anything forwarded from unknown senders, public links, unsolicited attachments, or uncertain provenance.
- **App already enforces:** ≤25 MB, allowlist `.xlsx/.csv/.pdf/.png/.jpg/.jpeg`, filename sanitisation, magic-byte check, no executables, no macro-enabled Office, SHA-256 fingerprint, tenant-scoped private Storage path, quarantine before use. A file failing app validation is rejected before review and must **not** be manually overridden.
- **Reviewer must be `ADMIN`** for that org/deployment, authenticated via managed Firebase identity. Download only through the ADMIN review route (forced attachment, `no-store`, `nosniff`).
- **Per file:** confirm customer/org/company/deployment + purpose; confirm the customer expected this specific file and can name its source; confirm filename/type/size/SHA-256 match the upload record; inspect on the patched non-privileged workstation without enabling active content; for spreadsheets prefer structural/data inspection; for PDF/images confirm content matches the declared source and doesn't request execution/credentials/external downloads.
- **Decision:** `CLEAN` only when provenance **and** content are consistent and no anomaly — else `REJECTED`. Never use CLEAN as a convenience override. Decisions are immutable. Add a short provenance note (no passwords/tokens/PII).
- **Stop conditions:** pause all new real-data uploads if a file behaves suspiciously, provenance can't be established, workstation protection is unavailable, review scoping looks wrong, a quarantined file reaches processing before clearance, conflicting reviews can overwrite, volume exceeds capacity, or any credential exposure is suspected.

---

## Section B — Per-file review record

Not applicable yet (no pilot customer onboarded). Section B of `CONTROLLED_PILOT_UPLOAD_OPERATOR_CHECKLIST_V1.md` is completed **per artifact** once the first real pilot file arrives.

## Section C — Decision verification

Covered by the automated certification's `upload_review_concurrency`, `firestore_idempotency_and_lock_concurrency`, and `firebase_public_rules` gates (all PASS as of cert run `20260909071911`). Re-confirm per-file in Section C once real files are reviewed.

---

## Section E — Operator adoption attestation

| | Answer |
|---|---|
| Mandatory readiness checks complete (Section A) | **YES** |
| Suitable review workstation / process confirmed | **YES** |
| Operator accepts responsibility for following the procedure | **YES** |
| **Overall adoption result** | **PASS** |

**Operator name:** Tichi Mbanwie  **Date:** 09/09/2026

---

## Env changes made on PASS (Vercel `finclose-lab-preview`, Production)

| Var | Value | Cert gate cleared |
|---|---|---|
| `FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED` | `YES` | `controlled_upload_procedure` |
| `FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED` | `YES` | `controlled_upload_operator_adoption` |
| `FINCLOSE_UPLOAD_QUARANTINE_MODE` | `MANUAL_REVIEW` | `pilot_upload_mode` |

Safe in LAB — real data still requires `FINCLOSE_RUNTIME_MODE=PILOT` + `FINCLOSE_PILOT_RELEASE_GATE=APPROVED` (both still blocked). `FINCLOSE_PRODUCTION_RELEASE_GATE` stays `BLOCKED`; production still needs verified `SCANNER`.

Commit this record to the repo (`docs/evidence/`) alongside the backup and auth-email evidence.
