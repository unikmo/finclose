import { NextRequest, NextResponse } from 'next/server';
import { runPolicyMonitorSweep, latestPolicyMonitorRun, sourceCount } from '../../../lib/policy-monitor';
import { statusFor } from '../../../lib/finclose-backend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Accepts either Vercel Cron's own convention (Authorization: Bearer
// $CRON_SECRET, sent automatically for a "crons" entry in vercel.json
// when CRON_SECRET is set) or this repo's own FINCLOSE_CRON_TOKEN, so a
// human can also trigger a manual/ad-hoc sweep the same way the lab token
// gates other internal-only endpoints.
function authorized(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  const finCloseToken = process.env.FINCLOSE_CRON_TOKEN;
  if (cronSecret && bearer === cronSecret) return true;
  if (finCloseToken && bearer === finCloseToken) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    if (!authorized(req)) {
      const error = new Error('missing or invalid authorization for the policy-monitor endpoint');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    const url = req.nextUrl;
    const mode = url.searchParams.get('mode');
    if (mode === 'latest') {
      const latest = await latestPolicyMonitorRun();
      return NextResponse.json({ source_count: sourceCount(), latest_run: latest });
    }
    const sourceIdsParam = url.searchParams.get('source_ids');
    const budgetMsParam = url.searchParams.get('budget_ms');
    const result = await runPolicyMonitorSweep({
      sourceIds: sourceIdsParam ? sourceIdsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      budgetMs: budgetMsParam ? Number(budgetMsParam) : undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
