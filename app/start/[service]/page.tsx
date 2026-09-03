import Link from 'next/link';
import ServiceOnboarding from './ServiceOnboarding';

const SERVICES = new Set(['balance-books', 'payroll', 'do-bookkeeping', 'bookkeeping-payroll']);

export default function ServiceStartPage({ params }: { params: { service: string } }) {
  if (!SERVICES.has(params.service)) {
    return (
      <main className="service-start-shell">
        <div className="service-start-error">
          <h1>Service not found</h1>
          <Link href="/">← Back to FinClose</Link>
        </div>
      </main>
    );
  }
  return <ServiceOnboarding serviceKey={params.service} />;
}
