# FinClose Backup & Recovery Verification Record v1

Effective date: 2026-09-07
Scope: controlled PILOT
Status: TEMPLATE — COMPLETE WITH LIVE EVIDENCE BEFORE APPROVAL

This record operationalizes `FIREBASE_BACKUP_PITR_POLICY_V1.md`. It is an evidence form, not proof by itself. Do not set `FINCLOSE_BACKUP_PITR_VERIFIED=YES` until every mandatory row is completed with verifiable live evidence and no unresolved blocker remains.

## A. Environment identity

- Firebase / Google Cloud project: `theantibalcony`
- Firestore database: `(default)` unless separately documented
- Realtime Database instance: `theantibalcony-default-rtdb.europe-west1.firebasedatabase.app`
- Cloud Storage bucket: ______________________________
- Verification date/time (UTC): ______________________
- Operator: _________________________________________
- Independent checker, if used: ______________________

## B. Firestore PITR

| Check | Required result | Evidence captured | Result |
|---|---|---|---|
| PITR enabled | Enabled for default database | Console/API screenshot or exported config; enabled timestamp; earliest recovery/version time | PENDING |
| Recovery window | Platform reports expected PITR coverage | Earliest recoverable/version timestamp | PENDING |
| Billing prerequisite | Project supports PITR/backup operations | Billing/project state evidence without exposing payment details | PENDING |

Blocker notes: ____________________________________________________________

## C. Firestore scheduled backups

| Check | Required result | Evidence captured | Result |
|---|---|---|---|
| Daily schedule | Enabled; retention 4 weeks | Schedule ID/configuration | PENDING |
| Weekly schedule | Sunday; retention 14 weeks | Schedule ID/configuration | PENDING |
| Successful backup | At least one completed backup exists | Backup ID, start/completion timestamp, source database | PENDING |
| Retention | Matches pilot policy | Retention values from live configuration | PENDING |

Latest successful backup ID: __________________________
Latest successful backup completed at: ________________

## D. Firestore restore rehearsal

The rehearsal must be non-destructive to the live default database.

- Source backup / PITR recovery point: _________________________________
- Rehearsal destination: ______________________________________________
- Start time: ______________________  Completion time: __________________
- Recovery method: `BACKUP_RESTORE` / `PITR_CLONE_OR_EQUIVALENT`
- Restore command/console action reference: _____________________________
- Verification queries/checks performed: _______________________________
- Expected records sampled: ____________________________________________
- Recovered records matched expected state: `YES` / `NO`
- Live default database modified by rehearsal: must be `NO`: ___________
- Rehearsal result: `PASS` / `FAIL`
- Issues / remediation: ________________________________________________

## E. Realtime Database automated backup

| Check | Required result | Evidence captured | Result |
|---|---|---|---|
| Automated backup | Enabled for FinClose RTDB | Live configuration | PENDING |
| Data + rules | Both included | Configuration/evidence | PENDING |
| Compression | Gzip enabled | Configuration/evidence | PENDING |
| Retention | At least 30 days | Destination lifecycle/configuration | PENDING |
| Successful run | Latest daily backup completed | Object/backup name and timestamp | PENDING |

Backup destination: _____________________________________
Latest successful backup: _______________________________

## F. Cloud Storage deletion protection

| Check | Required result | Evidence captured | Result |
|---|---|---|---|
| Soft delete | Enabled | Bucket policy/configuration | PENDING |
| Retention | 30 days for controlled pilot | Retention seconds/days | PENDING |
| Bucket identity | Correct FinClose bucket | Bucket name/project | PENDING |

Notes: _________________________________________________________________

## G. Recovery authority and evidence location

- Authorized recovery operator(s): ____________________________________
- Approval authority for ledger recovery: ______________________________
- Evidence storage location: ___________________________________________
- Incident/recovery log location: ______________________________________
- Post-recovery integrity checks required: ledger health, source completeness, balance-sheet reconciliation, close governance and affected period-lock verification.

## H. Final decision

Mandatory items complete: `YES` / `NO`
Unresolved blockers: ___________________________________________________
Overall result: `PASS` / `FAIL`

Operator attestation:

> I verified the recorded configuration and recovery exercise against the live Firebase/Google Cloud project. This record contains no secret keys, tokens or credentials, and the evidence references are sufficient to reproduce the verification.

Operator name: __________________________  Date: ________________________
Checker name: ___________________________  Date: ________________________

### Release flag rule

Only an overall `PASS` justifies setting `FINCLOSE_BACKUP_PITR_VERIFIED=YES`. A partially completed record, screenshots without a restore rehearsal, or policy documentation alone do not satisfy the release gate.
