import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '../../../../lib/managed-auth';
import { statusFor } from '../../../../lib/finclose-backend';

export async function POST(req: NextRequest) {
  try {
    return await requestPasswordReset(await req.json());
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
