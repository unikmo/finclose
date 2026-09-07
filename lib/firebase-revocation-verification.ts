export type SessionRevocationVerificationResult = {
  revoked: boolean;
  attempts: number;
};

type VerificationOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

function isRevocationError(error: unknown) {
  const code = String((error as { code?: string })?.code || '').trim().toLowerCase();
  return code === 'auth/session-cookie-revoked' || code === 'auth/id-token-revoked';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForSessionRevocation(
  verify: () => Promise<unknown>,
  options: VerificationOptions = {}
): Promise<SessionRevocationVerificationResult> {
  const maxAttempts = Math.max(1, Math.min(10, Math.floor(options.maxAttempts ?? 6)));
  const delayMs = Math.max(0, Math.min(2_000, Math.floor(options.delayMs ?? 250)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await verify();
    } catch (error) {
      if (isRevocationError(error)) return { revoked: true, attempts: attempt };
      throw error;
    }

    if (attempt < maxAttempts && delayMs > 0) {
      await sleep(Math.min(delayMs * attempt, 1_000));
    }
  }

  return { revoked: false, attempts: maxAttempts };
}
