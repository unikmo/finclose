import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError, readJsonBody } from '../../../lib/pack-route-support';
import { checkCronAuth } from '../../../lib/cron-auth';
import { setPayrollRelease, validOrganizationId } from '../../../lib/payroll-release';
import { payrollReleaseStore, verifiedPayrollCountries } from '../../../lib/payroll-release-store';
import { authenticateRequest } from '../../../lib/managed-auth';
import { ensurePersonalOrganization } from '../../../lib/tenancy';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

function operator(req: NextRequest) {
  const auth = checkCronAuth(req.headers.get('authorization'));
  if (auth === 'not_configured') throw httpError('the operator token is not configured', 503);
  return auth === 'ok';
}

// GET (operator token)            -> every release, plus which countries can be released now.
// GET (signed-in customer)        -> that customer's own release.
export async function GET(req: NextRequest) {
  try {
    const store = await payrollReleaseStore();
    if (req.headers.get('authorization')) {
      if (!operator(req)) throw httpError('operator token required', 401);
      return NextResponse.json({ releases: await store.list(), releasable_countries: verifiedPayrollCountries() }, { headers: NO_STORE });
    }
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer' || !isRealDataMode()) return NextResponse.json({ countries: [] }, { headers: NO_STORE });
    const org = await ensurePersonalOrganization(auth.user);
    const release = await store.get(validOrganizationId(org.organization_id));
    return NextResponse.json({ countries: release?.countries || [] }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

// POST (operator token) { organization_id, countries: ["GE"], note }  -> release payroll for that customer.
//   An empty countries list withdraws the release. Only countries whose rule pack is verified are accepted.
export async function POST(req: NextRequest) {
  try {
    if (!operator(req)) throw httpError('operator token required', 401);
    const body = await readJsonBody(req, 2_000);
    const release = await setPayrollRelease(await payrollReleaseStore(), { organization_id: body.organization_id, countries: body.countries, note: body.note }, verifiedPayrollCountries());
    return NextResponse.json({ release, withdrawn: release === null }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
