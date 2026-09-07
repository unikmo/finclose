import { firebaseApp } from './finclose-backend';
import { inspectFirebaseServiceAccountEnvironment } from './firebase-environment';
import { activeFirebaseWebApps, chooseFirebaseWebApp, type FirebaseWebAppCandidate } from './firebase-web-config-selection';
import { firebaseClientConfig } from './runtime-mode';

const FIREBASE_MANAGEMENT_API = 'https://firebase.googleapis.com/v1beta1';
const FAILURE_CACHE_MS = 60_000;

type FirebaseWebConfig = {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
};

export type FirebaseWebConfigDiscoveryResult = {
  ready: boolean;
  source: 'ENV' | 'FIREBASE_MANAGEMENT_API' | 'NONE';
  project_id: string | null;
  app_id: string | null;
  auth_domain: string | null;
  candidate_count?: number;
  selected_display_name?: string | null;
  error_code?: string;
  error_detail?: string;
};

let cachedFailure: { expires_at: number; result: FirebaseWebConfigDiscoveryResult } | null = null;
let inFlight: Promise<FirebaseWebConfigDiscoveryResult> | null = null;

function currentConfigResult(source: FirebaseWebConfigDiscoveryResult['source']): FirebaseWebConfigDiscoveryResult {
  const config = firebaseClientConfig();
  return {
    ready: Boolean(config.apiKey && config.authDomain && config.projectId),
    source,
    project_id: config.projectId || null,
    app_id: 'appId' in config ? String(config.appId || '') || null : null,
    auth_domain: config.authDomain || null
  };
}

function preferredHosts() {
  return Array.from(new Set([
    process.env.FINCLOSE_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    'finclose-lab-preview.vercel.app'
  ].filter(Boolean).map(value => String(value))));
}

async function accessToken() {
  const credential = firebaseApp().options.credential;
  if (!credential) throw new Error('Firebase Admin credential is unavailable');
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Firebase Admin credential did not return an access token');
  return token.access_token;
}

async function managementGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, any>;
    const message = String(body?.error?.message || '').replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`HTTP_${response.status}${message ? `:${message}` : ''}`);
  }
  return response.json() as Promise<T>;
}

async function listWebApps(projectId: string, token: string) {
  const apps: FirebaseWebAppCandidate[] = [];
  let pageToken = '';
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const result = await managementGet<{ apps?: FirebaseWebAppCandidate[]; nextPageToken?: string }>(
      `${FIREBASE_MANAGEMENT_API}/projects/${encodeURIComponent(projectId)}/webApps?${query.toString()}`,
      token
    );
    apps.push(...(Array.isArray(result.apps) ? result.apps : []));
    pageToken = String(result.nextPageToken || '');
    if (!pageToken) break;
  }
  return activeFirebaseWebApps(apps);
}

function cacheFailure(result: FirebaseWebConfigDiscoveryResult) {
  cachedFailure = { expires_at: Date.now() + FAILURE_CACHE_MS, result };
  return result;
}

async function discover(): Promise<FirebaseWebConfigDiscoveryResult> {
  const existing = currentConfigResult('ENV');
  if (existing.ready) return existing;

  const credentialEnvironment = inspectFirebaseServiceAccountEnvironment();
  const projectId = String(process.env.FIREBASE_WEB_PROJECT_ID || credentialEnvironment.project_id || '').trim();
  if (!projectId) {
    return cacheFailure({
      ready: false,
      source: 'NONE',
      project_id: null,
      app_id: null,
      auth_domain: null,
      error_code: credentialEnvironment.status === 'MASKED_BY_VERCEL'
        ? 'FIREBASE_ADMIN_CREDENTIAL_UNAVAILABLE_IN_LOCAL_VERCEL_ENV'
        : credentialEnvironment.status === 'INVALID'
          ? 'FIREBASE_ADMIN_CREDENTIAL_INVALID'
          : 'FIREBASE_PROJECT_ID_MISSING'
    });
  }

  if (credentialEnvironment.status !== 'PRESENT') {
    return cacheFailure({
      ready: false,
      source: 'NONE',
      project_id: projectId,
      app_id: null,
      auth_domain: null,
      error_code: credentialEnvironment.error_code || 'FIREBASE_ADMIN_CREDENTIAL_MISSING'
    });
  }

  try {
    const token = await accessToken();
    const apps = await listWebApps(projectId, token);
    const selected = chooseFirebaseWebApp(
      apps,
      String(process.env.FIREBASE_WEB_APP_ID || ''),
      preferredHosts()
    );
    if (!selected.app) {
      return cacheFailure({
        ready: false,
        source: 'NONE',
        project_id: projectId,
        app_id: null,
        auth_domain: null,
        candidate_count: apps.length,
        error_code: selected.reason
      });
    }

    const appName = String(selected.app.name || '').trim();
    if (!/^projects\/[^/]+\/webApps\/[^/]+$/.test(appName)) {
      return cacheFailure({
        ready: false,
        source: 'NONE',
        project_id: projectId,
        app_id: String(selected.app.appId || '') || null,
        auth_domain: null,
        candidate_count: apps.length,
        error_code: 'INVALID_WEB_APP_RESOURCE_NAME'
      });
    }

    const config = await managementGet<FirebaseWebConfig>(`${FIREBASE_MANAGEMENT_API}/${appName}/config`, token);
    if (!config.apiKey || !config.projectId || String(config.projectId) !== projectId) {
      return cacheFailure({
        ready: false,
        source: 'NONE',
        project_id: projectId,
        app_id: String(config.appId || selected.app.appId || '') || null,
        auth_domain: String(config.authDomain || '') || null,
        candidate_count: apps.length,
        error_code: 'DISCOVERED_WEB_CONFIG_INCOMPLETE_OR_PROJECT_MISMATCH'
      });
    }

    if (!process.env.FIREBASE_WEB_API_KEY) process.env.FIREBASE_WEB_API_KEY = String(config.apiKey);
    if (!process.env.FIREBASE_WEB_PROJECT_ID) process.env.FIREBASE_WEB_PROJECT_ID = String(config.projectId);
    if (!process.env.FIREBASE_AUTH_DOMAIN) process.env.FIREBASE_AUTH_DOMAIN = String(config.authDomain || `${projectId}.firebaseapp.com`);
    if (!process.env.FIREBASE_WEB_APP_ID && config.appId) process.env.FIREBASE_WEB_APP_ID = String(config.appId);

    cachedFailure = null;
    const resolved = currentConfigResult('FIREBASE_MANAGEMENT_API');
    return {
      ...resolved,
      candidate_count: apps.length,
      selected_display_name: String(selected.app.displayName || '') || null
    };
  } catch (error) {
    const detail = (error as Error).message;
    const errorCode = detail.startsWith('HTTP_403')
      ? 'FIREBASE_MANAGEMENT_API_FORBIDDEN_OR_DISABLED'
      : detail.startsWith('HTTP_')
        ? 'FIREBASE_MANAGEMENT_API_REQUEST_FAILED'
        : 'FIREBASE_WEB_CONFIG_DISCOVERY_FAILED';
    return cacheFailure({
      ready: false,
      source: 'NONE',
      project_id: projectId,
      app_id: null,
      auth_domain: null,
      error_code: errorCode,
      error_detail: detail.slice(0, 300)
    });
  }
}

export async function ensureFirebaseWebClientConfig(): Promise<FirebaseWebConfigDiscoveryResult> {
  const existing = currentConfigResult('ENV');
  if (existing.ready) return existing;
  if (cachedFailure && cachedFailure.expires_at > Date.now()) return cachedFailure.result;
  if (!inFlight) {
    inFlight = discover().finally(() => { inFlight = null; });
  }
  return inFlight;
}
