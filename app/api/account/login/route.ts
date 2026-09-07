import { NextRequest, NextResponse } from 'next/server';
import { accountResponse, loginLabAccount } from '../../../../lib/lab-auth';
import { loginManagedAccount } from '../../../../lib/managed-auth';
import { statusFor } from '../../../../lib/finclose-backend';
import { ensureFirebaseWebClientConfig } from '../../../../lib/firebase-web-config-discovery';
import { isRealDataMode } from '../../../../lib/runtime-mode';

export async function POST(req: NextRequest) {
  try {
    if (isRealDataMode()) {
      await ensureFirebaseWebClientConfig();
      return await loginManagedAccount(await req.json());
    }
    const user = await loginLabAccount(await req.json());
    return accountResponse(user);
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
