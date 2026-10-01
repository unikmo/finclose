import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { requireFirmRole } from '../../../lib/firm-tenancy';
import { effectiveFirmBranding, getFirmBranding, setFirmBranding } from '../../../lib/firm-branding';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

// GET /api/firm-branding?firm_id=...&raw=1 -- by default returns the
// EFFECTIVE branding (null unless the firm is currently on an ACTIVE
// WHITE_LABEL tier -- see lib/firm-branding.ts), which is what any
// rendering surface should call. Pass raw=1 (settings-page only, still
// REVIEWER-gated) to see a saved-but-not-currently-entitled record, e.g.
// so a lapsed firm's settings page can show what it had without applying it.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to view firm branding');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    const firmId = req.nextUrl.searchParams.get('firm_id');
    if (!firmId) {
      const error = new Error('firm_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    await requireFirmRole(firmId, auth.user, 'REVIEWER');

    if (!isRealDataMode()) {
      return NextResponse.json({
        firm_id: firmId,
        branding: null,
        note: 'Branding data requires real-data mode (PILOT/PRODUCTION); this session is running in LAB mode.'
      });
    }

    const raw = req.nextUrl.searchParams.get('raw') === '1';
    const branding = raw ? await getFirmBranding(firmId) : await effectiveFirmBranding(firmId);
    return NextResponse.json({ firm_id: firmId, branding });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

// POST /api/firm-branding { firm_id, display_name, logo_url?, primary_color?, accent_color? }
// MANAGER-or-above, and only takes effect while the firm is on an ACTIVE
// WHITE_LABEL tier (enforced inside setFirmBranding).
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to change firm branding');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    if (!isRealDataMode()) {
      const error = new Error('branding changes require real-data mode (PILOT/PRODUCTION); this session is running in LAB mode');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const body = await req.json().catch(() => ({}));
    const firmId = String(body?.firm_id || '');
    if (!firmId) {
      const error = new Error('firm_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const branding = await setFirmBranding(firmId, {
      display_name: String(body?.display_name || ''),
      logo_url: body?.logo_url,
      primary_color: body?.primary_color,
      accent_color: body?.accent_color
    }, auth.user);
    return NextResponse.json({ branding });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
