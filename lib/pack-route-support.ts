import type { NextRequest } from 'next/server';
import { authenticateRequest } from './managed-auth';
import { requireCompanyAccess, type OrganizationRole } from './tenancy';
import { isRealDataMode } from './runtime-mode';
import { InMemoryPackStore, type PackStore } from './pack-store';
import { checkRateLimit } from './rate-limit';
import { InMemoryDocumentStore, type DocumentStore } from './document-store';

type Identity = Awaited<ReturnType<typeof authenticateRequest>>;
export type Limiter = (key: string, limit: number, windowMs: number) => Promise<void>;

async function sharedLimiter(key: string, limit: number, windowMs: number) {
  const [{ getFirestore }, { firebaseApp }, { checkSharedRateLimit }] = await Promise.all([import('firebase-admin/firestore'), import('./finclose-backend'), import('./rate-limit-shared')]);
  await checkSharedRateLimit(getFirestore(firebaseApp()), key, limit, windowMs);
}

// Shared by the saved-pack routes: picks the store, authenticates, enforces
// tenancy and rate limits. In LAB mode packs live in memory and are lost on
// restart. In PILOT/PRODUCTION they need the same explicit operator switch as
// the stateless route, a signed-in user and access to the named company.

export function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

const globalForStore = globalThis as unknown as { __finclosePackStore?: PackStore };

export async function packStore(): Promise<PackStore> {
  if (isRealDataMode()) {
    const { FirestorePackStore } = await import('./pack-store-firestore');
    return new FirestorePackStore();
  }
  if (!globalForStore.__finclosePackStore) globalForStore.__finclosePackStore = new InMemoryPackStore();
  return globalForStore.__finclosePackStore;
}

const globalForDocs = globalThis as unknown as { __finclosePackDocs?: DocumentStore };

export async function documentStore(): Promise<DocumentStore> {
  if (isRealDataMode()) {
    const { FirebaseDocumentStore } = await import('./document-store-firebase');
    return new FirebaseDocumentStore();
  }
  if (!globalForDocs.__finclosePackDocs) globalForDocs.__finclosePackDocs = new InMemoryDocumentStore();
  return globalForDocs.__finclosePackDocs;
}

export type PackCaller = { company_id: string; organization_id: string; user_id: string };

export async function authorisePackCall(req: NextRequest, companyIdInput: unknown, minimum: OrganizationRole, limit = 60): Promise<PackCaller> {
  return authoriseIdentity(await authenticateRequest(req), companyIdInput, minimum, limit);
}

// Everything after sign-in. Split out so tests can supply an identity and a limiter.
// Real-data mode uses the Firestore-backed limit shared by all instances; LAB uses process memory.
export async function authoriseIdentity(auth: Identity, companyIdInput: unknown, minimum: OrganizationRole, limit = 60, limiter?: Limiter): Promise<PackCaller> {
  const companyId = String(companyIdInput || '').trim();
  if (isRealDataMode()) {
    if (auth.kind !== 'customer') throw httpError('sign in to use review packs', 401);
    if (process.env.FINCLOSE_STATEMENT_PREP_ENABLED !== 'true') throw httpError('statement preparation is not enabled for real data in this deployment', 403);
    if (!companyId) throw httpError('company_id is required in real-data mode', 400);
    const access = await requireCompanyAccess(companyId, auth.user, minimum);
    const caller = { company_id: companyId, organization_id: access.organization_id, user_id: auth.user.user_id };
    await (limiter || sharedLimiter)(`pack:${caller.user_id}`, limit, 60_000);
    return caller;
  }
  const caller = { company_id: companyId || 'lab_company', organization_id: 'lab_org', user_id: 'lab' };
  checkRateLimit(`pack:${caller.user_id}`, limit, 60_000);
  return caller;
}

export async function readJsonBody(req: NextRequest, maxChars: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxChars * 2) throw httpError('request is too large', 413);
  const raw = await req.text();
  if (raw.length > maxChars * 2) throw httpError('request is too large', 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw httpError('request body must be JSON', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError('request body must be a JSON object', 400);
  return body as Record<string, unknown>;
}
