// Firm Workspace white-label branding -- Implementation Brief item 12.
// Lets a WHITE_LABEL-tier firm (see lib/firm-billing.ts) replace the
// "FinClose Firm Workspace" nav mark their own staff and (eventually)
// their clients see with the firm's own name, logo, and accent color.
//
// DISCLOSED SCOPE: this pass covers in-app branding of the Firm
// Workspace surfaces only (nav bar, summary header) -- it does NOT cover
// a custom domain (DNS/TLS provisioning is separate, larger
// infrastructure work) or branding the client-facing company workspace
// itself (a client's own org stays FinClose-branded regardless of which
// firm manages it, since that is the client's tenant, not the firm's --
// see lib/firm-tenancy.ts's isolation invariant). A firm that downgrades
// off WHITE_LABEL keeps its saved branding record (so re-upgrading
// restores it) but effectiveFirmBranding() stops returning it.

import { realtimeDatabase } from './finclose-backend';
import type { ManagedUser } from './managed-auth';
import { requireFirmRole } from './firm-tenancy';
import { effectiveFirmTier } from './firm-billing';

export type FirmBrandingRecord = {
  firm_id: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string; // hex, used for the nav mark background
  accent_color: string;  // hex, used for emphasis text (mirrors --fc-brass usage)
  updated_by_user_id: string;
  created_at: number;
  updated_at: number;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PRIMARY = '#d6ad57'; // matches --fc-brass, so an unbranded white-label firm still looks intentional
const DEFAULT_ACCENT = '#d6ad57';

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function cleanHex(value: unknown, fallback: string): string {
  const v = String(value || '').trim();
  if (!v) return fallback;
  if (!HEX_COLOR.test(v)) throw httpError('colors must be a 6-digit hex value, e.g. #1a2b3c', 400);
  return v;
}

function cleanLogoUrl(value: unknown): string | null {
  const v = String(value || '').trim();
  if (!v) return null;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw httpError('logo_url must be a valid URL', 400);
  }
  if (parsed.protocol !== 'https:') throw httpError('logo_url must be https', 400);
  return parsed.toString();
}

export async function getFirmBranding(firmId: string): Promise<FirmBrandingRecord | null> {
  const snap = await realtimeDatabase().ref(`finclose_firm_branding/${firmId}`).once('value');
  if (!snap.exists()) return null;
  return snap.val() as FirmBrandingRecord;
}

// What the UI should actually render: null unless the firm is CURRENTLY
// on an ACTIVE WHITE_LABEL tier, even if a branding record exists from a
// past subscription -- so a lapsed or downgraded firm's dashboard falls
// back to default FinClose branding rather than keeping a paid-tier
// cosmetic it is no longer entitled to.
export async function effectiveFirmBranding(firmId: string): Promise<FirmBrandingRecord | null> {
  const tier = await effectiveFirmTier(firmId);
  if (tier !== 'WHITE_LABEL') return null;
  return getFirmBranding(firmId);
}

export async function setFirmBranding(
  firmId: string,
  input: { display_name: string; logo_url?: string; primary_color?: string; accent_color?: string },
  actorUser: ManagedUser
): Promise<FirmBrandingRecord> {
  await requireFirmRole(firmId, actorUser, 'MANAGER');
  const tier = await effectiveFirmTier(firmId);
  if (tier !== 'WHITE_LABEL') {
    throw httpError('branding is a WHITE_LABEL-tier feature; upgrade this firm\'s billing tier first', 403);
  }

  const displayName = String(input.display_name || '').trim();
  if (!displayName) throw httpError('display_name is required', 400);
  if (displayName.length > 60) throw httpError('display_name must be 60 characters or fewer', 400);

  const db = realtimeDatabase();
  const now = Date.now();
  const existing = await getFirmBranding(firmId);
  const record: FirmBrandingRecord = {
    firm_id: firmId,
    display_name: displayName,
    logo_url: cleanLogoUrl(input.logo_url),
    primary_color: cleanHex(input.primary_color, DEFAULT_PRIMARY),
    accent_color: cleanHex(input.accent_color, DEFAULT_ACCENT),
    updated_by_user_id: actorUser.user_id,
    created_at: existing?.created_at ?? now,
    updated_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_firm_branding/${firmId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'FIRM_BRANDING_UPDATED', firm_id: firmId, actor_user_id: actorUser.user_id, created_at: now
    }
  });
  return record;
}
