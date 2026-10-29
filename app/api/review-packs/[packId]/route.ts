import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../../lib/finclose-backend';
import { authorisePackCall, documentStore, httpError, packStore, readJsonBody } from '../../../../lib/pack-route-support';
import { deletePack, getPack, recordCorrection, recordOwnerAnswer, signOffEnabled, signOffPack, type LoadedPack } from '../../../../lib/pack-lifecycle';
import { buildRulePack } from '../../../../lib/categorisation-engine';
import { buildJournal, journalCsv } from '../../../../lib/chart-of-accounts';
import { applyOverrides } from '../../../../lib/account-map-custom';
import { allowedVatRates, summariseVat } from '../../../../lib/vat-summary';
import { packPortfolioStatus } from '../../../../lib/pack-portfolio';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

type Ctx = { params: { packId: string } };

async function accountMapFor(loaded: LoadedPack) {
  const overrides = await (await packStore()).accountOverrides(loaded.record.company_id);
  return applyOverrides(loaded.result.pack.company.jurisdiction, overrides);
}

async function view(loaded: LoadedPack) {
  const jurisdiction = loaded.result.pack.company.jurisdiction;
  return {
    record: loaded.record,
    ...loaded.result,
    vat_summary: summariseVat(loaded.result.pack),
    journal: buildJournal(loaded.result.pack, await accountMapFor(loaded)),
    portfolio_status: packPortfolioStatus(loaded.record, loaded.result.pack),
    options: {
      categories: buildRulePack(jurisdiction === 'EE' ? 'EE' : 'GENERIC').categories,
      vat_rates: allowedVatRates(jurisdiction),
      signoff_enabled: signOffEnabled()
    }
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const loaded = await getPack(await packStore(), ctx.params.packId, caller.company_id);
    if (req.nextUrl.searchParams.get('format') === 'journal_csv') {
      return new NextResponse(journalCsv(buildJournal(loaded.result.pack, await accountMapFor(loaded))), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="proposed-journal.csv"' } });
    }
    return NextResponse.json(await view(loaded), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

// POST body: { company_id, action, ... }
//   answer:   transaction_id, document_ids?, note?, confirm_duplicate?        (ACCOUNTANT; cited documents must be CLEAN)
//   correct:  transaction_id, category_code, vat_treatment, vat_rate?, remember?   (ACCOUNTANT)
//   sign_off: pack_hash, note?, accept_open_items?                             (APPROVER; off unless FINCLOSE_SIGNOFF_ENABLED=true)
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const body = await readJsonBody(req, 20_000);
    const action = String(body.action || '');
    if (!['answer', 'correct', 'sign_off'].includes(action)) throw httpError("action must be 'answer', 'correct' or 'sign_off'", 400);
    const caller = await authorisePackCall(req, body.company_id, action === 'sign_off' ? 'APPROVER' : 'ACCOUNTANT');
    const store = await packStore();
    const actor = { user_id: caller.user_id };
    let loaded: LoadedPack;
    if (action === 'answer') loaded = await recordOwnerAnswer(store, ctx.params.packId, caller.company_id, actor, body, await documentStore());
    else if (action === 'correct') loaded = await recordCorrection(store, ctx.params.packId, caller.company_id, actor, body);
    else loaded = await signOffPack(store, ctx.params.packId, caller.company_id, actor, body);
    return NextResponse.json(await view(loaded), { headers: NO_STORE });
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
