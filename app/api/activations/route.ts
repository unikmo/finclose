import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError } from '../../../lib/pack-route-support';
import { checkPartnerCode, monthOf, partnerCode, usageForMonth, validPartnerId } from '../../../lib/activation';
import { activationStore, clientIp } from '../../../lib/ledger-route-support';
import { checkCronAuth } from '../../../lib/cron-auth';
import { checkRateLimit } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// GET ?partner_id=&partner_code=&month=2026-10   -> how many client companies this partner ran FinClose on
//   A partner sees only its own count, with the partner code we issued.
// GET ?partner_id=&issue_code=1   with the operator bearer token (same token as the scheduled jobs)
//   -> issues the partner code for that partner id. Operator only.
export async function GET(req: NextRequest) {
  try {
    checkRateLimit(`activations:${clientIp(req.headers)}`, 30, 60_000);
    const url = new URL(req.url);
    const partnerId = validPartnerId(url.searchParams.get('partner_id'));
    if (url.searchParams.get('issue_code')) {
      const auth = checkCronAuth(req.headers.get('authorization'));
      if (auth === 'not_configured') throw httpError('the operator token is not configured', 503);
      if (auth !== 'ok') throw httpError('operator token required', 401);
      return NextResponse.json({ partner_id: partnerId, partner_code: partnerCode(partnerId) }, { headers: NO_STORE });
    }
    if (!checkPartnerCode(partnerId, url.searchParams.get('partner_code'))) throw httpError('the partner code is not valid', 403);
    const month = url.searchParams.get('month') || monthOf(Date.now());
    return NextResponse.json(await usageForMonth(await activationStore(), partnerId, month), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
