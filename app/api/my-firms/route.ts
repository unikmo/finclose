import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { listFirmsForUser } from '../../../lib/firm-tenancy';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

// GET /api/my-firms -- lists the ACTIVE firms the signed-in user belongs
// to, with their role in each. The entry point the Firm Workspace UI
// needs before it can call /api/firm-portfolio for a specific firm_id.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to view your firms');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    if (!isRealDataMode()) {
      return NextResponse.json({ firms: [], note: 'Firm membership requires real-data mode (PILOT/PRODUCTION); this session is running in LAB mode.' });
    }
    const firms = await listFirmsForUser(auth.user.user_id);
    return NextResponse.json({ firms });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
