// Firm Workspace billing — Implementation Brief item 11. Tracks each
// firm's plan tier and the usage it is metered on (active firm members +
// active client delegations), and gates the WHITE_LABEL tier that
// lib/firm-branding.ts requires before a firm may customize its own
// branding (see that file).
//
// DISCLOSED LIMITATION, not a silent gap: this is the internal plan/usage
// ledger a payment processor integration would read from and write back
// to (e.g. a Stripe subscription webhook flipping status to PAST_DUE) --
// this pass does NOT call out to any live payment processor, since no
// processor credentials exist in this pilot's environment. setFirmTier
// below is therefore an internal/ops action (PARTNER-only, same as any
// other firm-admin action in this file) until a real checkout flow is
// wired in front of it. Treat tier changes as "what the firm is
// provisioned for," not "what has been charged" -- those are two
// different facts until billing is live.

import { realtimeDatabase } from './finclose-backend';
import type { ManagedUser } from './managed-auth';
import { requireFirmRole } from './firm-tenancy';

export type FirmBillingTier = 'STANDARD' | 'WHITE_LABEL';
export type FirmBillingStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export type FirmBillingRecord = {
  firm_id: string;
  tier: FirmBillingTier;
  status: FirmBillingStatus;
  billing_email: string;
  // Per-client-company price, in the firm's own currency's smallest unit
  // (e.g. cents). Flat per-client metering, not per-seat -- a firm's
  // portfolio size (lib/portfolio-status.ts's row count) is the one usage
  // number this codebase already computes reliably; seat count would
  // double-count firm staff who are not billable client relationships.
  price_per_client_cents: number;
  currency: string;
  set_by_user_id: string;
  created_at: number;
  updated_at: number;
};

const TIER_DEFAULT_PRICE_CENTS: Record<FirmBillingTier, number> = {
  STANDARD: 0,
  WHITE_LABEL: 1900 // $19.00 per actively-delegated client company per month, placeholder until pricing is set by the business
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export async function getFirmBilling(firmId: string): Promise<FirmBillingRecord | null> {
  const snap = await realtimeDatabase().ref(`finclose_firm_billing/${firmId}`).once('value');
  if (!snap.exists()) return null;
  return snap.val() as FirmBillingRecord;
}

// Every firm implicitly starts on STANDARD (free) until it explicitly
// upgrades -- callers that only need "is this firm white-label" should
// prefer this over getFirmBilling() so a firm with no billing record yet
// is correctly treated as STANDARD rather than as an error.
export async function effectiveFirmTier(firmId: string): Promise<FirmBillingTier> {
  const billing = await getFirmBilling(firmId);
  if (!billing) return 'STANDARD';
  if (billing.status !== 'ACTIVE') return 'STANDARD'; // a PAST_DUE/CANCELED white-label firm loses white-label privileges, not just a dashboard warning
  return billing.tier;
}

export async function setFirmTier(
  firmId: string,
  tier: FirmBillingTier,
  billingEmail: string,
  actorUser: ManagedUser,
  priceOverrideCents?: number
): Promise<FirmBillingRecord> {
  await requireFirmRole(firmId, actorUser, 'PARTNER');
  const email = String(billingEmail || '').trim();
  if (!email || !email.includes('@')) throw httpError('a valid billing email is required', 400);
  if (tier !== 'STANDARD' && tier !== 'WHITE_LABEL') throw httpError('invalid billing tier', 400);

  const db = realtimeDatabase();
  const now = Date.now();
  const existing = await getFirmBilling(firmId);
  const record: FirmBillingRecord = {
    firm_id: firmId,
    tier,
    status: 'ACTIVE',
    billing_email: email,
    price_per_client_cents: priceOverrideCents ?? TIER_DEFAULT_PRICE_CENTS[tier],
    currency: 'USD',
    set_by_user_id: actorUser.user_id,
    created_at: existing?.created_at ?? now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_billing/${firmId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_BILLING_TIER_SET', firm_id: firmId, tier, previous_tier: existing?.tier || null,
      actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return record;
}

export type FirmUsage = {
  active_client_count: number;
  active_member_count: number;
};

// Usage is derived, never stored -- counting live finclose_firm_client_
// delegations / finclose_firm_memberships (the same tables lib/firm-
// tenancy.ts already treats as the source of truth) rather than keeping a
// separate counter that could drift from the records that actually
// control access.
export async function computeFirmUsage(firmId: string): Promise<FirmUsage> {
  const db = realtimeDatabase();
  const [delegationsSnap, membersSnap] = await Promise.all([
    db.ref(`finclose_firm_client_delegations/${firmId}`).once('value'),
    db.ref(`finclose_firm_memberships/${firmId}`).once('value')
  ]);
  const delegations = (delegationsSnap.val() || {}) as Record<string, { status: string }>;
  const members = (membersSnap.val() || {}) as Record<string, { status: string }>;
  return {
    active_client_count: Object.values(delegations).filter(d => d.status === 'ACTIVE').length,
    active_member_count: Object.values(members).filter(m => m.status === 'ACTIVE').length
  };
}

export function estimateMonthlyChargeCents(billing: FirmBillingRecord | null, usage: FirmUsage): number {
  if (!billing || billing.tier === 'STANDARD') return 0;
  return billing.price_per_client_cents * usage.active_client_count;
}
