// Payroll is released to chosen customers, one country at a time. Nothing is released by default.
// The unit is the customer's organisation (the account that owns the companies), so it survives an
// email change and covers all that customer's companies in the released countries.
//
// Two locks, both must be open for a real payroll run:
//  1. this release (set by the operator only), and
//  2. the country's rule pack being VERIFIED_BASIC_RULES (set in code after local legal review).
// A country cannot be released while its pack is not verified, so nobody is let into a flow that
// the engine would refuse to run.

export type PayrollRelease = { organization_id: string; countries: string[]; note: string; released_at: number };

export interface PayrollReleaseStore {
  get(organizationId: string): Promise<PayrollRelease | null>;
  put(release: PayrollRelease): Promise<void>;
  remove(organizationId: string): Promise<void>;
  list(): Promise<PayrollRelease[]>;
}

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export function validOrganizationId(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(text)) throw httpError('organization_id is not valid', 400);
  return text;
}

export class InMemoryPayrollReleaseStore implements PayrollReleaseStore {
  private rows = new Map<string, PayrollRelease>();
  async get(id: string) { return this.rows.get(id) || null; }
  async put(r: PayrollRelease) { this.rows.set(r.organization_id, r); }
  async remove(id: string) { this.rows.delete(id); }
  async list() { return [...this.rows.values()]; }
}

type RealtimeLike = { ref(path: string): { once(e: 'value'): Promise<{ exists(): boolean; val(): unknown }>; set(v: unknown): Promise<void>; remove(): Promise<void> } };

// Realtime Database node finclose_payroll_release/<organization_id>. database.rules.json denies every
// client read and write, so only this server (admin access) can see or change it.
export class RealtimePayrollReleaseStore implements PayrollReleaseStore {
  private db: RealtimeLike;
  constructor(db: RealtimeLike) { this.db = db; }
  private node = (id: string) => this.db.ref(`finclose_payroll_release/${id}`);
  async get(id: string) {
    const snap = await this.node(id).once('value');
    return snap.exists() ? (snap.val() as PayrollRelease) : null;
  }
  async put(r: PayrollRelease) { await this.node(r.organization_id).set(r); }
  async remove(id: string) { await this.node(id).remove(); }
  async list() {
    const snap = await this.db.ref('finclose_payroll_release').once('value');
    return snap.exists() ? Object.values(snap.val() as Record<string, PayrollRelease>) : [];
  }
}

// verified: the countries whose rule pack is VERIFIED_BASIC_RULES right now.
export async function setPayrollRelease(
  store: PayrollReleaseStore,
  input: { organization_id: unknown; countries: unknown; note?: unknown },
  verified: string[],
  now = Date.now()
): Promise<PayrollRelease | null> {
  const organization_id = validOrganizationId(input.organization_id);
  if (!Array.isArray(input.countries)) throw httpError('countries must be a list like ["GE"]; an empty list withdraws the release', 400);
  const countries = [...new Set(input.countries.map(c => String(c).trim().toUpperCase()))];
  if (countries.length === 0) { await store.remove(organization_id); return null; }
  for (const c of countries) {
    if (!/^[A-Z]{2}$/.test(c)) throw httpError(`"${c}" is not a two-letter country code`, 400);
    if (!verified.includes(c)) throw httpError(`payroll for ${c} cannot be released: its rule pack is not verified`, 409);
  }
  const release = { organization_id, countries, note: String(input.note ?? '').slice(0, 200), released_at: now };
  await store.put(release);
  return release;
}

export async function assertPayrollReleased(store: PayrollReleaseStore, organizationId: string | null | undefined, country: string) {
  const release = organizationId ? await store.get(organizationId) : null;
  if (!release || !release.countries.includes(String(country).toUpperCase())) {
    throw httpError(`payroll is not released for this account in ${String(country).toUpperCase() || 'this country'}. Ask your FinClose partner`, 403);
  }
}
