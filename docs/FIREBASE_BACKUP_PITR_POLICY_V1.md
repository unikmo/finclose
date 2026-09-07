# FinClose Firebase Backup & Recovery Policy v1

Effective date: 2026-09-07
Scope: controlled PILOT
Status: POLICY DEFINED; LIVE ENABLEMENT/VERIFICATION STILL REQUIRED

## Objective

FinClose must be recoverable from accidental deletion, application corruption and operator error before controlled real customer financial data is admitted. The recovery design covers the authoritative Firestore ledger, the RTDB workflow/control plane and Firebase Cloud Storage financial artifacts.

This document defines the required pilot policy. It does not assert that the settings are already enabled in the `theantibalcony` Firebase/Google Cloud project.

## 1. Cloud Firestore — authoritative ledger

Required before PILOT activation:

### Point-in-time recovery

- Enable Firestore point-in-time recovery (PITR) for the default FinClose ledger database.
- Required retention capability: seven-day PITR window.
- Use PITR for surgical recovery from accidental writes/deletions and short-RPO incidents.
- Record the `earliestVersionTime` / enabled status as release evidence.

Current Google/Firebase documentation states that enabled PITR retains document versions for up to seven days at minute granularity. PITR is disabled by default and requires billing.

### Scheduled backups

Configure both permitted schedule layers for the default database:

- **Daily backup:** retain for 4 weeks.
- **Weekly backup:** Sunday, retain for 14 weeks.

Firestore currently permits up to one daily and one weekly backup schedule per database, with a maximum retention period of 14 weeks. Backups are intended to protect against application-level corruption and accidental deletion and can be restored to a database in the same project.

### Restore evidence

Before the first real-data pilot customer:

1. Confirm at least one scheduled backup has successfully completed.
2. Record the backup schedule configuration and latest successful backup timestamp.
3. Perform a non-destructive restore rehearsal to a separate test database or equivalent controlled recovery exercise; do not delete the live default database for a rehearsal.
4. Record who performed the rehearsal, the source backup/PITR timestamp, destination, result and any recovery issues.

## 2. Firebase Realtime Database — workflow/control plane

Required before PILOT activation:

- Enable Firebase Realtime Database automated daily backups for the production RTDB instance.
- Backups must include both application data and Security Rules.
- Use Gzip compression.
- Retain at least 30 days of daily RTDB backups for the controlled pilot.
- Confirm the backup destination bucket and latest successful backup in the Firebase console.

Firebase's automated backup feature creates daily JSON backups of database data and Security Rules in a Cloud Storage bucket for eligible Blaze-plan projects and supports a 30-day lifecycle option.

RTDB is not the authoritative accounting ledger, but loss of orchestration, tenant mappings, workflow state or certification/audit references can still materially disrupt FinClose. RTDB therefore requires an independent backup layer rather than relying only on Firestore recovery.

## 3. Firebase Cloud Storage — financial source artifacts

Required before PILOT activation:

- Confirm Cloud Storage soft delete is enabled for the FinClose bucket.
- Pilot target retention: **30 days** for soft-deleted objects/buckets, unless cost or legal constraints require a separately documented change.
- Do not rely on Object Versioning as the primary deletion-protection control. Google currently recommends soft delete for protection from accidental or malicious permanent deletion, including bucket-level deletion scenarios.
- Preserve the application's SHA-256 upload fingerprints in RTDB/audit evidence so restored files can be revalidated against their recorded identity.
- Quarantined/rejected files remain subject to the controlled pilot upload procedure and must not become operational merely because they are restored.

Cloud Storage currently enables soft delete by default on supported buckets with seven-day retention and allows configuration from 7 to 90 days. FinClose's pilot policy deliberately requires 30 days once verified/configured.

## 4. Recovery authority

For the controlled pilot:

- Recovery configuration changes require an administrator with the relevant Firebase/Google Cloud permissions.
- A recovery of authoritative financial ledger data must be treated as a controlled incident, not an ordinary application action.
- Record the reason, actor, source recovery point/backup, destination, start/completion time and reconciliation result.
- After any recovery, FinClose must re-run ledger/close integrity checks before resuming write operations on affected companies/periods.

## 5. Recovery priority

Priority order after a data-loss/corruption incident:

1. Stop affected writes and preserve current evidence.
2. Determine whether the issue is isolated or systemic.
3. Prefer surgical Firestore PITR recovery when the affected ledger scope is limited and the correct recovery point is within the PITR window.
4. Use a scheduled backup/clone/restore path for broader Firestore recovery.
5. Restore RTDB workflow state only after confirming it will not conflict with authoritative Firestore ledger truth.
6. Restore Cloud Storage source artifacts as needed and validate SHA-256 fingerprints before re-linking them to workflow evidence.
7. Re-run reconciliation, source-completeness and close-governance controls before normal operation resumes.

Where RTDB workflow state and authoritative Firestore financial evidence disagree after recovery, **Firestore remains the accounting/close source of truth**.

## 6. Pilot release evidence required

`FINCLOSE_BACKUP_PITR_VERIFIED=YES` may be set only after the operator has verified and retained evidence for all of the following:

- Firestore PITR enabled;
- daily Firestore backup schedule enabled with required retention;
- weekly Firestore backup schedule enabled with required retention;
- at least one successful Firestore scheduled backup;
- Firestore restore/recovery rehearsal completed successfully;
- RTDB automated daily backup enabled and latest backup successful;
- Cloud Storage soft-delete policy verified at the required pilot retention;
- recovery responsibilities and evidence location documented.

This policy document alone is **not** sufficient to set the verification flag.

## Official platform basis reviewed for v1

Policy choices were checked against the current Firebase/Google Cloud documentation for:

- Cloud Firestore point-in-time recovery;
- Cloud Firestore scheduled backups and disaster recovery;
- Firebase Realtime Database automated backups;
- Google Cloud Storage soft delete and Object Versioning.

Revalidate the platform capabilities if this policy is materially revised or before a later unrestricted production release.
