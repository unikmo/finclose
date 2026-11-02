import Link from 'next/link';
import type { Metadata } from 'next';
import PayrollOnboarding from './PayrollOnboarding';
import ServiceOnboarding from './ServiceOnboarding';

const SERVICES = new Set(['balance-books', 'payroll', 'do-bookkeeping', 'bookkeeping-payroll']);

const SERVICE_METADATA: Record<string, { title: string; description: string }> = {
  'balance-books': {
    title: 'Monthly & Year-End Book Close',
    description: 'FinClose prepares the close. Your accountant signs off.'
  },
  payroll: {
    title: 'Payroll Preparation & Processing',
    description: 'FinClose prepares every pay run. Your approver signs off.'
  },
  'do-bookkeeping': {
    title: 'Ongoing Bookkeeping Without Payroll',
    description: 'FinClose keeps your books current between closes.'
  },
  'bookkeeping-payroll': {
    title: 'Bookkeeping & Payroll Together',
    description: 'FinClose runs bookkeeping and payroll together.'
  }
};

export function generateMetadata({ params }: { params: { service: string } }): Metadata {
  const entry = SERVICE_METADATA[params.service];
  if (!entry) {
    return { title: 'Service not found', robots: { index: false, follow: false } };
  }
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/start/${params.service}` },
    openGraph: { title: entry.title, description: entry.description, url: `/start/${params.service}` }
  };
}

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

  if (params.service === 'payroll') return <PayrollOnboarding />;
  return <ServiceOnboarding serviceKey={params.service} />;
}
