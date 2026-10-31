import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall } from '../../../lib/pack-route-support';
import { brandingForOrganization } from '../../../lib/partner-route-support';

export const dynamic = 'force-dynamic';

// GET ?company_id=  (VIEWER) the name and colour of the accounting firm that holds this company's books, if it set a
// brand. Nothing else about the firm is returned. A company with no firm gets { branding: null }.
export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    return NextResponse.json({ branding: await brandingForOrganization(caller.organization_id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
