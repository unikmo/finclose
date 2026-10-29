// How long each kind of stored record is kept. Defaults are FinClose's own choice, NOT a legal period:
// how long an accounting record must be kept is for the company and its accountant to confirm.
// Each period can be changed per deployment with an environment variable; a bad value falls back to the default.

export const DAY_MS = 86_400_000;

export type RetentionPolicy = {
  open_pack_days: number; // open and superseded packs, and the statement stored with them
  signed_off_pack_days: number; // a pack an accountant accepted, counted from the sign-off
  document_days: number; // receipts and invoices not tied to a pack that needs them longer
};

const DEFAULTS: RetentionPolicy = { open_pack_days: 90, signed_off_pack_days: 365, document_days: 90 };
const MAX_DAYS = 3650;

function days(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : fallback;
}

export function retentionPolicy(env: Record<string, string | undefined> = process.env): RetentionPolicy {
  return {
    open_pack_days: days(env.FINCLOSE_PACK_RETENTION_DAYS, DEFAULTS.open_pack_days),
    signed_off_pack_days: days(env.FINCLOSE_SIGNED_OFF_RETENTION_DAYS, DEFAULTS.signed_off_pack_days),
    document_days: days(env.FINCLOSE_DOCUMENT_RETENTION_DAYS, DEFAULTS.document_days)
  };
}

export const expiryFrom = (now: number, retentionDays: number) => now + retentionDays * DAY_MS;
