export type FirebaseServiceAccountEnvironmentStatus = 'MISSING' | 'MASKED_BY_VERCEL' | 'INVALID' | 'PRESENT';

export type FirebaseServiceAccountEnvironment = {
  status: FirebaseServiceAccountEnvironmentStatus;
  project_id: string | null;
  error_code?: string;
};

const VERCEL_SENSITIVE_PLACEHOLDER = /^\[SENSITIVE\]$/i;

export function inspectFirebaseServiceAccountEnvironment(
  rawValue: string | undefined = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
): FirebaseServiceAccountEnvironment {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return {
      status: 'MISSING',
      project_id: null,
      error_code: 'FIREBASE_ADMIN_CREDENTIAL_MISSING'
    };
  }

  if (VERCEL_SENSITIVE_PLACEHOLDER.test(raw)) {
    return {
      status: 'MASKED_BY_VERCEL',
      project_id: null,
      error_code: 'FIREBASE_ADMIN_CREDENTIAL_UNAVAILABLE_IN_LOCAL_VERCEL_ENV'
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const projectId = String(parsed.project_id || '').trim();
    const clientEmail = String(parsed.client_email || '').trim();
    const privateKey = String(parsed.private_key || '').trim();
    if (!projectId || !clientEmail || !privateKey) {
      return {
        status: 'INVALID',
        project_id: projectId || null,
        error_code: 'FIREBASE_ADMIN_CREDENTIAL_INVALID'
      };
    }
    return { status: 'PRESENT', project_id: projectId };
  } catch {
    return {
      status: 'INVALID',
      project_id: null,
      error_code: 'FIREBASE_ADMIN_CREDENTIAL_INVALID'
    };
  }
}

export function firebaseAdminCredentialConfigured(rawValue?: string) {
  return inspectFirebaseServiceAccountEnvironment(rawValue).status === 'PRESENT';
}
