// Firm Workspace tenancy layer — v1 (foundation only: data model, client
// delegation/consent, tenant-isolation enforcement, firm-aware audit
// logging). Implements priority items 1-4 of the Firm Workspace
// Implementation Brief (firm + firm membership data model, client
// delegation/authorization model, cross-client tenant-isolation
// enforcement, firm roles + client-scoped permissions).
//
// NOT built in this pass (deliberately, not silently): the portfolio
// status/control aggregation engine (item 5, requires reading bookkeeping/
// reconciliation/close state per company — a separate, larger piece), the
// portfolio dashboard UI (item 6), the cross-client exception queue (item
// 7), the close calendar (item 8), API route wiring beyond what a caller
// needs to exercise this layer, billing hooks (item 11), and branding
// (item 12). Each of those is real, substantial, separate work — building
// them without the foundation below correctly isolating tenants first
// would risk shipping a dashboard on top of a leaky permission model.
//
// CRITICAL DESIGN INVARIANT (Mandatory QA in the brief): a client
// organization's own tenant boundary is NEVER touched by this file. A
// firm's access to a client is derived FRESH on every check from three
// separate, independently revocable records —
//   1. the user's own ACTIVE membership in the firm (finclose_firm_
//      memberships), 2. the firm's own ACTIVE delegation from the client
//      (finclose_firm_client_delegations, created only after the CLIENT's
//      own OWNER/ADMIN accepts it), and 3. (for every firm role except
//      PARTNER) an explicit per-client staffing assignment (finclose_firm_
//      client_assignments) —
// and the effective permission is the INTERSECTION (never the union) of
// what the client delegated and what the firm role can do. This file never
// writes a firm user into finclose_organization_memberships (the client's
// own membership table) — doing so would make firm access indistinguishable
// from a real client-side member and defeat revocation. Revoking any ONE
// of the three records above immediately and fully removes access, without
// writing to or reading from anything under finclose_organizations/*,
// finclose_organization_memberships/*, finclose_companies/*, or
// finclose_company_ownership/* beyond the read needed to resolve a
// company_id to its organization_id (the same read lib/tenancy.ts already
// does for direct company access).

import { realtimeDatabase } from './finclose-backend';
import type { ManagedUser } from './managed-auth';
import { ROLE_LEVEL, type OrganizationRole, requireOrganizationRole } from './tenancy';

export type FirmRole = 'PARTNER' | 'MANAGER' | 'ACCOUNTANT' | 'PAYROLL_SPECIALIST' | 'REVIEWER';

// Firm-INTERNAL seniority (who can invite staff, delegate clients, assign
// work) — distinct from, and not directly comparable to, OrganizationRole.
const FIRM_ROLE_LEVEL: Record<FirmRole, number> = {
  REVIEWER: 10,
  ACCOUNTANT: 20,
  PAYROLL_SPECIALIST: 20,
  MANAGER: 40,
  PARTNER: 50
};

// The HIGHEST OrganizationRole a firm user of this role could ever act at
// on a client, BEFORE intersecting with what that specific client actually
// delegated. A PARTNER is capped at ADMIN, not OWNER — portfolio oversight
// does not imply the firm can do anything an actual client owner could
// (e.g. remove the client's own OWNER, since firm users are never written
// into the client's own membership table in the first place).
const FIRM_ROLE_MAX_ORG_ROLE: Record<FirmRole, OrganizationRole> = {
  PARTNER: 'ADMIN',
  MANAGER: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  PAYROLL_SPECIALIST: 'ACCOUNTANT',
  REVIEWER: 'APPROVER'
};

export type DelegationStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export type FirmClientDelegation = {
  firm_id: string;
  organization_id: string;
  status: DelegationStatus;
  // The ceiling OrganizationRole the CLIENT has granted the firm for this
  // relationship — the other half of the intersection in
  // effectiveDelegatedRole(). Set by the client at accept time (accept
  // may narrow, never widen, what the firm requested).
  max_role: OrganizationRole;
  requested_max_role: OrganizationRole;
  invited_by_user_id: string;
  accepted_by_user_id?: string;
  revoked_by_user_id?: string;
  created_at: number;
  updated_at: number;
  accepted_at?: number;
  revoked_at?: number;
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function cleanFirmRole(value: unknown): FirmRole {
  const role = String(value || '').toUpperCase() as FirmRole;
  if (!FIRM_ROLE_LEVEL[role]) throw httpError('invalid firm role', 500);
  return role;
}

function cleanOrgRole(value: unknown): OrganizationRole {
  const role = String(value || '').toUpperCase() as OrganizationRole;
  if (!ROLE_LEVEL[role]) throw httpError('invalid organization role', 500);
  return role;
}

function newFirmId(seed: string) {
  return `firm_${seed}`;
}

// ---------------------------------------------------------------------
// Firm + firm membership
// ---------------------------------------------------------------------

export async function createFirm(name: string, actorUser: ManagedUser) {
  const db = realtimeDatabase();
  const id = newFirmId(db.ref('finclose_firms').push().key!);
  const now = Date.now();
  const record = {
    firm_id: id,
    name: String(name || '').trim() || 'Accounting firm',
    status: 'ACTIVE',
    created_by_user_id: actorUser.user_id,
    created_at: now,
    updated_at: now
  };
  const membership = {
    firm_id: id,
    user_id: actorUser.user_id,
    email: actorUser.email,
    name: actorUser.name,
    role: 'PARTNER' as FirmRole,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firms/${id}`]: record,
    [`finclose_firm_memberships/${id}/${actorUser.user_id}`]: membership,
    [`finclose_user_firms/${actorUser.user_id}/${id}`]: { firm_id: id, role: 'PARTNER', status: 'ACTIVE', created_at: now, updated_at: now },
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CREATED', firm_id: id, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return record;
}

export async function firmMembershipFor(firmId: string, userId: string) {
  const snap = await realtimeDatabase().ref(`finclose_firm_memberships/${firmId}/${userId}`).once('value');
  if (!snap.exists()) return null;
  const value = snap.val() as Record<string, unknown>;
  if (String(value.status || '') !== 'ACTIVE') return null;
  return { ...value, role: cleanFirmRole(value.role) } as Record<string, unknown> & { role: FirmRole };
}

export async function requireFirmRole(firmId: string, user: ManagedUser, minimum: FirmRole = 'REVIEWER') {
  const membership = await firmMembershipFor(firmId, user.user_id);
  if (!membership) throw httpError('you do not have access to this firm', 403);
  if (FIRM_ROLE_LEVEL[membership.role] < FIRM_ROLE_LEVEL[minimum]) {
    throw httpError(`this action requires ${minimum.toLowerCase()} access within the firm`, 403);
  }
  return membership;
}

export async function addFirmMember(firmId: string, actorUser: ManagedUser, target: { user_id: string; email: string; name?: string }, role: FirmRole) {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  cleanFirmRole(role);
  const db = realtimeDatabase();
  const now = Date.now();
  const membership = { firm_id: firmId, user_id: target.user_id, email: target.email, name: target.name || '', role, status: 'ACTIVE', created_at: now, updated_at: now };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_memberships/${firmId}/${target.user_id}`]: membership,
    [`finclose_user_firms/${target.user_id}/${firmId}`]: { firm_id: firmId, role, status: 'ACTIVE', created_at: now, updated_at: now },
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_MEMBER_ADDED', firm_id: firmId, target_user_id: target.user_id, role, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return membership;
}

export async function removeFirmMember(firmId: string, actorUser: ManagedUser, targetUserId: string) {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  const db = realtimeDatabase();
  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_memberships/${firmId}/${targetUserId}/status`]: 'REMOVED',
    [`finclose_firm_memberships/${firmId}/${targetUserId}/updated_at`]: now,
    [`finclose_user_firms/${targetUserId}/${firmId}/status`]: 'REMOVED',
    [`finclose_user_firms/${targetUserId}/${firmId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_MEMBER_REMOVED', firm_id: firmId, target_user_id: targetUserId, actor_user_id: actorUser.user_id, created_at: now
    }
  });
}

// ---------------------------------------------------------------------
// Client delegation (the firm <-> client-organization consent boundary)
// ---------------------------------------------------------------------

export async function inviteClientDelegation(firmId: string, organizationId: string, requestedMaxRole: OrganizationRole, actorUser: ManagedUser) {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  cleanOrgRole(requestedMaxRole);
  const db = realtimeDatabase();
  const now = Date.now();
  const record: FirmClientDelegation = {
    firm_id: firmId,
    organization_id: organizationId,
    status: 'PENDING',
    max_role: requestedMaxRole,
    requested_max_role: requestedMaxRole,
    invited_by_user_id: actorUser.user_id,
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_client_delegations/${firmId}/${organizationId}`]: record,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CLIENT_DELEGATION_INVITED', firm_id: firmId, client_organization_id: organizationId,
      requested_max_role: requestedMaxRole, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return record;
}

// Client consent step: only the CLIENT organization's own OWNER/ADMIN can
// accept — reuses lib/tenancy.ts's own requireOrganizationRole unchanged,
// so this never introduces a second, weaker path into a client org's
// existing membership check. The client may narrow the granted ceiling
// below what the firm requested; it may never be forced to grant more.
export async function acceptClientDelegation(firmId: string, organizationId: string, actorUser: ManagedUser, grantMaxRole?: OrganizationRole) {
  await requireOrganizationRole(organizationId, actorUser, 'ADMIN');
  const db = realtimeDatabase();
  const existingSnap = await db.ref(`finclose_firm_client_delegations/${firmId}/${organizationId}`).once('value');
  if (!existingSnap.exists()) throw httpError('no pending delegation from this firm', 404);
  const existing = existingSnap.val() as FirmClientDelegation;
  const grantedRole = grantMaxRole ? cleanOrgRole(grantMaxRole) : existing.requested_max_role;
  // Never let a client "accept" into a ceiling higher than what the firm
  // originally requested — accepting narrows or matches, never widens.
  const finalRole = ROLE_LEVEL[grantedRole] <= ROLE_LEVEL[existing.requested_max_role] ? grantedRole : existing.requested_max_role;
  const now = Date.now();
  const updates = { status: 'ACTIVE' as DelegationStatus, max_role: finalRole, accepted_by_user_id: actorUser.user_id, accepted_at: now, updated_at: now };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/status`]: updates.status,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/max_role`]: updates.max_role,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/accepted_by_user_id`]: updates.accepted_by_user_id,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/accepted_at`]: updates.accepted_at,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/updated_at`]: updates.updated_at,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/status`]: updates.status,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/max_role`]: updates.max_role,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/accepted_by_user_id`]: updates.accepted_by_user_id,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/accepted_at`]: updates.accepted_at,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/updated_at`]: updates.updated_at,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CLIENT_DELEGATION_ACCEPTED', firm_id: firmId, client_organization_id: organizationId,
      granted_max_role: finalRole, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return { ...existing, ...updates };
}

// Revocation is symmetric: either side can end the relationship, and
// EITHER path only ever writes to the delegation record (+ its mirror +
// an audit event) — never to the client organization's own records, so
// the client company itself is never at risk of corruption from a firm
// action.
export async function revokeClientDelegation(firmId: string, organizationId: string, actorUser: ManagedUser) {
  let actingAs: 'FIRM' | 'CLIENT';
  try {
    await requireFirmRole(firmId, actorUser, 'MANAGER');
    actingAs = 'FIRM';
  } catch {
    await requireOrganizationRole(organizationId, actorUser, 'ADMIN');
    actingAs = 'CLIENT';
  }
  const db = realtimeDatabase();
  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/status`]: 'REVOKED',
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/revoked_by_user_id`]: actorUser.user_id,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/revoked_at`]: now,
    [`finclose_firm_client_delegations/${firmId}/${organizationId}/updated_at`]: now,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/status`]: 'REVOKED',
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/revoked_by_user_id`]: actorUser.user_id,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/revoked_at`]: now,
    [`finclose_organization_firm_delegations/${organizationId}/${firmId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CLIENT_DELEGATION_REVOKED', firm_id: firmId, client_organization_id: organizationId,
      revoked_as: actingAs, actor_user_id: actorUser.user_id, created_at: now
    }
  });
}

export async function delegationFor(firmId: string, organizationId: string) {
  const snap = await realtimeDatabase().ref(`finclose_firm_client_delegations/${firmId}/${organizationId}`).once('value');
  if (!snap.exists()) return null;
  return snap.val() as FirmClientDelegation;
}

// ---------------------------------------------------------------------
// Per-client staffing (which specific firm users may act on which client)
// ---------------------------------------------------------------------

export async function assignFirmUserToClient(firmId: string, organizationId: string, targetUserId: string, actorUser: ManagedUser) {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  const delegation = await delegationFor(firmId, organizationId);
  if (!delegation || delegation.status !== 'ACTIVE') throw httpError('firm does not have an active delegation for this client', 409);
  const targetMembership = await firmMembershipFor(firmId, targetUserId);
  if (!targetMembership) throw httpError('target user is not an active firm member', 409);
  const db = realtimeDatabase();
  const now = Date.now();
  const record = { firm_id: firmId, organization_id: organizationId, user_id: targetUserId, role: targetMembership.role, created_at: now, updated_at: now };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_client_assignments/${firmId}/${organizationId}/${targetUserId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CLIENT_ASSIGNMENT_ADDED', firm_id: firmId, client_organization_id: organizationId,
      target_user_id: targetUserId, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return record;
}

export async function unassignFirmUserFromClient(firmId: string, organizationId: string, targetUserId: string, actorUser: ManagedUser) {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  const db = realtimeDatabase();
  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_client_assignments/${firmId}/${organizationId}/${targetUserId}`]: null,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_CLIENT_ASSIGNMENT_REMOVED', firm_id: firmId, client_organization_id: organizationId,
      target_user_id: targetUserId, actor_user_id: actorUser.user_id, created_at: now
    }
  });
}

async function assignmentExists(firmId: string, organizationId: string, userId: string) {
  const snap = await realtimeDatabase().ref(`finclose_firm_client_assignments/${firmId}/${organizationId}/${userId}`).once('value');
  return snap.exists();
}

// ---------------------------------------------------------------------
// Effective-permission arithmetic (pure, unit-testable without Firebase)
// ---------------------------------------------------------------------

// The effective OrganizationRole a firm user may act at on a client is
// the INTERSECTION (min, never max) of two independent ceilings: what the
// CLIENT delegated (delegation.max_role) and what the firm role itself is
// capable of (FIRM_ROLE_MAX_ORG_ROLE[firmRole]). Exported and kept pure
// (no I/O) specifically so the "firm role does not override unauthorized
// client scope" QA invariant can be tested directly, exhaustively, and
// without a live database.
export function effectiveDelegatedRole(delegationMaxRole: OrganizationRole, firmRole: FirmRole): OrganizationRole {
  const ceilingFromClient = ROLE_LEVEL[delegationMaxRole];
  const ceilingFromFirmRole = ROLE_LEVEL[FIRM_ROLE_MAX_ORG_ROLE[firmRole]];
  const effectiveLevel = Math.min(ceilingFromClient, ceilingFromFirmRole);
  const [role] = (Object.entries(ROLE_LEVEL) as Array<[OrganizationRole, number]>)
    .sort((a, b) => b[1] - a[1])
    .find(([, level]) => level <= effectiveLevel) ?? ['VIEWER', ROLE_LEVEL.VIEWER];
  return role;
}

// ---------------------------------------------------------------------
// The enforcement entrypoint every firm-scoped action must call.
// ---------------------------------------------------------------------

export async function requireFirmClientAccess(firmId: string, organizationId: string, user: ManagedUser, minimum: OrganizationRole = 'VIEWER') {
  const membership = await firmMembershipFor(firmId, user.user_id);
  if (!membership) throw httpError('you do not have access to this firm', 403);

  const delegation = await delegationFor(firmId, organizationId);
  if (!delegation || delegation.status !== 'ACTIVE') {
    throw httpError('this firm does not have active delegated access to this client', 403);
  }

  if (membership.role !== 'PARTNER') {
    const assigned = await assignmentExists(firmId, organizationId, user.user_id);
    if (!assigned) throw httpError('you are not assigned to this client within the firm', 403);
  }

  const effectiveRole = effectiveDelegatedRole(delegation.max_role, membership.role);
  if (ROLE_LEVEL[effectiveRole] < ROLE_LEVEL[minimum]) {
    throw httpError(`this action requires ${minimum.toLowerCase()} access on this client`, 403);
  }

  return { firm_id: firmId, organization_id: organizationId, firm_role: membership.role, effective_role: effectiveRole };
}

// Company-scoped variant, mirroring lib/tenancy.ts's requireCompanyAccess
// exactly — resolves company_id -> organization_id via the SAME existing
// finclose_company_ownership table (read-only), then delegates entirely
// to requireFirmClientAccess above. No new company-side data is read or
// written.
export async function requireFirmCompanyAccess(firmId: string, companyId: string, user: ManagedUser, minimum: OrganizationRole = 'VIEWER') {
  const ownership = await realtimeDatabase().ref(`finclose_company_ownership/${companyId}`).once('value');
  if (!ownership.exists()) throw httpError('company has no production tenant ownership record', 409);
  const record = ownership.val() as Record<string, unknown>;
  const organizationId = String(record.organization_id || '');
  if (!organizationId) throw httpError('company tenant ownership is invalid', 409);
  const access = await requireFirmClientAccess(firmId, organizationId, user, minimum);
  return { ...access, company_id: companyId };
}

// ---------------------------------------------------------------------
// Portfolio listing (basic — NOT the traffic-light status engine; see
// header note). Lists which client organizations a firm currently has
// active delegated access to, for a firm-facing "my clients" listing.
// ---------------------------------------------------------------------

export async function listFirmClientOrganizations(firmId: string) {
  const db = realtimeDatabase();
  const snap = await db.ref(`finclose_firm_client_delegations/${firmId}`).once('value');
  const all = (snap.val() || {}) as Record<string, FirmClientDelegation>;
  const active = Object.values(all).filter(d => d.status === 'ACTIVE');
  const results: Array<{ organization_id: string; name: unknown; max_role: OrganizationRole }> = [];
  for (const delegation of active) {
    const orgSnap = await db.ref(`finclose_organizations/${delegation.organization_id}`).once('value');
    if (!orgSnap.exists()) continue;
    const org = orgSnap.val() as Record<string, unknown>;
    results.push({ organization_id: delegation.organization_id, name: org.name, max_role: delegation.max_role });
  }
  return results;
}

// ---------------------------------------------------------------------
// Firm-aware audit logging (brief section 8). Every firm-delegated
// action should call this alongside (not instead of) whatever the
// underlying engine (bookkeeping/payroll/reconciliation/close) already
// logs, so "which firm user did what, for which client company" is
// always answerable from finclose_audit_events alone.
// ---------------------------------------------------------------------

export async function recordFirmAuditEvent(input: {
  actor_user_id: string;
  actor_firm_id: string;
  client_organization_id: string;
  company_id?: string;
  service?: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  const db = realtimeDatabase();
  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref(`finclose_audit_events/${auditKey}`).set({
    event: 'FIRM_DELEGATED_ACTION',
    actor_user_id: input.actor_user_id,
    actor_firm_id: input.actor_firm_id,
    client_organization_id: input.client_organization_id,
    company_id: input.company_id || null,
    service: input.service || null,
    action: input.action,
    metadata: input.metadata || null,
    created_at: now
  });
}
