import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, documentStore, packStore, readJsonBody } from '../../../lib/pack-route-support';
import { eraseCompanyData, exportCompanyData } from '../../../lib/data-rights';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Everything FinClose holds for one company in the review-pack feature.
//   GET     ?company_id=   export as JSON (ADMIN)
//   DELETE  json { company_id, confirm }   erase packs, documents and learned rules (OWNER); confirm must equal company_id
export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'ADMIN', 5);
    const data = await exportCompanyData(await packStore(), await documentStore(), caller.company_id);
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { ...NO_STORE, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="finclose-company-data.json"' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const caller = await authorisePackCall(req, body.company_id, 'OWNER', 5);
    const receipt = await eraseCompanyData(await packStore(), await documentStore(), caller.company_id, body.confirm);
    return NextResponse.json({ erased: true, receipt }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
