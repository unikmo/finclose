import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { createFirm } from '../../../lib/firm-tenancy';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

// POST /api/firms { name } -- registers a new accounting firm. The
// creating user becomes its first PARTNER (see lib/firm-tenancy.ts's
// createFirm). Deliberately minimal: no billing/branding fields yet
// (Firm Workspace brief items 11-12, not built this pass).
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to create a firm');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    if (!isRealDataMode()) {
      const error = new Error('firm creation requires real-data mode (PILOT/PRODUCTION); this session is running in LAB mode');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    if (!name) {
      const error = new Error('name is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const firm = await createFirm(name, auth.user);
    return NextResponse.json({ firm });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
