import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../../../lib/finclose-backend';
import { authorisePackCall, connectionStore, httpError, readJsonBody } from '../../../../../lib/pack-route-support';
import { OAUTH_PROVIDERS, completeOAuth, isOAuthProvider, startOAuth, verifyOAuthState } from '../../../../../lib/oauth-connect';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Sign-in for the read-only providers: quickbooks, freshbooks, zohobooks. ADMIN on the company.
//   POST { company_id, action: 'start' }        -> { url } to send the browser to the provider
//   GET  ?code=&state=  (provider redirects)    -> stores the sealed connection, redirects to /packs
//   POST { company_id, action: 'disconnect' }   -> deletes the stored tokens
// The reviews themselves run in /api/ledger-review. Nothing here writes to the accounting system.
export async function GET(req: NextRequest, ctx: { params: { provider: string } }) {
  try {
    if (!isOAuthProvider(ctx.params.provider)) throw httpError('unknown provider', 404);
    const provider = OAUTH_PROVIDERS[ctx.params.provider];
    const params = req.nextUrl.searchParams;
    if (params.get('error')) throw httpError(`${provider.name} sign-in was cancelled`, 400);
    const claimed = verifyOAuthState(provider, String(params.get('state') || ''));
    const caller = await authorisePackCall(req, claimed.company_id, 'ADMIN', 10);
    await completeOAuth(provider, await connectionStore(), fetch as never, { callback: params, acting_user_id: caller.user_id });
    return NextResponse.redirect(new URL(`/packs?connected=${provider.id}`, req.url), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest, ctx: { params: { provider: string } }) {
  try {
    if (!isOAuthProvider(ctx.params.provider)) throw httpError('unknown provider', 404);
    const provider = OAUTH_PROVIDERS[ctx.params.provider];
    const body = await readJsonBody(req, 2_000);
    const action = String(body.action || '');
    const caller = await authorisePackCall(req, body.company_id, 'ADMIN', 10);
    if (action === 'start') return NextResponse.json(startOAuth(provider, { company_id: caller.company_id, user_id: caller.user_id }), { headers: NO_STORE });
    if (action === 'disconnect') {
      await (await connectionStore()).delete(caller.company_id, provider.id);
      return NextResponse.json({ disconnected: true }, { headers: NO_STORE });
    }
    throw httpError("action must be 'start' or 'disconnect'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
