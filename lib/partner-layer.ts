import crypto from 'node:crypto';

// The partner (accounting firm) layer, as pure logic over a small store: staff invitations, plan
// limits and a usage statement, firm branding, and a close calendar with deadlines.
// It sits beside lib/firm-tenancy.ts and never touches the client's own tenant records.
// There is NO payment provider: billing is a usage statement a person invoices from.

export type FirmRoleName = 'PARTNER' | 'MANAGER' | 'ACCOUNTANT' | 'PAYROLL_SPECIALIST' | 'REVIEWER';
const ROLE_LEVEL: Record<FirmRoleName, number> = { REVIEWER: 10, ACCOUNTANT: 20, PAYROLL_SPECIALIST: 20, MANAGER: 40, PARTNER: 50 };

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

// ---- types --------------------------------------------------------------------------------------

export type FirmInvitation = {
  invitation_id: string;
  firm_id: string;
  email: string; // lower-case
  role: FirmRoleName;
  token_hash: string; // sha256 of the secret; the secret itself is shown once and never stored
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  invited_by: string;
  created_at: number;
  expires_at: number;
  accepted_by?: string;
  accepted_at?: number;
};

export type FirmPlan = {
  firm_id: string;
  plan_name: string;
  price_cents_per_client_month: number;
  currency: string;
  max_clients: number | null; // null = no limit
  max_staff: number | null;
  updated_at: number;
};

export type FirmBranding = {
  firm_id: string;
  display_name: string;
  accent_color: string; // #rrggbb
  logo_url: string | null; // https only
  support_email: string | null;
  footer: string | null;
  updated_at: number;
};

export type FirmSettings = { firm_id: string; close_due_day: number; updated_at: number };

export type CustomDeadline = { deadline_id: string; firm_id: string; company_id: string; title: string; due_date: string; done: boolean; created_by: string; created_at: number };

export interface PartnerStore {
  getInvitation(id: string): Promise<FirmInvitation | null>;
  findInvitationByHash(hash: string): Promise<FirmInvitation | null>;
  listInvitations(firmId: string): Promise<FirmInvitation[]>;
  putInvitation(invitation: FirmInvitation): Promise<void>;
  getPlan(firmId: string): Promise<FirmPlan | null>;
  putPlan(plan: FirmPlan): Promise<void>;
  getBranding(firmId: string): Promise<FirmBranding | null>;
  putBranding(branding: FirmBranding): Promise<void>;
  getSettings(firmId: string): Promise<FirmSettings | null>;
  putSettings(settings: FirmSettings): Promise<void>;
  listDeadlines(firmId: string): Promise<CustomDeadline[]>;
  putDeadline(deadline: CustomDeadline): Promise<void>;
  deleteDeadline(firmId: string, deadlineId: string): Promise<void>;
}

export class InMemoryPartnerStore implements PartnerStore {
  private invitations = new Map<string, FirmInvitation>();
  private plans = new Map<string, FirmPlan>();
  private brandings = new Map<string, FirmBranding>();
  private settings = new Map<string, FirmSettings>();
  private deadlines = new Map<string, CustomDeadline>();
  async getInvitation(id: string) { const v = this.invitations.get(id); return v ? { ...v } : null; }
  async findInvitationByHash(hash: string) { for (const v of this.invitations.values()) if (v.token_hash === hash) return { ...v }; return null; }
  async listInvitations(firmId: string) { return [...this.invitations.values()].filter(v => v.firm_id === firmId).map(v => ({ ...v })).sort((a, b) => b.created_at - a.created_at); }
  async putInvitation(i: FirmInvitation) { this.invitations.set(i.invitation_id, { ...i }); }
  async getPlan(firmId: string) { const v = this.plans.get(firmId); return v ? { ...v } : null; }
  async putPlan(p: FirmPlan) { this.plans.set(p.firm_id, { ...p }); }
  async getBranding(firmId: string) { const v = this.brandings.get(firmId); return v ? { ...v } : null; }
  async putBranding(b: FirmBranding) { this.brandings.set(b.firm_id, { ...b }); }
  async getSettings(firmId: string) { const v = this.settings.get(firmId); return v ? { ...v } : null; }
  async putSettings(s: FirmSettings) { this.settings.set(s.firm_id, { ...s }); }
  async listDeadlines(firmId: string) { return [...this.deadlines.values()].filter(v => v.firm_id === firmId).map(v => ({ ...v })); }
  async putDeadline(d: CustomDeadline) { this.deadlines.set(`${d.firm_id}|${d.deadline_id}`, { ...d }); }
  async deleteDeadline(firmId: string, id: string) { this.deadlines.delete(`${firmId}|${id}`); }
}

// ---- staff invitations ----------------------------------------------------------------------------

export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function assertValidRole(value: unknown): FirmRoleName {
  const role = String(value || '').toUpperCase() as FirmRoleName;
  if (!ROLE_LEVEL[role]) throw httpError('role must be PARTNER, MANAGER, ACCOUNTANT, PAYROLL_SPECIALIST or REVIEWER', 400);
  return role;
}

// The caller has already been checked as an active MANAGER or above. Nobody can invite someone to a
// role above their own, so a manager cannot create a partner.
export async function inviteStaff(
  store: PartnerStore,
  args: { firm_id: string; actor_user_id: string; actor_role: FirmRoleName; email: unknown; role: unknown; active_staff: number },
  now = Date.now()
): Promise<{ invitation: Omit<FirmInvitation, 'token_hash'>; token: string }> {
  const email = String(args.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw httpError('a valid email address is required', 400);
  const role = assertValidRole(args.role);
  if (ROLE_LEVEL[role] > ROLE_LEVEL[args.actor_role]) throw httpError('you cannot invite someone to a higher role than your own', 403);
  const plan = await store.getPlan(args.firm_id);
  const pending = (await store.listInvitations(args.firm_id)).filter(i => i.status === 'PENDING' && i.expires_at > now);
  const alreadyPendingForEmail = pending.filter(i => i.email === email).length;
  if (plan?.max_staff != null && args.active_staff + pending.length - alreadyPendingForEmail >= plan.max_staff) {
    throw httpError(`the plan allows ${plan.max_staff} staff and they are all taken or invited`, 409);
  }
  for (const old of pending.filter(i => i.email === email)) await store.putInvitation({ ...old, status: 'REVOKED' });
  const token = crypto.randomBytes(32).toString('base64url');
  const invitation: FirmInvitation = {
    invitation_id: `inv_${crypto.randomBytes(8).toString('hex')}`,
    firm_id: args.firm_id, email, role, token_hash: hashToken(token), status: 'PENDING',
    invited_by: args.actor_user_id, created_at: now, expires_at: now + INVITATION_LIFETIME_MS
  };
  await store.putInvitation(invitation);
  const { token_hash: _hidden, ...safe } = invitation;
  return { invitation: safe, token };
}

// The invitee signs in and presents the token. Their verified email must be the one invited, so a
// forwarded link is useless to anyone else. `addMember` writes the firm membership.
export async function acceptStaffInvitation(
  store: PartnerStore,
  args: { token: unknown; user: { user_id: string; email: string; email_verified: boolean; name?: string } },
  addMember: (firmId: string, user: { user_id: string; email: string; name?: string }, role: FirmRoleName) => Promise<unknown>,
  now = Date.now()
): Promise<{ firm_id: string; role: FirmRoleName }> {
  const token = String(args.token || '');
  if (token.length < 20) throw httpError('the invitation link is not valid', 400);
  const invitation = await store.findInvitationByHash(hashToken(token));
  if (!invitation) throw httpError('the invitation link is not valid', 404);
  if (invitation.status === 'ACCEPTED') throw httpError('this invitation has already been used', 409);
  if (invitation.status === 'REVOKED') throw httpError('this invitation was withdrawn', 410);
  if (now > invitation.expires_at) throw httpError('this invitation has expired; ask for a new one', 410);
  if (!args.user.email_verified) throw httpError('verify your email address before accepting', 403);
  if (args.user.email.trim().toLowerCase() !== invitation.email) throw httpError('this invitation was sent to a different email address', 403);
  await addMember(invitation.firm_id, { user_id: args.user.user_id, email: args.user.email, name: args.user.name }, invitation.role);
  await store.putInvitation({ ...invitation, status: 'ACCEPTED', accepted_by: args.user.user_id, accepted_at: now });
  return { firm_id: invitation.firm_id, role: invitation.role };
}

export async function revokeStaffInvitation(store: PartnerStore, firmId: string, invitationId: string): Promise<void> {
  const invitation = await store.getInvitation(invitationId);
  if (!invitation || invitation.firm_id !== firmId) throw httpError('invitation not found', 404);
  if (invitation.status !== 'PENDING') throw httpError(`this invitation is already ${invitation.status.toLowerCase()}`, 409);
  await store.putInvitation({ ...invitation, status: 'REVOKED' });
}

// ---- plan, limits, usage --------------------------------------------------------------------------

export function validatePlan(firmId: string, input: Record<string, unknown>, now = Date.now()): FirmPlan {
  const price = Number(input.price_cents_per_client_month);
  if (!Number.isInteger(price) || price < 0 || price > 100_000) throw httpError('price_cents_per_client_month must be a whole number of cents from 0 to 100000', 400);
  const limit = (value: unknown, field: string) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) throw httpError(`${field} must be a whole number from 1 to 100000, or empty for no limit`, 400);
    return n;
  };
  const currency = String(input.currency ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw httpError('currency must be a 3-letter code', 400);
  return {
    firm_id: firmId,
    plan_name: String(input.plan_name ?? 'Standard').trim().slice(0, 60) || 'Standard',
    price_cents_per_client_month: price,
    currency,
    max_clients: limit(input.max_clients, 'max_clients'),
    max_staff: limit(input.max_staff, 'max_staff'),
    updated_at: now
  };
}

export function assertCanAddClient(plan: FirmPlan | null, activeAndPendingClients: number) {
  if (plan?.max_clients != null && activeAndPendingClients >= plan.max_clients) {
    throw httpError(`the plan allows ${plan.max_clients} clients and they are all taken. Raise the limit in the plan to add more`, 409);
  }
}

export type DelegationLike = { organization_id: string; status: string; accepted_at?: number; revoked_at?: number };

const monthBounds = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw httpError('month must look like 2026-03', 400);
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
  const end = Date.UTC(Number(match[1]), Number(match[2]), 1) - 1;
  return { start, end };
};

export type UsageStatement = {
  status: 'USAGE_STATEMENT_NOT_AN_INVOICE';
  payment_provider: 'NONE';
  firm_id: string;
  month: string;
  plan: Pick<FirmPlan, 'plan_name' | 'price_cents_per_client_month' | 'currency'>;
  billable_clients: { organization_id: string; name: string; reason: string }[];
  total_cents: number;
  notes: string[];
};

// A client is billable for a month if the delegation was accepted by the end of the month and not
// revoked before it began. No proration: one client, one month, one charge.
export function usageStatement(plan: FirmPlan | null, firmId: string, month: string, delegations: DelegationLike[], names: Record<string, string>): UsageStatement {
  const { start, end } = monthBounds(month);
  const billable = delegations
    .filter(d => d.accepted_at !== undefined && d.accepted_at <= end && (d.revoked_at === undefined || d.revoked_at >= start) && (d.status === 'ACTIVE' || d.status === 'REVOKED'))
    .map(d => ({ organization_id: d.organization_id, name: names[d.organization_id] || d.organization_id, reason: d.status === 'REVOKED' ? 'active for part of the month, then ended' : 'active' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const price = plan?.price_cents_per_client_month ?? 0;
  return {
    status: 'USAGE_STATEMENT_NOT_AN_INVOICE',
    payment_provider: 'NONE',
    firm_id: firmId,
    month,
    plan: { plan_name: plan?.plan_name ?? '(no plan set)', price_cents_per_client_month: price, currency: plan?.currency ?? 'EUR' },
    billable_clients: billable,
    total_cents: billable.length * price,
    notes: [
      'A count of clients and a price. FinClose collects no money: no card or payment provider is connected.',
      'No proration and no revenue share are calculated.',
      ...(plan ? [] : ['No plan has been set, so the price is zero.'])
    ]
  };
}

export function usageCsv(s: UsageStatement): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
  const rows = [['month', 'organisation', 'reason', 'price', 'currency'].map(cell).join(',')];
  for (const c of s.billable_clients) rows.push([s.month, c.name, c.reason, (s.plan.price_cents_per_client_month / 100).toFixed(2), s.plan.currency].map(cell).join(','));
  rows.push(['TOTAL', '', `${s.billable_clients.length} clients`, (s.total_cents / 100).toFixed(2), s.plan.currency].map(cell).join(','));
  return rows.join('\n') + '\n';
}

// ---- branding -------------------------------------------------------------------------------------

export function validateBranding(firmId: string, input: Record<string, unknown>, now = Date.now()): FirmBranding {
  const name = String(input.display_name ?? '').trim().slice(0, 80);
  if (!name) throw httpError('display_name is required', 400);
  const color = String(input.accent_color ?? '#1f4e79').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw httpError('accent_color must look like #1f4e79', 400);
  let logo: string | null = null;
  if (input.logo_url) {
    const raw = String(input.logo_url).trim();
    let url: URL;
    try { url = new URL(raw); } catch { throw httpError('logo_url must be a web address', 400); }
    if (url.protocol !== 'https:' || url.username || url.password || raw.length > 300) throw httpError('logo_url must be an https address without a password', 400);
    logo = url.toString();
  }
  const email = input.support_email ? String(input.support_email).trim().toLowerCase() : null;
  if (email && !EMAIL.test(email)) throw httpError('support_email is not a valid address', 400);
  const footer = input.footer ? String(input.footer).replace(/[\r\n]+/g, ' ').trim().slice(0, 200) : null;
  return { firm_id: firmId, display_name: name, accent_color: color.toLowerCase(), logo_url: logo, support_email: email, footer, updated_at: now };
}

// What a client sees: the firm's name and colour, nothing else about the firm. The logo and footer
// are included only when set. Never any staff or other client information.
export function publicBranding(b: FirmBranding | null) {
  return b ? { display_name: b.display_name, accent_color: b.accent_color, logo_url: b.logo_url, support_email: b.support_email, footer: b.footer } : null;
}

export function brandPackMarkdown(markdown: string, b: Pick<FirmBranding, 'display_name' | 'support_email' | 'footer'> | null): string {
  if (!b) return markdown;
  const head = `> Prepared for you by **${b.display_name}**${b.support_email ? ` (${b.support_email})` : ''}\n\n`;
  const foot = b.footer ? `\n\n---\n${b.footer}\n` : '';
  return head + markdown + foot;
}

// ---- close calendar and deadlines --------------------------------------------------------------------

export type CalendarClient = { company_id: string; name: string; jurisdiction: string; vat_registered: boolean };
export type CalendarItem = {
  key: string;
  company_id: string;
  client: string;
  kind: 'MONTH_CLOSE' | 'VAT_RETURN' | 'CUSTOM';
  title: string;
  due_date: string; // YYYY-MM-DD
  period: string | null; // YYYY-MM
  source: 'FIRM_SETTING' | 'RULE_UNVERIFIED' | 'ENTERED_BY_FIRM';
  state: 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING';
  days_left: number;
};

// Day of the month after the period by which the VAT return is due. Estonia: the 20th, as recalled
// and NOT checked against EMTA, so items built from it say so. Countries not listed get no
// generated VAT deadline; the firm adds one by hand.
const VAT_DUE_DAY: Record<string, number> = { EE: 20 };

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function validateSettings(firmId: string, input: Record<string, unknown>, now = Date.now()): FirmSettings {
  const day = Number(input.close_due_day);
  if (!Number.isInteger(day) || day < 1 || day > 28) throw httpError('close_due_day must be a whole number from 1 to 28', 400);
  return { firm_id: firmId, close_due_day: day, updated_at: now };
}

export function buildCalendar(args: {
  today: string; // YYYY-MM-DD
  horizon_days: number;
  clients: CalendarClient[];
  settings: FirmSettings | null;
  custom: CustomDeadline[];
  done: ReadonlySet<string>; // keys of items known to be complete, e.g. "c1|MONTH_CLOSE|2026-02"
}): CalendarItem[] {
  const closeDay = args.settings?.close_due_day ?? 10;
  const today = dayNumber(args.today);
  const [ty, tm] = args.today.split('-').map(Number);
  const items: CalendarItem[] = [];
  const state = (due: string, done: boolean): { state: CalendarItem['state']; days_left: number } => {
    const left = dayNumber(due) - today;
    return { state: done ? 'DONE' : left < 0 ? 'OVERDUE' : left <= 7 ? 'DUE_SOON' : 'UPCOMING', days_left: left };
  };
  // Periods whose deadline falls from two months back to the horizon, so a missed one still shows as overdue.
  for (let back = -2; back <= Math.ceil(args.horizon_days / 28) + 1; back += 1) {
    const base = new Date(Date.UTC(ty, tm - 1 + back, 1));
    const py = base.getUTCFullYear(); const pm = base.getUTCMonth() + 1; // the period (month being closed)
    const next = new Date(Date.UTC(py, pm, 1));
    const ny = next.getUTCFullYear(); const nm = next.getUTCMonth() + 1;
    const period = `${py}-${pad(pm)}`;
    for (const client of args.clients) {
      const closeDue = `${ny}-${pad(nm)}-${pad(Math.min(closeDay, lastDay(ny, nm)))}`;
      const closeKey = `${client.company_id}|MONTH_CLOSE|${period}`;
      items.push({ key: closeKey, company_id: client.company_id, client: client.name, kind: 'MONTH_CLOSE', title: `Close ${period}`, due_date: closeDue, period, source: 'FIRM_SETTING', ...state(closeDue, args.done.has(closeKey)) });
      const vatDay = VAT_DUE_DAY[client.jurisdiction.toUpperCase()];
      if (client.vat_registered && vatDay) {
        const vatDue = `${ny}-${pad(nm)}-${pad(Math.min(vatDay, lastDay(ny, nm)))}`;
        const vatKey = `${client.company_id}|VAT_RETURN|${period}`;
        items.push({ key: vatKey, company_id: client.company_id, client: client.name, kind: 'VAT_RETURN', title: `VAT return for ${period}`, due_date: vatDue, period, source: 'RULE_UNVERIFIED', ...state(vatDue, args.done.has(vatKey)) });
      }
    }
  }
  const names = new Map(args.clients.map(c => [c.company_id, c.name]));
  for (const d of args.custom) {
    if (!names.has(d.company_id)) continue;
    items.push({ key: `custom|${d.deadline_id}`, company_id: d.company_id, client: names.get(d.company_id)!, kind: 'CUSTOM', title: d.title, due_date: d.due_date, period: null, source: 'ENTERED_BY_FIRM', ...state(d.due_date, d.done) });
  }
  return items
    .filter(i => i.state === 'OVERDUE' || i.state === 'DONE' ? i.days_left >= -62 : i.days_left <= args.horizon_days)
    .filter(i => !(i.state === 'DONE' && i.days_left < -7))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.client.localeCompare(b.client));
}

export function validateCustomDeadline(firmId: string, input: Record<string, unknown>, actor: string, now = Date.now()): CustomDeadline {
  const title = String(input.title ?? '').trim().slice(0, 120);
  if (!title) throw httpError('title is required', 400);
  const due = String(input.due_date ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m || new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDate() !== +m[3]) throw httpError('due_date must be a real date like 2026-04-15', 400);
  const company = String(input.company_id ?? '').trim();
  if (!company) throw httpError('company_id is required', 400);
  return { deadline_id: `dl_${crypto.randomBytes(6).toString('hex')}`, firm_id: firmId, company_id: company, title, due_date: due, done: false, created_by: actor, created_at: now };
}

// ---- cross-client exception queue and workload -------------------------------------------------------

export type PackDigest = {
  company_id: string;
  client: string;
  pack_id: string | null;
  pack_status: 'OPEN' | 'SIGNED_OFF' | 'NONE';
  readiness_percent: number | null;
  high_open: number;
  medium_open: number;
  low_open: number;
  exceptions: { code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string }[];
};

export function buildExceptionQueue(digests: PackDigest[], calendar: CalendarItem[]) {
  const nextDue = new Map<string, number>();
  for (const item of calendar) if (item.state !== 'DONE') nextDue.set(item.company_id, Math.min(nextDue.get(item.company_id) ?? Infinity, item.days_left));
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return digests
    .flatMap(d => d.exceptions.map(e => ({ company_id: d.company_id, client: d.client, pack_id: d.pack_id, ...e, days_to_next_deadline: nextDue.get(d.company_id) ?? null })))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (a.days_to_next_deadline ?? 9999) - (b.days_to_next_deadline ?? 9999) || a.client.localeCompare(b.client));
}

export function workloadByStaff(assignments: { user_id: string; email?: string; company_id: string }[], digests: PackDigest[]) {
  const open = new Map(digests.map(d => [d.company_id, d.high_open + d.medium_open + d.low_open]));
  const out = new Map<string, { user_id: string; email: string; clients: number; open_items: number }>();
  for (const a of assignments) {
    const row = out.get(a.user_id) || { user_id: a.user_id, email: a.email || '', clients: 0, open_items: 0 };
    row.clients += 1;
    row.open_items += open.get(a.company_id) ?? 0;
    out.set(a.user_id, row);
  }
  return [...out.values()].sort((a, b) => b.open_items - a.open_items);
}
