import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../lib/managed-auth';
import { requireFirmRole } from '../../../lib/firm-tenancy';
import { computeFirmUsage, estimateMonthlyChargeCents, getFirmBilling, setFirmTier, type FirmBillingTier } from '../../../lib/firm-billing';
import { statusFor } from '../../../lib/finclose-backend';
import { isRealDataMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';

// GET /api/firm-billing?firm_id=... -- current tier/status plus live
// usage and the estimated monthly charge those two combine to (see
// lib/firm-billing.ts for why usage is derived, never stored). Any
// ACTIVE firm member may view billing (matches firm-portfolio's own
// REVIEWER floor); only a PARTNER may change the tier, enforced in POST.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to view firm billing');
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
        billing: null,
        usage: { active_client_count: 0, active_member_count: 0 },
        estimated_monthly_charge_cents: 0,
        note: 'Billing data requires real-data mode (PILOT/PRODUCTION); this session is running in LAB mode.'
      });
    }

    const [billing, usage] = await Promise.all([getFirmBilling(firmId), computeFirmUsage(firmId)]);
    return NextResponse.json({
      firm_id: firmId,
      billing,
      usage,
      estimated_monthly_charge_cents: estimateMonthlyChargeCents(billing, usage)
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

// POST /api/firm-billing { firm_id, tier, billing_email } -- sets the
// firm's plan tier. PARTNER-only (enforced inside setFirmTier). See
// lib/firm-billing.ts's header note: this provisions the tier, it does
// not itself charge a card -- no live payment processor is wired into
// this pilot environment.
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') {
      const error = new Error('sign in to change firm billing');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    if (!isRealDataMode()) {
      const error = new Error('billing changes require real-data mode (PILOT/PRODUCTION); this session is running in LAB mode');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const body = await req.json().catch(() => ({}));
    const firmId = String(body?.firm_id || '');
    const tier = String(body?.tier || '') as FirmBillingTier;
    const billingEmail = String(body?.billing_email || '');
    if (!firmId) {
      const error = new Error('firm_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const billing = await setFirmTier(firmId, tier, billingEmail, auth.user);
    return NextResponse.json({ billing });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
