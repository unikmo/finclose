import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, httpError, packStore, readJsonBody } from '../../../lib/pack-route-support';
import { accountMapCsv, applyOverrides, parseAccountMapCsv, validateOverrides } from '../../../lib/account-map-custom';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// A company's own account numbers for the proposed journal.
//   GET  ?company_id=            (VIEWER)  the map in force; ?format=csv downloads it for editing
//   PUT  { company_id, jurisdiction?, overrides | csv }   (ADMIN)  replaces the company's overrides
//   DELETE ?company_id=          (ADMIN)  back to the FinClose default map
// Jurisdiction decides which default map the overrides sit on; it defaults to EE.
const jurisdictionOf = (value: unknown) => (String(value || 'EE').toUpperCase() === 'EE' ? 'EE' : 'GENERIC');

export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const jurisdiction = jurisdictionOf(req.nextUrl.searchParams.get('jurisdiction'));
    const overrides = await (await packStore()).accountOverrides(caller.company_id);
    const map = applyOverrides(jurisdiction, overrides);
    if (req.nextUrl.searchParams.get('format') === 'csv') {
      return new NextResponse(accountMapCsv(map), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="account-map.csv"' } });
    }
    return NextResponse.json({ account_map: map, overrides: overrides || {} }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 120_000);
    const caller = await authorisePackCall(req, body.company_id, 'ADMIN');
    const jurisdiction = jurisdictionOf(body.jurisdiction);
    if (body.csv === undefined && body.overrides === undefined) throw httpError('send either overrides or csv', 400);
    const overrides = body.csv !== undefined ? parseAccountMapCsv(body.csv as string, jurisdiction) : validateOverrides(body.overrides, jurisdiction);
    await (await packStore()).setAccountOverrides(caller.company_id, overrides);
    return NextResponse.json({ account_map: applyOverrides(jurisdiction, overrides), overrides }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'ADMIN');
    await (await packStore()).setAccountOverrides(caller.company_id, null);
    return NextResponse.json({ reset: true }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
