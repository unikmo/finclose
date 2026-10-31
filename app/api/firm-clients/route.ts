import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { httpError, readJsonBody } from '../../../lib/pack-route-support';
import { firmCaller, partnerStore, signedInCustomer } from '../../../lib/partner-route-support';
import { assertCanAddClient } from '../../../lib/partner-layer';
import { acceptClientDelegation, assignFirmUserToClient, inviteClientDelegation, listFirmDelegations, revokeClientDelegation, unassignFirmUserFromClient } from '../../../lib/firm-tenancy';
import type { OrganizationRole } from '../../../lib/tenancy';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Client invitations and staffing, over the consent model in lib/firm-tenancy.ts (unchanged).
//   POST { firm_id, action: 'invite',   organization_id, max_role }   (MANAGER) firm asks a client; the plan's client limit applies
//   POST { firm_id, action: 'accept',   organization_id, max_role? }  (the CLIENT organisation's admin) accept, may narrow
//   POST { firm_id, action: 'revoke',   organization_id }             (either side)
//   POST { firm_id, action: 'assign' | 'unassign', organization_id, user_id }   (MANAGER)
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 2_000);
    const action = String(body.action || '');
    const firmId = String(body.firm_id || '');
    const organizationId = String(body.organization_id || '');
    if (!firmId || !organizationId) throw httpError('firm_id and organization_id are required', 400);

    // Accepting and revoking are done by the client's own admin, who is not a firm member.
    if (action === 'accept' || action === 'revoke') {
      const user = await signedInCustomer(req);
      const result = action === 'accept'
        ? await acceptClientDelegation(firmId, organizationId, user, body.max_role ? (String(body.max_role).toUpperCase() as OrganizationRole) : undefined)
        : (await revokeClientDelegation(firmId, organizationId, user), { revoked: true });
      return NextResponse.json({ result }, { headers: NO_STORE });
    }

    const caller = await firmCaller(req, firmId, 'MANAGER');
    if (action === 'invite') {
      const open = (await listFirmDelegations(firmId)).filter(d => d.status === 'ACTIVE' || d.status === 'PENDING');
      if (!open.some(d => d.organization_id === organizationId)) assertCanAddClient(await (await partnerStore()).getPlan(firmId), open.length);
      const record = await inviteClientDelegation(firmId, organizationId, String(body.max_role || '').toUpperCase() as OrganizationRole, caller.user);
      return NextResponse.json({ delegation: record }, { status: 201, headers: NO_STORE });
    }
    if (action === 'assign' || action === 'unassign') {
      const userId = String(body.user_id || '');
      if (!userId) throw httpError('user_id is required', 400);
      const result = action === 'assign'
        ? await assignFirmUserToClient(firmId, organizationId, userId, caller.user)
        : (await unassignFirmUserFromClient(firmId, organizationId, userId, caller.user), { removed: true });
      return NextResponse.json({ result }, { headers: NO_STORE });
    }
    throw httpError("action must be 'invite', 'accept', 'revoke', 'assign' or 'unassign'", 400);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
