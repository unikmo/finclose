import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import type { ManagedUser } from './managed-auth';
import { registerProductionOrganization } from './production-ledger';
import { isRealDataMode } from './runtime-mode';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'APPROVER' | 'VIEWER';

const ROLE_LEVEL: Record<OrganizationRole, number> = {
  VIEWER: 10,
  ACCOUNTANT: 30,
  APPROVER: 40,
  ADMIN: 50,
  OWNER: 60
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function cleanRole(value: unknown): OrganizationRole {
  const role = String(value || '').toUpperCase() as OrganizationRole;
  if (!ROLE_LEVEL[role]) throw httpError('invalid organization role', 500);
  return role;
}

function organizationIdForUser(userId: string) {
  return `org_${crypto.createHash('sha256').update(userId).digest('hex').slice(0, 24)}`;
}

export async function ensurePersonalOrganization(user: ManagedUser) {
  const orgId = organizationIdForUser(user.user_id);
  const db = realtimeDatabase();
  const orgRef = db.ref(`finclose_organizations/${orgId}`);
  const now = Date.now();
  const existing = await orgRef.once('value');
  const organizationName = user.name ? `${user.name}'s organization` : 'FinClose organization';
  if (!existing.exists()) {
    const auditKey = db.ref('finclose_audit_events').push().key!;
    await db.ref().update({
      [`finclose_organizations/${orgId}`]: {
        organization_id: orgId,
        name: organizationName,
        status: 'ACTIVE',
        created_by_user_id: user.user_id,
        created_at: now,
        updated_at: now
      },
      [`finclose_organization_memberships/${orgId}/${user.user_id}`]: {
        organization_id: orgId,
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        role: 'OWNER',
        status: 'ACTIVE',
        created_at: now,
        updated_at: now
      },
      [`finclose_user_organizations/${user.user_id}/${orgId}`]: {
        organization_id: orgId,
        role: 'OWNER',
        status: 'ACTIVE',
        created_at: now,
        updated_at: now
      },
      [`finclose_users/${user.user_id}`]: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        auth_mode: user.auth_mode,
        email_verified: user.email_verified,
        primary_organization_id: orgId,
        updated_at: now,
        created_at: now
      },
      [`finclose_audit_events/${auditKey}`]: {
        event: 'ORGANIZATION_CREATED',
        organization_id: orgId,
        actor_user_id: user.user_id,
        created_at: now
      }
    });
  } else {
    await db.ref().update({
      [`finclose_organization_memberships/${orgId}/${user.user_id}/email`]: user.email,
      [`finclose_organization_memberships/${orgId}/${user.user_id}/name`]: user.name,
      [`finclose_organization_memberships/${orgId}/${user.user_id}/updated_at`]: now,
      [`finclose_users/${user.user_id}/email`]: user.email,
      [`finclose_users/${user.user_id}/name`]: user.name,
      [`finclose_users/${user.user_id}/auth_mode`]: user.auth_mode,
      [`finclose_users/${user.user_id}/email_verified`]: user.email_verified,
      [`finclose_users/${user.user_id}/primary_organization_id`]: orgId,
      [`finclose_users/${user.user_id}/updated_at`]: now
    });
  }
  if (isRealDataMode()) {
    await registerProductionOrganization({ organization_id: orgId, name: organizationName, actor_user_id: user.user_id });
  }
  return { organization_id: orgId, role: 'OWNER' as OrganizationRole };
}

export async function membershipFor(organizationId: string, userId: string) {
  const snap = await realtimeDatabase().ref(`finclose_organization_memberships/${organizationId}/${userId}`).once('value');
  if (!snap.exists()) return null;
  const value = snap.val() as Record<string, unknown>;
  if (String(value.status || '') !== 'ACTIVE') return null;
  return { ...value, role: cleanRole(value.role) } as Record<string, unknown> & { role: OrganizationRole };
}

export async function requireOrganizationRole(organizationId: string, user: ManagedUser, minimum: OrganizationRole = 'VIEWER') {
  const membership = await membershipFor(organizationId, user.user_id);
  if (!membership) throw httpError('you do not have access to this organization', 403);
  if (ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimum]) {
    throw httpError(`this action requires ${minimum.toLowerCase()} access`, 403);
  }
  return membership;
}

export async function bindCompanyToOrganization(companyId: string, organizationId: string, actorUserId: string) {
  const db = realtimeDatabase();
  const ownershipRef = db.ref(`finclose_company_ownership/${companyId}`);
  const existing = await ownershipRef.once('value');
  if (existing.exists()) {
    const current = existing.val() as Record<string, unknown>;
    if (String(current.organization_id || '') !== organizationId) throw httpError('company is owned by another organization', 403);
    return current;
  }
  const now = Date.now();
  const record = {
    company_id: companyId,
    organization_id: organizationId,
    status: 'ACTIVE',
    bound_by_user_id: actorUserId,
    created_at: now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_company_ownership/${companyId}`]: record,
    [`finclose_companies/${companyId}/organization_id`]: organizationId,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'COMPANY_BOUND_TO_ORGANIZATION',
      company_id: companyId,
      organization_id: organizationId,
      actor_user_id: actorUserId,
      created_at: now
    }
  });
  return record;
}

export async function requireCompanyAccess(companyId: string, user: ManagedUser, minimum: OrganizationRole = 'VIEWER') {
  const ownership = await realtimeDatabase().ref(`finclose_company_ownership/${companyId}`).once('value');
  if (!ownership.exists()) throw httpError('company has no production tenant ownership record', 409);
  const record = ownership.val() as Record<string, unknown>;
  const organizationId = String(record.organization_id || '');
  if (!organizationId) throw httpError('company tenant ownership is invalid', 409);
  const membership = await requireOrganizationRole(organizationId, user, minimum);
  return { organization_id: organizationId, membership };
}

export async function listOrganizationCompanies(organizationId: string) {
  const ownershipSnap = await realtimeDatabase().ref('finclose_company_ownership').once('value');
  const ownership = (ownershipSnap.val() || {}) as Record<string, Record<string, unknown>>;
  const companyIds = Object.values(ownership)
    .filter(item => String(item.organization_id || '') === organizationId && String(item.status || 'ACTIVE') === 'ACTIVE')
    .map(item => String(item.company_id || ''))
    .filter(Boolean);
  if (!companyIds.length) return [];
  const db = realtimeDatabase();
  const companies = [] as Record<string, unknown>[];
  for (const companyId of companyIds) {
    const snap = await db.ref(`finclose_companies/${companyId}`).once('value');
    if (snap.exists()) companies.push(snap.val() as Record<string, unknown>);
  }
  return companies
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
    .map(d => ({
      company_id: d.company_id,
      legal_name: d.legal_name,
      country_code: d.country_code,
      country_name: d.country_name,
      base_currency: d.base_currency,
      service_scope: d.service_scope,
      status: d.status
    }));
}

export async function deploymentAuthorization(deployment: Record<string, unknown>, user: ManagedUser, minimum: OrganizationRole = 'VIEWER') {
  const organizationId = String(deployment.organization_id || '');
  if (!organizationId) throw httpError('service deployment has no production tenant ownership record', 409);
  const membership = await requireOrganizationRole(organizationId, user, minimum);
  return { organization_id: organizationId, membership };
}
