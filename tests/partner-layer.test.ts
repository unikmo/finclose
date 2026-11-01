import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptStaffInvitation, assertCanAddClient, brandPackMarkdown, buildCalendar, buildExceptionQueue, inviteStaff, InMemoryPartnerStore,
  publicBranding, revokeStaffInvitation, usageCsv, usageStatement, validateBranding, validateCustomDeadline, validatePlan, validateSettings,
  workloadByStaff, INVITATION_LIFETIME_MS, type PackDigest
} from '../lib/partner-layer.ts';

const NOW = Date.UTC(2026, 2, 15);
const invite = (store: InMemoryPartnerStore, over: Record<string, unknown> = {}) =>
  inviteStaff(store, { firm_id: 'f1', actor_user_id: 'boss', actor_role: 'PARTNER', email: 'Ann@Firm.example', role: 'ACCOUNTANT', active_staff: 1, ...over } as never, NOW);
const ann = { user_id: 'u-ann', email: 'ann@firm.example', email_verified: true, name: 'Ann' };

test('an invitation is stored hashed, shown once, and accepted only by the invited verified email', async () => {
  const store = new InMemoryPartnerStore();
  const { invitation, token } = await invite(store);
  assert.equal(invitation.email, 'ann@firm.example');
  assert.ok(!JSON.stringify(await store.listInvitations('f1')).includes(token), 'the secret is not stored');
  const joined: unknown[] = [];
  const add = async (firm: string, user: unknown, role: string) => { joined.push([firm, user, role]); };

  await assert.rejects(() => acceptStaffInvitation(store, { token, user: { ...ann, email: 'bob@firm.example' } }, add, NOW + 1), /different email/);
  await assert.rejects(() => acceptStaffInvitation(store, { token, user: { ...ann, email_verified: false } }, add, NOW + 1), /verify your email/);
  await assert.rejects(() => acceptStaffInvitation(store, { token: 'x'.repeat(30), user: ann }, add, NOW + 1), /not valid/);
  assert.equal(joined.length, 0);

  assert.deepEqual(await acceptStaffInvitation(store, { token, user: ann }, add, NOW + 1), { firm_id: 'f1', role: 'ACCOUNTANT' });
  assert.equal(joined.length, 1);
  await assert.rejects(() => acceptStaffInvitation(store, { token, user: ann }, add, NOW + 2), /already been used/);
});

test('invitations expire, can be withdrawn, and a re-invite replaces the earlier one', async () => {
  const store = new InMemoryPartnerStore();
  const first = await invite(store);
  await assert.rejects(() => acceptStaffInvitation(store, { token: first.token, user: ann }, async () => undefined, NOW + INVITATION_LIFETIME_MS + 1), /expired/);
  const second = await invite(store);
  await assert.rejects(() => acceptStaffInvitation(store, { token: first.token, user: ann }, async () => undefined, NOW + 5), /withdrawn/);
  await revokeStaffInvitation(store, 'f1', second.invitation.invitation_id);
  await assert.rejects(() => acceptStaffInvitation(store, { token: second.token, user: ann }, async () => undefined, NOW + 5), /withdrawn/);
  await assert.rejects(() => revokeStaffInvitation(store, 'other-firm', second.invitation.invitation_id), /not found/);
  await assert.rejects(() => revokeStaffInvitation(store, 'f1', second.invitation.invitation_id), /already revoked/);
});

test('nobody invites above their own role, and bad input is refused', async () => {
  const store = new InMemoryPartnerStore();
  await assert.rejects(() => invite(store, { actor_role: 'MANAGER', role: 'PARTNER' }), /higher role/);
  await invite(store, { actor_role: 'MANAGER', role: 'MANAGER', email: 'm@firm.example' });
  await assert.rejects(() => invite(store, { email: 'not-an-email' }), /valid email/);
  await assert.rejects(() => invite(store, { role: 'KING' }), /role must be/);
});

test('the staff limit counts people already in and invitations still open', async () => {
  const store = new InMemoryPartnerStore();
  await store.putPlan(validatePlan('f1', { price_cents_per_client_month: 500, max_staff: 3 }, NOW));
  await invite(store, { email: 'a@firm.example', active_staff: 1 });
  await invite(store, { email: 'b@firm.example', active_staff: 1 });
  await assert.rejects(() => invite(store, { email: 'c@firm.example', active_staff: 1 }), /allows 3 staff/);
  await invite(store, { email: 'a@firm.example', active_staff: 1 }); // re-inviting the same address does not use a new place
});

test('plan validation and the client limit', () => {
  const plan = validatePlan('f1', { plan_name: 'Pilot', price_cents_per_client_month: 900, currency: 'eur', max_clients: 2 }, NOW);
  assert.deepEqual({ p: plan.price_cents_per_client_month, c: plan.currency, m: plan.max_clients, s: plan.max_staff }, { p: 900, c: 'EUR', m: 2, s: null });
  assert.throws(() => validatePlan('f1', { price_cents_per_client_month: -1 }), /whole number of cents/);
  assert.throws(() => validatePlan('f1', { price_cents_per_client_month: 9.5 }), /whole number of cents/);
  assert.throws(() => validatePlan('f1', { price_cents_per_client_month: 100, max_clients: 0 }), /max_clients/);
  assert.throws(() => validatePlan('f1', { price_cents_per_client_month: 100, currency: 'euro' }), /3-letter/);
  assert.doesNotThrow(() => assertCanAddClient(plan, 1));
  assert.throws(() => assertCanAddClient(plan, 2), /allows 2 clients/);
  assert.doesNotThrow(() => assertCanAddClient(null, 500));
});

test('the usage statement bills a client for any month it was active, with no proration', () => {
  const plan = validatePlan('f1', { price_cents_per_client_month: 900 }, NOW);
  const d = (org: string, status: string, acc?: [number, number, number], rev?: [number, number, number]) => ({
    organization_id: org, status, accepted_at: acc && Date.UTC(...(acc as [number, number, number])), revoked_at: rev && Date.UTC(...(rev as [number, number, number]))
  });
  const delegations = [
    d('stays', 'ACTIVE', [2026, 0, 10]),
    d('joins-late', 'ACTIVE', [2026, 2, 31]),
    d('joins-next-month', 'ACTIVE', [2026, 3, 1]),
    d('left-mid-month', 'REVOKED', [2026, 0, 1], [2026, 2, 5]),
    d('left-before', 'REVOKED', [2026, 0, 1], [2026, 1, 20]),
    d('never-accepted', 'PENDING')
  ];
  const s = usageStatement(plan, 'f1', '2026-03', delegations, { stays: 'Stays OU', 'joins-late': 'Late OU', 'left-mid-month': 'Left OU' });
  assert.deepEqual(s.billable_clients.map(c => c.organization_id).sort(), ['joins-late', 'left-mid-month', 'stays']);
  assert.equal(s.total_cents, 2700);
  assert.equal(s.payment_provider, 'NONE');
  assert.equal(s.status, 'USAGE_STATEMENT_NOT_AN_INVOICE');
  assert.match(usageCsv(s), /TOTAL.*27\.00/);
  assert.throws(() => usageStatement(plan, 'f1', '2026-13', [], {}), /month must look like/);
  assert.equal(usageStatement(null, 'f1', '2026-03', delegations, {}).total_cents, 0);
});

test('branding: colour, https logo, email and text are validated; a client sees only the public part', () => {
  const b = validateBranding('f1', { display_name: ' Acme Accounting ', accent_color: '#AABBCC', logo_url: 'https://acme.example/logo.png', support_email: 'Help@Acme.example', footer: 'Line one\nline two' }, NOW);
  assert.equal(b.accent_color, '#aabbcc');
  assert.equal(b.footer, 'Line one line two');
  assert.deepEqual(Object.keys(publicBranding(b)!).sort(), ['accent_color', 'display_name', 'footer', 'logo_url', 'support_email']);
  assert.equal(publicBranding(null), null);
  for (const bad of [
    { display_name: '' }, { display_name: 'A', accent_color: 'red' }, { display_name: 'A', accent_color: '#12345' },
    { display_name: 'A', logo_url: 'http://acme.example/l.png' }, { display_name: 'A', logo_url: 'javascript:alert(1)' },
    { display_name: 'A', logo_url: 'https://user:pw@acme.example/l.png' }, { display_name: 'A', support_email: 'nope' }
  ]) assert.throws(() => validateBranding('f1', bad), undefined, JSON.stringify(bad));
  const md = brandPackMarkdown('# Pack', b);
  assert.match(md, /^> Prepared for you by \*\*Acme Accounting\*\*/);
  assert.match(md, /Line one line two/);
  assert.equal(brandPackMarkdown('# Pack', null), '# Pack');
});

const clients = [
  { company_id: 'c1', name: 'Alpha OU', jurisdiction: 'EE', vat_registered: true },
  { company_id: 'c2', name: 'Beta OU', jurisdiction: 'EE', vat_registered: false },
  { company_id: 'c3', name: 'Gamma GmbH', jurisdiction: 'DE', vat_registered: true }
];

test('the calendar: close deadlines for all, the Estonian VAT deadline only for registered Estonian clients', () => {
  const cal = buildCalendar({ today: '2026-03-15', horizon_days: 45, clients, settings: validateSettings('f1', { close_due_day: 12 }), custom: [], done: new Set() });
  const closeFeb = cal.filter(i => i.kind === 'MONTH_CLOSE' && i.period === '2026-02');
  assert.equal(closeFeb.length, 3);
  assert.equal(closeFeb[0].due_date, '2026-03-12');
  assert.equal(closeFeb[0].state, 'OVERDUE');
  assert.equal(closeFeb[0].days_left, -3);
  const vat = cal.filter(i => i.kind === 'VAT_RETURN');
  assert.deepEqual([...new Set(vat.map(i => i.client))], ['Alpha OU'], 'not Beta (unregistered), not Gamma (no rule for Germany)');
  assert.equal(vat.find(i => i.period === '2026-02')!.due_date, '2026-03-20');
  assert.equal(vat.find(i => i.period === '2026-02')!.state, 'DUE_SOON');
  assert.ok(vat.every(i => i.source === 'RULE_UNVERIFIED'));
  assert.ok(cal.every(i => i.days_left <= 45), 'nothing beyond the horizon');
  assert.deepEqual(cal.map(i => i.due_date), [...cal.map(i => i.due_date)].sort(), 'sorted by date');
});

test('completed items show as done; the default close day is the 10th; the day is capped for short months', () => {
  const done = new Set(['c1|MONTH_CLOSE|2026-02']);
  const cal = buildCalendar({ today: '2026-03-15', horizon_days: 30, clients: [clients[0]], settings: null, custom: [], done });
  const feb = cal.find(i => i.kind === 'MONTH_CLOSE' && i.period === '2026-02')!;
  assert.equal(feb.state, 'DONE');
  assert.equal(feb.due_date, '2026-03-10');
  assert.throws(() => validateSettings('f1', { close_due_day: 31 }), /1 to 28/);
});

test('custom deadlines appear for known clients only and can be overdue or done', () => {
  const overdue = validateCustomDeadline('f1', { company_id: 'c1', title: 'Annual report', due_date: '2026-03-01' }, 'boss', NOW);
  const finished = { ...validateCustomDeadline('f1', { company_id: 'c2', title: 'Payroll set-up', due_date: '2026-03-14' }, 'boss', NOW), done: true };
  const stranger = validateCustomDeadline('f1', { company_id: 'someone-else', title: 'Not mine', due_date: '2026-03-20' }, 'boss', NOW);
  const cal = buildCalendar({ today: '2026-03-15', horizon_days: 30, clients, settings: null, custom: [overdue, finished, stranger], done: new Set() });
  assert.equal(cal.find(i => i.title === 'Annual report')!.state, 'OVERDUE');
  assert.equal(cal.find(i => i.title === 'Payroll set-up')!.state, 'DONE');
  assert.equal(cal.find(i => i.title === 'Not mine'), undefined, 'a company outside the firm\'s clients is never shown');
  assert.throws(() => validateCustomDeadline('f1', { company_id: 'c1', title: 'x', due_date: '2026-02-30' }, 'b'), /real date/);
  assert.throws(() => validateCustomDeadline('f1', { company_id: 'c1', title: '', due_date: '2026-02-01' }, 'b'), /title/);
});

test('the exception queue puts HIGH first and, within a severity, the client with the nearest deadline', () => {
  const digest = (id: string, client: string, ex: PackDigest['exceptions']): PackDigest => ({ company_id: id, client, pack_id: `p-${id}`, pack_status: 'OPEN', readiness_percent: 50, high_open: ex.filter(e => e.severity === 'HIGH').length, medium_open: ex.filter(e => e.severity === 'MEDIUM').length, low_open: 0, exceptions: ex });
  const digests = [
    digest('c1', 'Alpha OU', [{ code: 'A', severity: 'MEDIUM', message: 'm' }]),
    digest('c2', 'Beta OU', [{ code: 'B', severity: 'HIGH', message: 'h' }]),
    digest('c3', 'Gamma GmbH', [{ code: 'C', severity: 'HIGH', message: 'h' }])
  ];
  const cal = buildCalendar({ today: '2026-03-15', horizon_days: 45, clients, settings: null, custom: [], done: new Set() });
  const queue = buildExceptionQueue(digests, cal);
  assert.deepEqual(queue.map(q => q.code), ['B', 'C', 'A']);
  assert.equal(queue[2].severity, 'MEDIUM');
  assert.ok(queue.every(q => q.days_to_next_deadline !== null));
});

test('workload counts clients and open items per staff member', () => {
  const digests: PackDigest[] = [
    { company_id: 'c1', client: 'A', pack_id: null, pack_status: 'OPEN', readiness_percent: 0, high_open: 2, medium_open: 1, low_open: 0, exceptions: [] },
    { company_id: 'c2', client: 'B', pack_id: null, pack_status: 'OPEN', readiness_percent: 0, high_open: 0, medium_open: 0, low_open: 4, exceptions: [] }
  ];
  const rows = workloadByStaff([{ user_id: 'u1', email: 'a@x', company_id: 'c1' }, { user_id: 'u1', email: 'a@x', company_id: 'c2' }, { user_id: 'u2', company_id: 'c2' }, { user_id: 'u3', company_id: 'c9' }], digests);
  assert.deepEqual(rows.map(r => [r.user_id, r.clients, r.open_items]), [['u1', 2, 7], ['u2', 1, 4], ['u3', 1, 0]]);
});
