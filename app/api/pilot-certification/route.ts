import { NextRequest, NextResponse } from 'next/server';
import { assertLabToken, statusFor } from '../../../lib/finclose-backend';
import { ensureFirebaseWebClientConfig } from '../../../lib/firebase-web-config-discovery';
import { getLatestReleaseBoundPilotCertification, runReleaseBoundPilotCertification } from '../../../lib/pilot-certification-release';
import { secureReleaseTokenMatches } from '../../../lib/release-automation-auth';
import { PILOT_CERTIFICATION_VERSION } from '../../../lib/release-version';
import { runtimeMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

function assertCertificationAccess(req: NextRequest) {
  const supplied = req.headers.get('x-finclose-release-token');
  if (secureReleaseTokenMatches(process.env.FINCLOSE_RELEASE_AUTOMATION_TOKEN, supplied)) return;
  assertLabToken(req);
}

export async function GET(req: NextRequest) {
  try {
    assertLabToken(req);
    const report = await getLatestReleaseBoundPilotCertification();
    return NextResponse.json({ certification_version: PILOT_CERTIFICATION_VERSION, report });
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCertificationAccess(req);
    if (runtimeMode() !== 'LAB') {
      return NextResponse.json({ detail: 'pilot certification must run while FinClose remains in LAB; do not use certification to justify an already-active real-data mode' }, { status: 409 });
    }
    await ensureFirebaseWebClientConfig();
    return NextResponse.json(await runReleaseBoundPilotCertification());
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
