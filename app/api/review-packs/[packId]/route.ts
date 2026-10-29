import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../../lib/finclose-backend';
import { authorisePackCall, httpError, packStore, readJsonBody } from '../../../../lib/pack-route-support';
import { deletePack, getPack, recordCorrection, recordOwnerAnswer } from '../../../../lib/pack-lifecycle';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

type Ctx = { params: { packId: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const loaded = await getPack(await packStore(), ctx.params.packId, caller.company_id);
    return NextResponse.json({ record: loaded.record, ...loaded.result }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

// POST body: { company_id, action: 'answer' | 'correct', ... }
//   answer:  transaction_id, document_ids?, note?, confirm_duplicate?   (owner)
//   correct: transaction_id, category_code, vat_treatment, remember?    (reviewer)
// There is no accept/sign-off action yet; that is added after real-data testing.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const body = await readJsonBody(req, 20_000);
    const caller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT');
    const store = await packStore();
    const actor = { user_id: caller.user_id };
    let loaded;
    if (body.action === 'answer') loaded = await recordOwnerAnswer(store, ctx.params.packId, caller.company_id, actor, body);
    else if (body.action === 'correct') loaded = await recordCorrection(store, ctx.params.packId, caller.company_id, actor, body);
    else throw httpError("action must be 'answer' or 'correct'", 400);
    return NextResponse.json({ record: loaded.record, ...loaded.result }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'ADMIN');
    await deletePack(await packStore(), ctx.params.packId, caller.company_id);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
