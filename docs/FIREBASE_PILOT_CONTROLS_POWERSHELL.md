# FinClose Firebase Pilot Controls — PowerShell

Date: 2026-09-07
Script: `scripts/firebase-pilot-controls.ps1`
Scope: non-Vercel Firebase backup/recovery preparation

## Purpose

The helper turns the backup/PITR policy into a repeatable Windows PowerShell workflow. It is read-only unless `-Apply` is supplied and writes a timestamped JSON evidence file under `artifacts/pilot-evidence` by default.

It does **not** activate FinClose PILOT, change any FinClose release latch, modify Vercel, enable RTDB automated backups, or perform a Firestore restore rehearsal.

## Prerequisites

1. Firebase CLI installed and authenticated with an account authorized for project `theantibalcony`.
2. For Cloud Storage soft-delete inspection/change, Google Cloud CLI (`gcloud`) installed and authenticated.
3. Required Firebase/Google Cloud IAM permissions for the requested operations.
4. Blaze/billing eligibility for Firestore PITR and scheduled backups.

Typical authentication checks:

```powershell
firebase login
firebase projects:list

gcloud auth login
gcloud config set project theantibalcony
```

Do not place access tokens, service-account JSON or passwords in command history, evidence files or Git.

## 1. Read-only status first

From the FinClose repository:

```powershell
.\scripts\firebase-pilot-controls.ps1
```

If the FinClose Storage bucket name is known, include it so soft-delete metadata is also inspected:

```powershell
.\scripts\firebase-pilot-controls.ps1 -StorageBucket "YOUR_BUCKET_NAME"
```

The status run checks:

- authenticated Firebase access to `theantibalcony`;
- Firestore database configuration/PITR state;
- Firestore daily/weekly backup schedules;
- available Firestore backups;
- RTDB instance identity;
- Cloud Storage bucket metadata when a bucket is supplied.

It writes an evidence JSON file without changing configuration.

## 2. Apply the safe policy configuration

After reviewing the read-only output:

```powershell
.\scripts\firebase-pilot-controls.ps1 -StorageBucket "YOUR_BUCKET_NAME" -Apply
```

`-Apply` is intentionally limited to:

- enabling Firestore PITR if not already enabled;
- creating a missing daily Firestore backup schedule with 4-week retention;
- creating a missing Sunday weekly Firestore backup schedule with 14-week retention;
- setting the supplied Cloud Storage bucket soft-delete duration to 30 days.

If a daily or weekly schedule already exists, the helper does **not** overwrite it. It records a warning requiring the operator to verify that the existing recurrence/retention matches policy.

These controls can incur Firebase/Google Cloud storage/backup charges.

## 3. Manual controls that remain mandatory

The script cannot complete the release gate by itself.

### RTDB automated backup

In Firebase Console, open Realtime Database > Backups for the FinClose instance and verify/enable:

- daily automated backup;
- application data and Security Rules;
- Gzip compression;
- 30-day lifecycle option;
- at least one successful backup when available.

Record this in `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`.

### Firestore successful backup

A schedule existing is not proof that a backup has completed. After the first scheduled run, capture the backup ID and completion timestamp.

### Restore rehearsal

Perform a **non-destructive restore to a new Firestore database ID**. Do not delete or restore over the live `(default)` database for the pilot rehearsal.

Firebase CLI supports restoring a backup to a new database:

```powershell
firebase firestore:databases:restore --backup "FULL_BACKUP_RESOURCE_NAME" --database "finclose-restore-rehearsal-YYYYMMDD" --project theantibalcony
```

Verify recovered sample records and record the result in `BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md`.

## Evidence and release rule

The helper writes JSON evidence, but `FINCLOSE_BACKUP_PITR_VERIFIED=YES` remains prohibited until:

- PITR is enabled;
- daily and weekly schedules match policy;
- at least one scheduled backup has completed;
- a controlled restore rehearsal passes;
- RTDB automated backup is verified;
- Storage soft delete is verified at 30 days;
- `docs/BACKUP_RECOVERY_VERIFICATION_RECORD_V1.md` is completed with overall `PASS`.

The helper never changes FinClose runtime/release environment variables.
