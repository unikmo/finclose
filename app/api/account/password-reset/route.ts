import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '../../../../lib/managed-auth';
import { statusFor } from '../../../../lib/finclose-backend';
import { ensureFirebaseWebClientConfig } from '../../../../lib/firebase-web-config-discovery';
import { isRealDataMode } from '../../../../lib/runtime-mode';

export async function POST(req: NextRequest) {
  try {
    if (isRealDataMode()) await ensureFirebaseWebClientConfig();
    return await requestPasswordReset(await req.json());
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
