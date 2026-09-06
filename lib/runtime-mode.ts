export type FinCloseRuntimeMode = 'LAB' | 'PILOT' | 'PRODUCTION';

export type RuntimeReadiness = {
  mode: FinCloseRuntimeMode;
  real_data_mode: boolean;
  firebase_auth_server_ready: boolean;
  firebase_auth_client_ready: boolean;
  postgres_ledger_ready: boolean;
  storage_ready: boolean;
  tenant_isolation_required: boolean;
  real_data_allowed: boolean;
  blockers: string[];
};

export function runtimeMode(): FinCloseRuntimeMode {
  const raw = String(process.env.FINCLOSE_RUNTIME_MODE || 'LAB').trim().toUpperCase();
  if (raw === 'PILOT' || raw === 'PRODUCTION') return raw;
  return 'LAB';
}

export function isRealDataMode() {
  return runtimeMode() !== 'LAB';
}

function firebaseProjectIdFromServiceAccount() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return String(parsed.project_id || '').trim();
  } catch {
    return '';
  }
}

export function firebaseClientConfig() {
  const projectId = String(process.env.FIREBASE_WEB_PROJECT_ID || firebaseProjectIdFromServiceAccount()).trim();
  const apiKey = String(process.env.FIREBASE_WEB_API_KEY || '').trim();
  const authDomain = String(process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '')).trim();
  const appId = String(process.env.FIREBASE_WEB_APP_ID || '').trim();
  return {
    apiKey,
    authDomain,
    projectId,
    ...(appId ? { appId } : {})
  };
}

export function runtimeReadiness(): RuntimeReadiness {
  const mode = runtimeMode();
  const realDataMode = mode !== 'LAB';
  const firebaseAuthServerReady = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const client = firebaseClientConfig();
  const firebaseAuthClientReady = Boolean(client.apiKey && client.authDomain && client.projectId);
  const postgresLedgerReady = Boolean(process.env.FINCLOSE_DATABASE_URL);
  const storageReady = Boolean(process.env.FIREBASE_STORAGE_BUCKET);
  const blockers: string[] = [];

  if (realDataMode) {
    if (!firebaseAuthServerReady) blockers.push('FIREBASE_AUTH_SERVER_NOT_CONFIGURED');
    if (!firebaseAuthClientReady) blockers.push('FIREBASE_AUTH_CLIENT_NOT_CONFIGURED');
    if (!postgresLedgerReady) blockers.push('POSTGRES_LEDGER_NOT_CONFIGURED');
    if (!storageReady) blockers.push('FIREBASE_STORAGE_NOT_CONFIGURED');
  }

  return {
    mode,
    real_data_mode: realDataMode,
    firebase_auth_server_ready: firebaseAuthServerReady,
    firebase_auth_client_ready: firebaseAuthClientReady,
    postgres_ledger_ready: postgresLedgerReady,
    storage_ready: storageReady,
    tenant_isolation_required: realDataMode,
    real_data_allowed: realDataMode && blockers.length === 0,
    blockers
  };
}

export function assertRealDataRuntimeReady() {
  const readiness = runtimeReadiness();
  if (!readiness.real_data_mode) return readiness;
  if (!readiness.real_data_allowed) {
    const error = new Error(`real-data runtime is blocked: ${readiness.blockers.join(', ')}`);
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return readiness;
}

export function publicRuntimeProfile() {
  const readiness = runtimeReadiness();
  return {
    mode: readiness.mode,
    real_data_mode: readiness.real_data_mode,
    real_data_allowed: readiness.real_data_allowed,
    blockers: readiness.blockers,
    auth_mode: readiness.real_data_mode ? 'FIREBASE_AUTH_SESSION' : 'LAB_ACCOUNT_SESSION',
    firebase_client_config: readiness.firebase_auth_client_ready ? firebaseClientConfig() : null,
    ledger: readiness.postgres_ledger_ready ? 'POSTGRES_CONFIGURED' : 'POSTGRES_REQUIRED'
  };
}
