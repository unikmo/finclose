# FinClose Backup & Recovery Verification Record

**Pilot-activation blocker P0 #2** (`backup_pitr_policy` certification gate) · issue unikmo/finclose#21
Operationalizes `docs/FIREBASE_BACKUP_PITR_POLICY_V1.md` and `docs/BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`.

| | |
|---|---|
| Project | `theantibalcony` (Blaze / pay-as-you-go) |
| Verification performed by | Claude, in Tichi Mbanwie's Google Cloud / Firebase consoles |
| Date (UTC) | 2026-09-10 |
| Requires | Tichi's countersignature of §G (recovery authority) and §H (operator attestation) |
| Contains secrets? | No — no keys, tokens, credentials or payment details |

---

## A. Environment identity

- Firebase / Google Cloud project: **`theantibalcony`**
- Firestore database: **`(default)`**, Firestore-native, location **`eur3`** (Belgium + Netherlands, EU)
- Realtime Database: **`theantibalcony-default-rtdb`**, location **`europe-west1`** (Belgium, EU)
- Cloud Storage — FinClose financial artifacts bucket: **`theantibalcony-finclose-eu`**, **`eu`** multi-region
- Cloud Storage — RTDB backup bucket: **`theantibalcony-default-rtdb-backups`**, **`europe-west1`**
- Legacy bucket `theantibalcony.firebasestorage.app` (`us-east1`) — superseded by the EU bucket; not used by the FinClose runtime (env `FIREBASE_STORAGE_BUCKET=theantibalcony-finclose-eu`). Recommend deleting once confirmed empty.

**All three FinClose data stores are in the EU.** The earlier US/EU residency split is resolved.

---

## B. Firestore point-in-time recovery (PITR)

| Check | Required | Observed | Result |
|---|---|---|---|
| PITR enabled | Enabled for `(default)` | Enabled (toggle on) | ✅ PASS |
| Retention window | ≥ 7 days | **7 days** | ✅ PASS |
| Earliest recoverable version | Recorded | **2026-09-09 05:40:00 UTC+2** (≈ 03:40 UTC) | ✅ PASS |
| Billing prerequisite | Project supports PITR/backups | Blaze plan active | ✅ PASS |

Console: Firestore → `(default)` → *Notfallwiederherstellung* (Disaster recovery).

---

## C. Firestore scheduled backups

| Check | Required | Observed | Result |
|---|---|---|---|
| Daily schedule | Enabled, retain 4 weeks | Enabled, **retain 28 days** | ✅ PASS |
| Weekly schedule | Sunday, retain 14 weeks | Enabled, **Sunday, retain 98 days** | ✅ PASS |
| ≥ 1 successful backup | At least one completed | **Backup snapshot 2026-09-10 05:41:56 UTC+2** (≈ 03:41:56 UTC); expiry 2026-10-08 05:41:56 UTC+2 (28-day daily) | ✅ PASS |
| Source database | `(default)` | `(default)` | ✅ PASS |

Console: GCP → Firestore → `(default)` → Disaster recovery → *Alle Sicherungen aufrufen* (View all backups).

---

## D. Firestore restore rehearsal (non-destructive)

| Field | Value |
|---|---|
| Method | `BACKUP_RESTORE` — console "Restore backup … to a new database" |
| Source backup | Scheduled daily backup, snapshot **2026-09-10 05:41:56 UTC+2**, source `(default)` |
| Destination | **new database `finclose-restore-rehearsal-20260910`**, location `eur3` (same EU region), Standard edition, scheduled backups disabled |
| Started | 2026-09-10 09:31:35 UTC+2 |
| Completed | 2026-09-10 ~09:52 UTC+2 (restore ran ~20 min — normal Firestore provisioning overhead) |
| Live `(default)` database modified by rehearsal | **NO** — restore targeted a separate new database only |
| Verification performed | Opened `finclose-restore-rehearsal-20260910` in Firestore Studio. Collection `finclose_prod_meta` present; document `ledger_schema` restored intact with fields: `backend: "firebase-firestore"`, `created_at: 1788716245882`, `direct_client_access: "DENIED_BY_RULES"`, `schema_version: 1`, `updated_at: 1788716245882` — byte-identical to the same document in `(default)`. |
| Recovered records matched expected state | **YES** |
| Rehearsal result | **PASS** |
| Cleanup | Rehearsal database `finclose-restore-rehearsal-20260910` **deleted** 2026-09-10 ~09:53 UTC+2 (typed-ID confirmation). No ongoing cost. `(default)` unaffected. |
| Issues / remediation | None. |

---

## E. Realtime Database automated backup

| Check | Required | Observed | Result |
|---|---|---|---|
| Automated daily backup | Enabled | Enabled (*Täglich ✓*) | ✅ PASS |
| Data + Security Rules | Both included | Each run produces `..._data.json.gz` **and** `..._rules.json.gz` | ✅ PASS |
| Compression | Gzip | `.gz` objects | ✅ PASS |
| Retention | ≥ 30 days | Backup bucket lifecycle rule: **Delete object 30+ days after creation** | ✅ PASS |
| Latest successful run | Recent success | **2026-09-10 07:12:38 UTC** ("Fertig", 11 s, 4.03 KB); prior successes 2026-09-09 07:12:37 and 2026-09-09 04:43:38 UTC | ✅ PASS |
| Destination bucket | Recorded | **`theantibalcony-default-rtdb-backups`** (`europe-west1`) | ✅ PASS |

Console: Firebase → Realtime Database → *Sicherungen*.

---

## F. Cloud Storage deletion protection

| Check | Required | Observed | Result |
|---|---|---|---|
| Soft delete enabled | Enabled on FinClose bucket | **Enabled** on `theantibalcony-finclose-eu` (Protection: "Soft Delete"; "Disable" available) | ✅ PASS |
| Retention | 30 days (pilot policy) | **30 days**, effective 2026-09-09 07:05:09 UTC+2 | ✅ PASS |
| Bucket identity | Correct FinClose bucket | `theantibalcony-finclose-eu`, `eu` multi-region — matches `FIREBASE_STORAGE_BUCKET` | ✅ PASS |
| RTDB backup bucket protection | — | `theantibalcony-default-rtdb-backups` also shows soft-delete protection + 30-day delete lifecycle | ✅ PASS |
| SHA-256 upload fingerprints preserved | Per policy §3 | FinClose records `sha256` on every stored artifact in RTDB + audit events (`saveDataChunk`, upload-review claims) — restored files can be revalidated against recorded identity | ✅ PASS (by design) |

Console: GCP → Cloud Storage → `theantibalcony-finclose-eu` → *Protection*.

---

## G. Recovery authority and evidence location — *Tichi to complete*

- Authorized recovery operator(s): `__________________________________`
- Approval authority for authoritative-ledger recovery: `__________________________________`
- Evidence storage location (this record + screenshots): `__________________________________`
- Incident / recovery log location: `__________________________________`
- Post-recovery integrity checks required (per policy §4): ledger health, source completeness, balance-sheet reconciliation, close governance, and affected period-lock verification **before** resuming writes on affected companies/periods.

---

## H. Final decision

| | |
|---|---|
| Mandatory config items (B, C, E, F) | **COMPLETE — all PASS** |
| Restore rehearsal (D) | **PASS** |
| Recovery authority documented (G) | `______` *(Tichi to complete + countersign)* |
| Unresolved blockers | None on the technical evidence. §G countersignature outstanding. |
| **Overall result** | **PASS** (technical) — pending Tichi's §G/§H countersignature to be final |

**Operator attestation** *(Tichi)*:

> I verified the recorded configuration and recovery exercise against the live Firebase / Google Cloud project `theantibalcony`. This record contains no secret keys, tokens or credentials, and the evidence references are sufficient to reproduce the verification. I accept the recovery responsibilities recorded in §G.

Operator name: `__________________________`  Date: `__________________`

### Release-flag rule

`FINCLOSE_BACKUP_PITR_VERIFIED=YES` may be set in Vercel (`finclose-lab-preview`, Production, Config type) **only** on an overall §H `PASS` — which requires the restore rehearsal (D) to have completed successfully and §G to be countersigned. Then redeploy and re-run `POST /api/pilot-certification`.

---

## Notes

- Firestore PITR, scheduled-backup storage, and the temporary restore-rehearsal database all incur Blaze charges. Cost is negligible for a near-empty pilot database; revisit sizing at scale. The rehearsal database is deleted immediately after verification.
- Delete the legacy `theantibalcony.firebasestorage.app` (US) bucket once confirmed empty — it should no longer receive writes.
