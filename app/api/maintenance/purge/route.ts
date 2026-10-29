import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '../../../../lib/cron-auth';
import { purgeAllExpired } from '../../../../lib/data-rights';
import { documentStore, packStore } from '../../../../lib/pack-route-support';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Scheduled retention purge (see the crons entry in vercel.json). Called with
// Authorization: Bearer <CRON_SECRET or FINCLOSE_CRON_TOKEN>. Closed (503) when neither is set.
// Returns counts only, never record contents.
async function handle(req: NextRequest) {
  const auth = checkCronAuth(req.headers.get('authorization'));
  if (auth === 'not_configured') return NextResponse.json({ error: 'purge is not configured: set CRON_SECRET or FINCLOSE_CRON_TOKEN (16+ characters)' }, { status: 503, headers: NO_STORE });
  if (auth !== 'ok') return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: NO_STORE });
  try {
    const result = await purgeAllExpired(await packStore(), await documentStore());
    console.info('retention purge', JSON.stringify(result));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error('retention purge failed', (error as Error).message);
    return NextResponse.json({ error: 'purge failed' }, { status: 500, headers: NO_STORE });
  }
}

export const GET = handle; // Vercel Cron sends GET
export const POST = handle;
