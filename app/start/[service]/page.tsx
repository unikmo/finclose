import Link from 'next/link';
import type { Metadata } from 'next';
import PayrollOnboarding from './PayrollOnboarding';
import ServiceOnboarding from './ServiceOnboarding';

const SERVICES = new Set(['balance-books', 'payroll', 'do-bookkeeping', 'bookkeeping-payroll']);

const SERVICE_METADATA: Record<string, { title: string; description: string }> = {
  'balance-books': {
    title: 'Monthly & Year-End Book Close',
    description: 'FinClose collects, classifies, and reconciles every account, then flags what needs a decision. Your accountant reviews, judges, and signs off before the close is released.'
  },
  payroll: {
    title: 'Payroll Preparation & Processing',
    description: 'FinClose calculates pay, tax, and deductions across every jurisdiction you operate in, prepares payslips and the journal, and flags exceptions for your approver to review.'
  },
  'do-bookkeeping': {
    title: 'Ongoing Bookkeeping Without Payroll',
    description: 'FinClose handles day-to-day bookkeeping — collecting, classifying, and reconciling transactions — so your books stay current between closes.'
  },
  'bookkeeping-payroll': {
    title: 'Bookkeeping & Payroll Together',
    description: 'FinClose runs bookkeeping and payroll side by side, so your close and your pay runs stay reconciled with each other, not just correct on their own.'
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
