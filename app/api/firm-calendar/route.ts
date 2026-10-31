import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError, packStore, readJsonBody } from '../../../lib/pack-route-support';
import { firmCaller, partnerStore } from '../../../lib/partner-route-support';
import { buildCalendar, buildExceptionQueue, validateCustomDeadline, workloadByStaff, type CalendarClient, type PackDigest } from '../../../lib/partner-layer';
import { combineFirmPortfolio, resolveCompanyCloseStatusLive, type PortfolioRow } from '../../../lib/portfolio-status';
import { listFirmAssignments, listFirmMembers } from '../../../lib/firm-tenancy';
import { getPack } from '../../../lib/pack-lifecycle';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// The firm's close calendar, cross-client exception queue and staff workload.
//   GET  ?firm_id=[&horizon_days=45]       (REVIEWER+; below PARTNER only the clients assigned to the caller)
//   POST { firm_id, action: 'add', company_id, title, due_date }         (MANAGER) a custom deadline
//   POST { firm_id, action: 'done' | 'delete', deadline_id }             (MANAGER)
// Only clients the firm holds an active delegation for ever appear. A deadline for any other company is refused.

async function visibleClients(firmId: string, userId: string, role: string): Promise<PortfolioRow[]> {
  const rows = await combineFirmPortfolio(firmId, resolveCompanyCloseStatusLive);
  if (role === 'PARTNER') return rows;
  const mine = new Set((await listFirmAssignments(firmId)).filter(a => a.user_id === userId).map(a => a.organization_id));
  return rows.filter(r => mine.has(r.organization_id));
}

export async function GET(req: NextRequest) {
  try {
    const caller = await firmCaller(req, req.nextUrl.searchParams.get('firm_id'), 'REVIEWER');
    const horizon = Math.min(Math.max(Number(req.nextUrl.searchParams.get('horizon_days')) || 45, 7), 180);
    const rows = await visibleClients(caller.firm_id, caller.user.user_id, caller.role);
    const packs = await packStore();
    const digests: PackDigest[] = [];
    const clients: CalendarClient[] = [];
    const done = new Set<string>();
    for (const row of rows) {
      const name = String(row.legal_name || row.company_id);
      const records = (await packs.listByCompany(row.company_id)).sort((a, b) => b.created_at - a.created_at);
      for (const r of records.filter(x => x.status === 'SIGNED_OFF')) done.add(`${row.company_id}|MONTH_CLOSE|${r.period.end.slice(0, 7)}`);
      const latest = records.find(r => r.status !== 'SUPERSEDED');
      let jurisdiction = String(row.country_code || 'GENERIC').toUpperCase();
      let vat = false;
      let digest: PackDigest = { company_id: row.company_id, client: name, pack_id: null, pack_status: 'NONE', readiness_percent: null, high_open: 0, medium_open: 0, low_open: 0, exceptions: [] };
      if (latest) {
        const loaded = await getPack(packs, latest.pack_id, row.company_id);
        const ex = loaded.result.pack.exceptions;
        jurisdiction = loaded.result.pack.company.jurisdiction;
        vat = loaded.result.pack.company.vat_registered;
        digest = {
          company_id: row.company_id, client: name, pack_id: latest.pack_id, pack_status: latest.status === 'SIGNED_OFF' ? 'SIGNED_OFF' : 'OPEN',
          readiness_percent: latest.readiness_percent,
          high_open: ex.filter(e => e.severity === 'HIGH').length, medium_open: ex.filter(e => e.severity === 'MEDIUM').length, low_open: ex.filter(e => e.severity === 'LOW').length,
          exceptions: ex.map(e => ({ code: e.code, severity: e.severity, message: e.message }))
        };
      }
      digests.push(digest);
      clients.push({ company_id: row.company_id, name, jurisdiction, vat_registered: vat });
    }
    const store = await partnerStore();
    const calendar = buildCalendar({ today: new Date().toISOString().slice(0, 10), horizon_days: horizon, clients, settings: await store.getSettings(caller.firm_id), custom: await store.listDeadlines(caller.firm_id), done });
    const lead = caller.role === 'PARTNER' || caller.role === 'MANAGER';
    let workload: ReturnType<typeof workloadByStaff> = [];
    if (lead) {
      const members = new Map((await listFirmMembers(caller.firm_id)).map(m => [m.user_id, m.email]));
      const orgOf = new Map(rows.map(r => [r.organization_id, r.company_id]));
      const assigned = (await listFirmAssignments(caller.firm_id)).filter(a => orgOf.has(a.organization_id)).map(a => ({ user_id: a.user_id, email: members.get(a.user_id) || '', company_id: orgOf.get(a.organization_id)! }));
      workload = workloadByStaff(assigned, digests);
    }
    return NextResponse.json({
      firm_id: caller.firm_id,
      scope: caller.role === 'PARTNER' ? 'ALL_CLIENTS' : 'ASSIGNED_CLIENTS_ONLY',
      clients: digests.map(d => ({ company_id: d.company_id, client: d.client, pack_status: d.pack_status, readiness_percent: d.readiness_percent, high_open: d.high_open, medium_open: d.medium_open, low_open: d.low_open })),
      calendar,
      exception_queue: buildExceptionQueue(digests, calendar).slice(0, 200),
      workload,
      notes: ['The VAT return deadline is generated only for VAT-registered Estonian clients, from a rule that has not been checked with the tax authority.', 'A month shows as done when a signed-off pack covers it. Sign-off is switched off unless the operator enables it.']
    }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const caller = await firmCaller(req, body.firm_id, 'MANAGER');
    const store = await partnerStore();
    const action = String(body.action || '');
    if (action === 'add') {
      const rows = await visibleClients(caller.firm_id, caller.user.user_id, caller.role);
      if (!rows.some(r => r.company_id === String(body.company_id || ''))) throw httpError('that company is not one of your clients', 403);
      const deadline = validateCustomDeadline(caller.firm_id, body, caller.user.user_id);
      await store.putDeadline(deadline);
      return NextResponse.json({ deadline }, { status: 201, headers: NO_STORE });
    }
    const existing = (await store.listDeadlines(caller.firm_id)).find(d => d.deadline_id === String(body.deadline_id || ''));
    if (!existing) throw httpError('deadline not found', 404);
    if (action === 'done') { await store.putDeadline({ ...existing, done: body.done !== false }); return NextResponse.json({ ok: true }, { headers: NO_STORE }); }
    if (action === 'delete') { await store.deleteDeadline(caller.firm_id, existing.deadline_id); return NextResponse.json({ ok: true }, { headers: NO_STORE }); }
    throw httpError("action must be 'add', 'done' or 'delete'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
