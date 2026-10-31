import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, connectionStore } from '../../../lib/pack-route-support';
import { providerStatuses } from '../../../lib/connectors';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// GET ?company_id=  (VIEWER)  what each accounting package connector can do on this server, and
// whether this company is connected. Never returns tokens.
export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const xero = await (await connectionStore()).get(caller.company_id, 'xero');
    return NextResponse.json({
      providers: providerStatuses(),
      connections: xero ? [{ provider: 'xero', organisation: xero.tenant_name, connected_at: xero.connected_at }] : []
    }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
