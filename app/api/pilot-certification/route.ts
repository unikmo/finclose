import { NextRequest, NextResponse } from 'next/server';
import { assertLabToken, statusFor } from '../../../lib/finclose-backend';
import { getLatestPilotCertification, runPilotCertification } from '../../../lib/pilot-certification';
import { runtimeMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    assertLabToken(req);
    const report = await getLatestPilotCertification();
    return NextResponse.json({ certification_version: '0.35.0', report });
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertLabToken(req);
    if (runtimeMode() !== 'LAB') {
      return NextResponse.json({ detail: 'pilot certification must run while FinClose remains in LAB; do not use certification to justify an already-active real-data mode' }, { status: 409 });
    }
    return NextResponse.json(await runPilotCertification());
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
