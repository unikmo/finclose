import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError, readJsonBody } from '../../../lib/pack-route-support';
import { firmCaller, partnerStore, signedInCustomer } from '../../../lib/partner-route-support';
import { acceptStaffInvitation, inviteStaff, revokeStaffInvitation, type FirmRoleName } from '../../../lib/partner-layer';
import { joinFirmByInvitation, listFirmMembers } from '../../../lib/firm-tenancy';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Staff invitations. FinClose sends no email: the manager gets a one-time link to pass on, and the
// invitee must sign in with the invited, verified email address.
//   GET    ?firm_id=                                  (MANAGER) invitations, never the secret
//   POST   { firm_id, email, role }                   (MANAGER) -> { invitation, token, accept_path }
//   PUT    { token }                                  (any signed-in user) accept
//   DELETE { firm_id, invitation_id }                 (MANAGER) withdraw
export async function GET(req: NextRequest) {
  try {
    const caller = await firmCaller(req, req.nextUrl.searchParams.get('firm_id'), 'MANAGER');
    const list = (await (await partnerStore()).listInvitations(caller.firm_id)).map(({ token_hash: _h, ...safe }) => safe);
    return NextResponse.json({ invitations: list, members: await listFirmMembers(caller.firm_id) }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const caller = await firmCaller(req, body.firm_id, 'MANAGER');
    const result = await inviteStaff(await partnerStore(), {
      firm_id: caller.firm_id, actor_user_id: caller.user.user_id, actor_role: caller.role as FirmRoleName,
      email: body.email, role: body.role, active_staff: (await listFirmMembers(caller.firm_id)).length
    });
    return NextResponse.json({ ...result, accept_path: `/firm/join?token=${encodeURIComponent(result.token)}` }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const user = await signedInCustomer(req);
    const joined = await acceptStaffInvitation(await partnerStore(), { token: body.token, user }, (firmId, u, role) => joinFirmByInvitation(firmId, u, role));
    return NextResponse.json({ joined }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const caller = await firmCaller(req, body.firm_id, 'MANAGER');
    if (!body.invitation_id) throw httpError('invitation_id is required', 400);
    await revokeStaffInvitation(await partnerStore(), caller.firm_id, String(body.invitation_id));
    return NextResponse.json({ revoked: true }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
