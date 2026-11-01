import type { NextRequest } from 'next/server';
import { authenticateRequest, type ManagedUser } from './managed-auth';
import { isRealDataMode } from './runtime-mode';
import { requireFirmRole, type FirmRole } from './firm-tenancy';
import { InMemoryPartnerStore, publicBranding, type PartnerStore } from './partner-layer';
import { httpError } from './pack-route-support';

// Shared by the partner-layer routes. Everything here needs real-data mode: firm membership lives in
// the Realtime Database, which LAB mode does not have, so a LAB session gets a clear 409 instead of
// an empty page that looks like "no clients".

const globalForPartner = globalThis as unknown as { __finClosePartnerStore?: PartnerStore };

export async function partnerStore(): Promise<PartnerStore> {
  if (isRealDataMode()) {
    const { FirestorePartnerStore } = await import('./partner-store-firestore');
    return new FirestorePartnerStore();
  }
  if (!globalForPartner.__finClosePartnerStore) globalForPartner.__finClosePartnerStore = new InMemoryPartnerStore();
  return globalForPartner.__finClosePartnerStore;
}

export async function signedInCustomer(req: NextRequest): Promise<ManagedUser> {
  const auth = await authenticateRequest(req);
  if (auth.kind !== 'customer') throw httpError('sign in to use the partner features', 401);
  if (!isRealDataMode()) throw httpError('partner features need real-data mode (PILOT or PRODUCTION); this session is running in LAB mode', 409);
  return auth.user;
}

export async function firmCaller(req: NextRequest, firmId: unknown, minimum: FirmRole) {
  const id = String(firmId || '').trim();
  if (!id) throw httpError('firm_id is required', 400);
  const user = await signedInCustomer(req);
  const membership = await requireFirmRole(id, user, minimum);
  return { firm_id: id, user, role: membership.role };
}

// The firm branding a client company should see, if exactly one active firm with a brand holds its books.
export async function brandingForOrganization(organizationId: string) {
  if (!isRealDataMode()) return null;
  const { activeFirmsForOrganization } = await import('./firm-tenancy');
  const store = await partnerStore();
  for (const firmId of await activeFirmsForOrganization(organizationId)) {
    const branding = await store.getBranding(firmId);
    if (branding) return publicBranding(branding);
  }
  return null;
}
