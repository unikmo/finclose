import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { requireFirmRole } from '../../../lib/firm-tenancy';
import { combineFirmPortfolio, portfolioSummaryCounts, resolveCompanyCloseStatusLive } from '../../../lib/portfolio-status';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

// GET /api/firm-portfolio?firm_id=... -- the Firm Workspace dashboard's
// data source (brief item 6 reads from this once built). Any ACTIVE firm
// member (REVIEWER and up) may view the portfolio; combineFirmPortfolio
// itself further narrows each individual company row to only what that
// firm actually has an active client delegation AND (for non-PARTNER
// roles) an explicit per-client assignment for -- see lib/firm-tenancy.ts
// for the isolation guarantees this endpoint inherits rather than
// re-implements.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to view a firm portfolio');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    const firmId = req.nextUrl.searchParams.get('firm_id');
    if (!firmId) {
      const error = new Error('firm_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    // Confirms the caller is an active firm member before anything else
    // runs -- combineFirmPortfolio only ever returns clients THIS firm
    // has an active delegation for, but this check additionally ensures
    // the requesting user actually belongs to that firm at all.
    await requireFirmRole(firmId, auth.user, 'REVIEWER');

    if (!isRealDataMode()) {
      return NextResponse.json({
        firm_id: firmId,
        rows: [],
        summary: portfolioSummaryCounts([]),
        note: 'Portfolio data requires real-data mode (PILOT/PRODUCTION); this session is running in LAB mode.'
      });
    }

    const rows = await combineFirmPortfolio(firmId, resolveCompanyCloseStatusLive);
    return NextResponse.json({ firm_id: firmId, rows, summary: portfolioSummaryCounts(rows) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
