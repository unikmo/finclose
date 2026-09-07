import { NextResponse } from 'next/server';
import { ensureFirebaseWebClientConfig } from '../../../lib/firebase-web-config-discovery';
import { publicRuntimeProfile } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

export async function GET() {
  const discovery = await ensureFirebaseWebClientConfig();
  return NextResponse.json({
    ...publicRuntimeProfile(),
    firebase_web_config_discovery: discovery
  });
}
