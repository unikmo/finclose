import { InMemoryActivationStore, type ActivationStore } from './activation';
import { isRealDataMode } from './runtime-mode';

const globalForActivations = globalThis as unknown as { __finCloseActivations?: ActivationStore };

export async function activationStore(): Promise<ActivationStore> {
  if (isRealDataMode()) {
    const { FirestoreActivationStore } = await import('./activation');
    return new FirestoreActivationStore();
  }
  if (!globalForActivations.__finCloseActivations) globalForActivations.__finCloseActivations = new InMemoryActivationStore();
  return globalForActivations.__finCloseActivations;
}

// ISO day check shared by the ledger routes. A review window longer than about 14 months is refused:
// it would blow through the accounting systems' request limits.
export function reviewPeriod(fromInput: unknown, toInput: unknown): { from: string; to: string } {
  const day = (value: unknown, field: string) => {
    const text = String(value ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const probe = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!m || !probe || probe.getUTCMonth() !== Number(m[2]) - 1 || probe.getUTCDate() !== Number(m[3])) {
      const error = new Error(`${field} must be a real date like 2026-12-31`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    return text;
  };
  const from = day(fromInput, 'period_from'), to = day(toInput, 'period_to');
  const span = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000;
  if (span < 0 || span > 430) {
    const error = new Error('the review period must run forward and cover at most 14 months');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return { from, to };
}

export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
