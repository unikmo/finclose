export type FirebaseWebAppCandidate = {
  name?: string;
  appId?: string;
  displayName?: string;
  appUrls?: string[];
  state?: string;
};

export type FirebaseWebAppSelectionReason =
  | 'EXPLICIT_APP_ID'
  | 'EXPLICIT_APP_ID_NOT_FOUND'
  | 'ONLY_ACTIVE_WEB_APP'
  | 'UNIQUE_FINCLOSE_MATCH'
  | 'MULTIPLE_WEB_APPS_AMBIGUOUS'
  | 'NO_REGISTERED_WEB_APP';

function normalizedHost(value: string) {
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function activeFirebaseWebApps(apps: FirebaseWebAppCandidate[]) {
  return apps.filter(app => String(app.state || 'ACTIVE').toUpperCase() !== 'DELETED');
}

export function chooseFirebaseWebApp(
  apps: FirebaseWebAppCandidate[],
  requestedAppId: string,
  preferredHostValues: string[]
): { app: FirebaseWebAppCandidate | null; reason: FirebaseWebAppSelectionReason } {
  const requested = requestedAppId.trim();
  if (requested) {
    const exact = apps.find(app =>
      String(app.appId || '') === requested ||
      String(app.name || '').endsWith(`/webApps/${requested}`)
    );
    return exact
      ? { app: exact, reason: 'EXPLICIT_APP_ID' }
      : { app: null, reason: 'EXPLICIT_APP_ID_NOT_FOUND' };
  }

  if (apps.length === 1) return { app: apps[0], reason: 'ONLY_ACTIVE_WEB_APP' };

  const hosts = Array.from(new Set(preferredHostValues.filter(Boolean).map(normalizedHost)));
  const ranked = apps.map(app => {
    const name = String(app.displayName || '').toLowerCase();
    const urls = Array.isArray(app.appUrls) ? app.appUrls.map(url => normalizedHost(String(url))) : [];
    let score = 0;
    if (name === 'finclose') score += 100;
    else if (name.includes('finclose')) score += 80;
    if (urls.some(url => hosts.includes(url))) score += 60;
    return { app, score };
  }).sort((a, b) => b.score - a.score || String(a.app.appId || '').localeCompare(String(b.app.appId || '')));

  if (ranked.length && ranked[0].score > 0 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    return { app: ranked[0].app, reason: 'UNIQUE_FINCLOSE_MATCH' };
  }

  return {
    app: null,
    reason: apps.length ? 'MULTIPLE_WEB_APPS_AMBIGUOUS' : 'NO_REGISTERED_WEB_APP'
  };
}
