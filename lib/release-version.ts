export const FINCLOSE_RELEASE_VERSION = '0.35.3' as const;
export const PILOT_CERTIFICATION_VERSION = FINCLOSE_RELEASE_VERSION;

export function releaseSourceSha() {
  return String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.FINCLOSE_RELEASE_SOURCE_SHA || '').trim().toLowerCase();
}

export function releaseSourceIdentityReady() {
  return /^[a-f0-9]{40}$/.test(releaseSourceSha());
}
