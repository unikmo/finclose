import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError, readJsonBody } from '../../../lib/pack-route-support';
import { firmCaller, partnerStore } from '../../../lib/partner-route-support';
import { usageCsv, usageStatement, validateBranding, validatePlan, validateSettings } from '../../../lib/partner-layer';
import { listFirmDelegations } from '../../../lib/firm-tenancy';
import { realtimeDatabase } from '../../../lib/finclose-backend';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Firm configuration. Reading needs REVIEWER (branding, settings) or MANAGER (plan); changing anything or reading usage needs PARTNER.
//   GET ?firm_id=&resource=plan|branding|settings|usage[&month=2026-03][&format=csv]
//   PUT { firm_id, resource: 'plan'|'branding'|'settings', ...fields }
// Usage is a statement of how many clients were active and what that costs at the plan's price. No money is collected.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const resource = String(p.get('resource') || '');
    const store = await partnerStore();
    const minimum = resource === 'usage' ? 'PARTNER' : resource === 'plan' ? 'MANAGER' : 'REVIEWER';
    const caller = await firmCaller(req, p.get('firm_id'), minimum);
    if (resource === 'plan') return NextResponse.json({ plan: await store.getPlan(caller.firm_id) }, { headers: NO_STORE });
    if (resource === 'branding') return NextResponse.json({ branding: await store.getBranding(caller.firm_id) }, { headers: NO_STORE });
    if (resource === 'settings') return NextResponse.json({ settings: await store.getSettings(caller.firm_id) }, { headers: NO_STORE });
    if (resource === 'usage') {
      const month = String(p.get('month') || new Date().toISOString().slice(0, 7));
      const delegations = await listFirmDelegations(caller.firm_id);
      const names: Record<string, string> = {};
      for (const d of delegations) {
        const snap = await realtimeDatabase().ref(`finclose_organizations/${d.organization_id}/name`).once('value');
        names[d.organization_id] = String(snap.val() || d.organization_id);
      }
      const statement = usageStatement(await store.getPlan(caller.firm_id), caller.firm_id, month, delegations, names);
      if (p.get('format') === 'csv') return new NextResponse(usageCsv(statement), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="usage-${month}.csv"` } });
      return NextResponse.json({ statement }, { headers: NO_STORE });
    }
    throw httpError("resource must be 'plan', 'branding', 'settings' or 'usage'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 3_000);
    const caller = await firmCaller(req, body.firm_id, 'PARTNER');
    const store = await partnerStore();
    const resource = String(body.resource || '');
    if (resource === 'plan') { const plan = validatePlan(caller.firm_id, body); await store.putPlan(plan); return NextResponse.json({ plan }, { headers: NO_STORE }); }
    if (resource === 'branding') { const branding = validateBranding(caller.firm_id, body); await store.putBranding(branding); return NextResponse.json({ branding }, { headers: NO_STORE }); }
    if (resource === 'settings') { const settings = validateSettings(caller.firm_id, body); await store.putSettings(settings); return NextResponse.json({ settings }, { headers: NO_STORE }); }
    throw httpError("resource must be 'plan', 'branding' or 'settings'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
