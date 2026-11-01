# Retention and scheduled purge

Checked 2026-10-29 against the code in this repository. **The periods below are FinClose's own defaults, not a legal requirement.** How long a company must keep accounting records is for the company and its accountant to confirm (the default for signed-off packs, 365 days, is a placeholder for that decision).

| Record | Default kept | Setting | Counted from |
|---|---|---|---|
| Open or replaced review pack, and the statement stored with it | 90 days | `FINCLOSE_PACK_RETENTION_DAYS` | creation |
| Signed-off review pack, its stored statement and the receipts it cites | 365 days | `FINCLOSE_SIGNED_OFF_RETENTION_DAYS` | sign-off (never shortens an existing expiry) |
| Receipt or invoice | 90 days | `FINCLOSE_DOCUMENT_RETENTION_DAYS` | upload; moved later when a pack cites it |
| Learned category rules, company account numbers | until the company's data is erased | none | |

Each setting is a whole number of days from 1 to 3650. Anything else is ignored and the default is used.

## How deletion happens
1. **Firestore TTL policies** (declared in `firestore.indexes.json`, **not yet deployed**) delete expired documents on their own, usually within a day or two of expiry. They cannot delete the files in Cloud Storage.
2. **The scheduled purge** `GET|POST /api/maintenance/purge` deletes expired packs, stored statements, receipt records **and the receipt files**, across all companies, up to 200 of each per run. The response is counts only: `packs`, `documents`, `failed`, `more` (true when another run is needed). `vercel.json` schedules it daily at 03:30 UTC.
3. Reading an expired pack already returns "gone" (410) before either of the above has run.

## Securing the purge route
Send `Authorization: Bearer <secret>`, where the secret is `CRON_SECRET` (Vercel Cron sends it automatically when set) or `FINCLOSE_CRON_TOKEN`. A secret shorter than 16 characters is ignored. With no secret configured the route answers 503 and does nothing. A wrong or missing token answers 401.

## To do before this is real
- Set `CRON_SECRET` in the deployment. Without it the daily purge answers 503 and nothing is purged by the schedule.
- Deploy `firestore.indexes.json` so the TTL policies exist.
- Confirm the signed-off period with an Estonian accountant.
- A receipt uploaded and linked before this change keeps its old 90-day expiry until its pack is next answered or signed off.
- Not tested: the TTL policies themselves (the emulator does not run them), the Vercel cron schedule, or the purge against a real project.
