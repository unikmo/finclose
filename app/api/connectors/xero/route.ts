import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../../lib/finclose-backend';
import { authorisePackCall, connectionStore, httpError, packStore, readJsonBody } from '../../../../lib/pack-route-support';
import { completeXeroAuthorisation, pushJournalAsDraft, startXeroAuthorisation, verifyXeroState } from '../../../../lib/xero-connector';
import { getPack } from '../../../../lib/pack-lifecycle';
import { buildJournal } from '../../../../lib/chart-of-accounts';
import { applyOverrides } from '../../../../lib/account-map-custom';
import { xeroManualJournalCsv } from '../../../../lib/connectors';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Xero connector. Everything needs ADMIN on the company. It only ever creates DRAFT manual journals.
//   POST { company_id, action: 'start' }                        -> { url } to send the browser to Xero
//   GET  ?code=&state=   (Xero redirects here)                  -> stores the connection, redirects to /packs
//   POST { company_id, action: 'push', pack_id }                -> draft journals created in Xero
//   POST { company_id, action: 'disconnect' }                   -> deletes the stored tokens
//   GET  ?company_id=&pack_id=&format=xero_csv                  -> the Xero import file, no connection needed
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    if (params.get('format') === 'xero_csv') {
      const caller = await authorisePackCall(req, params.get('company_id'), 'VIEWER');
      const loaded = await getPack(await packStore(), String(params.get('pack_id') || ''), caller.company_id);
      const overrides = await (await packStore()).accountOverrides(caller.company_id);
      const journal = buildJournal(loaded.result.pack, applyOverrides(loaded.result.pack.company.jurisdiction, overrides));
      return new NextResponse(xeroManualJournalCsv(journal, `FinClose ${loaded.result.pack.company.name}`), { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="xero-manual-journal.csv"' } });
    }
    if (params.get('error')) throw httpError('Xero sign-in was cancelled', 400);
    const state = String(params.get('state') || '');
    const claimed = verifyXeroState(state);
    const caller = await authorisePackCall(req, claimed.company_id, 'ADMIN', 10);
    await completeXeroAuthorisation(await connectionStore(), fetch as never, { code: String(params.get('code') || ''), state, acting_user_id: caller.user_id });
    return NextResponse.redirect(new URL('/packs?connected=xero', req.url), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const action = String(body.action || '');
    const caller = await authorisePackCall(req, body.company_id, 'ADMIN', 10);
    if (action === 'start') {
      return NextResponse.json(startXeroAuthorisation({ company_id: caller.company_id, user_id: caller.user_id }), { headers: NO_STORE });
    }
    if (action === 'disconnect') {
      await (await connectionStore()).delete(caller.company_id, 'xero');
      return NextResponse.json({ disconnected: true }, { headers: NO_STORE });
    }
    if (action === 'push') {
      const store = await packStore();
      const loaded = await getPack(store, String(body.pack_id || ''), caller.company_id);
      const overrides = await store.accountOverrides(caller.company_id);
      const journal = buildJournal(loaded.result.pack, applyOverrides(loaded.result.pack.company.jurisdiction, overrides));
      const result = await pushJournalAsDraft(await connectionStore(), fetch as never, { company_id: caller.company_id, journal, pack_hash: loaded.result.pack.pack_hash, narration: `FinClose ${loaded.result.pack.company.name}` });
      return NextResponse.json(result, { headers: NO_STORE });
    }
    throw httpError("action must be 'start', 'push' or 'disconnect'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
