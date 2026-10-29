import crypto from 'node:crypto';

// Bearer-token check for scheduled maintenance routes. Accepts Vercel Cron's own CRON_SECRET or
// FINCLOSE_CRON_TOKEN. With neither set the route is closed (503), never open. Tokens are compared
// as equal-length digests in constant time.

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();

export function checkCronAuth(header: string | null, env: Record<string, string | undefined> = process.env): 'ok' | 'unauthorised' | 'not_configured' {
  const secrets = [env.CRON_SECRET, env.FINCLOSE_CRON_TOKEN].filter((s): s is string => typeof s === 'string' && s.length >= 16);
  if (!secrets.length) return 'not_configured';
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!bearer) return 'unauthorised';
  const given = digest(bearer);
  // Check every secret so timing does not reveal which one matched.
  let ok = false;
  for (const secret of secrets) if (crypto.timingSafeEqual(given, digest(secret))) ok = true;
  return ok ? 'ok' : 'unauthorised';
}
