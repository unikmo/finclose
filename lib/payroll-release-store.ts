import { InMemoryPayrollReleaseStore, RealtimePayrollReleaseStore, type PayrollReleaseStore } from './payroll-release';
import { isRealDataMode } from './runtime-mode';
import { PAYROLL_RULE_PACKS } from './payroll-engine';

const globalForRelease = globalThis as unknown as { __finClosePayrollRelease?: PayrollReleaseStore };

export async function payrollReleaseStore(): Promise<PayrollReleaseStore> {
  if (isRealDataMode()) {
    const { realtimeDatabase } = await import('./finclose-backend');
    return new RealtimePayrollReleaseStore(realtimeDatabase() as never);
  }
  if (!globalForRelease.__finClosePayrollRelease) globalForRelease.__finClosePayrollRelease = new InMemoryPayrollReleaseStore();
  return globalForRelease.__finClosePayrollRelease;
}

export const verifiedPayrollCountries = () =>
  Object.entries(PAYROLL_RULE_PACKS as Record<string, { status: string }>).filter(([, p]) => p.status === 'VERIFIED_BASIC_RULES').map(([c]) => c);

// Clients choose any verified country themselves. The per-customer release (lib/payroll-release.ts)
// is a switch the operator can turn on later by setting FINCLOSE_PAYROLL_RELEASE_REQUIRED=true; then
// only released customers and countries can start or run payroll. The synthetic lab is never gated.
export async function assertPayrollAllowed(organizationId: string | null | undefined, country: string) {
  if (!isRealDataMode() || String(process.env.FINCLOSE_PAYROLL_RELEASE_REQUIRED || '').toLowerCase() !== 'true') return;
  const { assertPayrollReleased } = await import('./payroll-release');
  await assertPayrollReleased(await payrollReleaseStore(), organizationId, country);
}
