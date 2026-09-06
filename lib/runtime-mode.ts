export type FinCloseRuntimeMode = 'LAB' | 'PILOT' | 'PRODUCTION';
export type UploadQuarantineMode = 'BLOCK' | 'MANUAL_REVIEW' | 'SCANNER';

export type RuntimeReadiness = {
  mode: FinCloseRuntimeMode;
  real_data_mode: boolean;
  firebase_auth_server_ready: boolean;
  firebase_auth_client_ready: boolean;
  firestore_ledger_configured: boolean;
  storage_ready: boolean;
  release_gate_approved: boolean;
  upload_quarantine_mode: UploadQuarantineMode;
  upload_scanner_verified: boolean;
  upload_quarantine_ready: boolean;
  tenant_isolation_required: boolean;
  real_data_allowed_by_config: boolean;
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

export function uploadQuarantineMode(): UploadQuarantineMode {
  const raw = String(process.env.FINCLOSE_UPLOAD_QUARANTINE_MODE || 'BLOCK').trim().toUpperCase();
  if (raw === 'MANUAL_REVIEW' || raw === 'SCANNER') return raw;
  return 'BLOCK';
}

function releaseGateApproved(mode: FinCloseRuntimeMode) {
  if (mode === 'LAB') return true;
  if (mode === 'PILOT') return String(process.env.FINCLOSE_PILOT_RELEASE_GATE || '').trim().toUpperCase() === 'APPROVED';
  return String(process.env.FINCLOSE_PRODUCTION_RELEASE_GATE || '').trim().toUpperCase() === 'APPROVED';
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
  const firestoreLedgerConfigured = firebaseAuthServerReady;
  const storageReady = Boolean(process.env.FIREBASE_STORAGE_BUCKET);
  const releaseApproved = releaseGateApproved(mode);
  const quarantineMode = uploadQuarantineMode();
  const uploadScannerVerified = String(process.env.FINCLOSE_UPLOAD_SCANNER_VERIFIED || '').trim().toUpperCase() === 'YES';
  const pilotQuarantineReady = quarantineMode === 'MANUAL_REVIEW' || (quarantineMode === 'SCANNER' && uploadScannerVerified);
  const productionQuarantineReady = quarantineMode === 'SCANNER' && uploadScannerVerified;
  const uploadQuarantineReady = mode === 'PRODUCTION' ? productionQuarantineReady : pilotQuarantineReady;
  const blockers: string[] = [];

  if (realDataMode) {
    if (!firebaseAuthServerReady) blockers.push('FIREBASE_AUTH_SERVER_NOT_CONFIGURED');
    if (!firebaseAuthClientReady) blockers.push('FIREBASE_AUTH_CLIENT_NOT_CONFIGURED');
    if (!firestoreLedgerConfigured) blockers.push('FIRESTORE_LEDGER_NOT_CONFIGURED');
    if (!storageReady) blockers.push('FIREBASE_STORAGE_NOT_CONFIGURED');
    if (!releaseApproved) blockers.push(mode === 'PILOT' ? 'PILOT_RELEASE_GATE_NOT_APPROVED' : 'PRODUCTION_RELEASE_GATE_NOT_APPROVED');
    if (quarantineMode === 'SCANNER' && !uploadScannerVerified) blockers.push('UPLOAD_SCANNER_NOT_VERIFIED');
    if (mode === 'PRODUCTION' && quarantineMode !== 'SCANNER') blockers.push('PRODUCTION_REQUIRES_VERIFIED_UPLOAD_SCANNER');
    if (!uploadQuarantineReady) blockers.push('REAL_DATA_UPLOAD_QUARANTINE_NOT_CONFIGURED');
  }

  return {
    mode,
    real_data_mode: realDataMode,
    firebase_auth_server_ready: firebaseAuthServerReady,
    firebase_auth_client_ready: firebaseAuthClientReady,
    firestore_ledger_configured: firestoreLedgerConfigured,
    storage_ready: storageReady,
    release_gate_approved: releaseApproved,
    upload_quarantine_mode: quarantineMode,
    upload_scanner_verified: uploadScannerVerified,
    upload_quarantine_ready: uploadQuarantineReady,
    tenant_isolation_required: realDataMode,
    real_data_allowed_by_config: realDataMode && blockers.length === 0,
    blockers
  };
}

export function assertRealDataRuntimeReady() {
  const readiness = runtimeReadiness();
  if (!readiness.real_data_mode) return readiness;
  if (!readiness.real_data_allowed_by_config) {
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
    real_data_allowed_by_config: readiness.real_data_allowed_by_config,
    blockers: readiness.blockers,
    release_gate_approved: readiness.release_gate_approved,
    upload_quarantine_mode: readiness.upload_quarantine_mode,
    upload_scanner_verified: readiness.upload_scanner_verified,
    upload_quarantine_ready: readiness.upload_quarantine_ready,
    auth_mode: readiness.real_data_mode ? 'FIREBASE_AUTH_SESSION' : 'LAB_ACCOUNT_SESSION',
    firebase_client_config: readiness.firebase_auth_client_ready ? firebaseClientConfig() : null,
    ledger: readiness.firestore_ledger_configured ? 'FIREBASE_FIRESTORE_CONFIGURED' : 'FIREBASE_FIRESTORE_REQUIRED'
  };
}
