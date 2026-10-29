import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, packStore, readJsonBody } from '../../../lib/pack-route-support';
import { createPack, listPacks } from '../../../lib/pack-lifecycle';
import { MAX_STATEMENT_CHARS } from '../../../lib/statement-prep';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// POST /api/review-packs  -- prepare AND save a review pack (versioned per company and period).
// GET  /api/review-packs?company_id=...  -- list saved packs (metadata only, no statement text).
// Nothing is approved or posted. See lib/pack-lifecycle.ts for the lifecycle.
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, MAX_STATEMENT_CHARS);
    const caller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT', 20);
    const { company_id: _ignored, ...request } = body;
    const created = await createPack(await packStore(), { company_id: caller.company_id, organization_id: caller.organization_id, actor: { user_id: caller.user_id }, request });
    return NextResponse.json({ record: created.record, ...created.result }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const packs = await listPacks(await packStore(), caller.company_id);
    return NextResponse.json({ packs: packs.map(({ answers, corrections, events, ...meta }) => ({ ...meta, answer_count: Object.keys(answers).length, correction_count: Object.keys(corrections).length })) }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
