import crypto from 'node:crypto';

export function secureReleaseTokenMatches(expected: string | undefined, supplied: string | null | undefined) {
  const expectedValue = String(expected || '').trim();
  const suppliedValue = String(supplied || '').trim();
  if (expectedValue.length < 32 || !suppliedValue) return false;
  const expectedBuffer = Buffer.from(expectedValue, 'utf8');
  const suppliedBuffer = Buffer.from(suppliedValue, 'utf8');
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}
