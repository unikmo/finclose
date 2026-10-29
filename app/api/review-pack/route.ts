import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { requireCompanyAccess } from '../../../lib/tenancy';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';
import { MAX_STATEMENT_CHARS, prepareStatementReview } from '../../../lib/statement-prep';

export const dynamic = 'force-dynamic';

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

// POST /api/review-pack -- turns an uploaded bank-statement CSV into an
// accountant review pack (categories, VAT suggestions, exceptions, owner
// questions). Stateless: the statement is processed in memory and returned; it
// is NOT stored and nothing is posted or approved.
//
// Real-data (PILOT/PRODUCTION) use is off by default. The upload-quarantine and
// malware-scan release gates are still open (see README), so enabling this for
// real statements is an explicit operator decision:
//   FINCLOSE_STATEMENT_PREP_ENABLED=true
// and the caller must then name a company they hold ACCOUNTANT access to.
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_STATEMENT_CHARS * 2) throw httpError('request is too large', 413);
    const raw = await req.text();
    if (raw.length > MAX_STATEMENT_CHARS * 2) throw httpError('request is too large', 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw httpError('request body must be JSON', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError('request body must be a JSON object', 400);

    if (isRealDataMode()) {
      if (auth.kind !== 'customer') throw httpError('sign in to prepare a review pack', 401);
      if (process.env.FINCLOSE_STATEMENT_PREP_ENABLED !== 'true') {
        throw httpError('statement preparation is not enabled for real data in this deployment', 403);
      }
      const companyId = String(body.company_id || '').trim();
      if (!companyId) throw httpError('company_id is required in real-data mode', 400);
      await requireCompanyAccess(companyId, auth.user, 'ACCOUNTANT');
    }

    return NextResponse.json(prepareStatementReview(body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
