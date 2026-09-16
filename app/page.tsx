import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FinClose — Bookkeeping, Payroll & Close Support',
  description: 'FinClose prepares the close and prepares payroll — every calculation, match, and reconciliation done for you. Your accountant reviews, judges, and approves before anything is released.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'FinClose — Bookkeeping, Payroll & Close Support',
    description: 'FinClose prepares the close and prepares payroll. Your accountant reviews, judges, and approves before anything is released.',
    url: '/'
  }
};

const products = [
  {
    number: '01',
    title: 'Closing your books',
    description: 'FinClose collects, classifies, and reconciles every account, then flags what needs a decision. Your accountant reviews, judges, and signs off — the close is never released without them.',
    href: '/start/balance-books',
    tag: 'Book close',
    steps: ['Collect & classify', 'Match & reconcile', 'Flag exceptions', 'Accountant reviews & signs off']
  },
  {
    number: '02',
    title: 'Payroll',
    description: 'FinClose calculates and prepares every pay run across the jurisdictions you operate in. Your accountant or approver reviews it before anything is paid.',
    href: '/start/payroll',
    tag: 'Payroll',
    steps: ['Calculate pay, tax & deductions', 'Prepare payslips & journal', 'Flag exceptions', 'Approver reviews & signs off']
  }
];

const secondaryPaths = [
  { title: 'Ongoing bookkeeping without payroll', href: '/start/do-bookkeeping' },
  { title: 'Bookkeeping & payroll together', href: '/start/bookkeeping-payroll' }
];

const pipeline = [
  { label: 'Collect', detail: 'Statements & records' },
  { label: 'Match', detail: 'Reconcile every line' },
  { label: 'Flag', detail: 'Surface exceptions' },
  { label: 'Sign off', detail: 'Your accountant approves' }
];

function BookCloseIcon() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">
      <rect x="6" y="4" width="20" height="24" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11h10M11 15.5h10M11 20h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20.5 21.5l2 2 4-4.5" stroke="var(--fc-brass)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PayrollIcon() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">
      <circle cx="12.5" cy="13" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19.5" cy="19" r="6.5" stroke="var(--fc-brass)" strokeWidth="1.6" />
      <path d="M10.7 13h3.6M12.5 11.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17.7 19h3.6" stroke="var(--fc-brass)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const pipelineIcons = [
  <svg key="collect" viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true"><path d="M8 12l8-6 8 6v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 018 25V12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M13 26.5V18h6v8.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>,
  <svg key="match" viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true"><path d="M8 11h11M8 11l3.5-3.5M8 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M24 21H13M24 21l-3.5-3.5M24 21l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  <svg key="flag" viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true"><path d="M10 5v22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M10 6.5h11.5L18 11l3.5 4.5H10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>,
  <svg key="signoff" viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeWidth="1.6" /><path d="M11.5 16.3l3 3 6-6.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
];

export default function Home() {
  return (
    <main className="home-shell">
      <header className="home-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span className="home-brand-copy">
            <strong>FinClose</strong>
            <small>Bookkeeping · Payroll · Close</small>
          </span>
        </Link>
      </header>

      <section className="help-hero">
        <div className="help-intro">
          <h1>
            FinClose Does The
            <span>Work.</span>
          </h1>
          <p>FinClose prepares the close and prepares payroll — every calculation, match, and reconciliation done for you. Your accountant reviews, judges, and approves. Nothing is released without a sign-off.</p>
          <div className="help-trust-row" aria-label="FinClose capabilities">
            <span>Prepared by FinClose</span>
            <span>Reviewed by your accountant</span>
            <span>Monthly & year-end close</span>
            <span>Every pay run approved</span>
          </div>
        </div>

        <div className="help-grid help-grid-primary" aria-label="FinClose products">
          {products.map((product) => (
            <Link key={product.number} href={product.href} className="help-card help-card-primary">
              <div className="help-card-top">
                <span className="help-card-icon" aria-hidden="true">
                  {product.number === '01' ? <BookCloseIcon /> : <PayrollIcon />}
                </span>
                <span className="help-number">{product.number}</span>
                <span className="help-tag">{product.tag}</span>
              </div>
              <div className="help-card-copy">
                <h2>{product.title}</h2>
                <p>{product.description}</p>
                <ul className="help-card-steps" aria-label={`How ${product.title} works`}>
                  {product.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
              <span className="help-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        <div className="pipeline" aria-label="How FinClose works">
          {pipeline.map((step, i) => (
            <div className="pipeline-step" key={step.label}>
              <span className="pipeline-node">{pipelineIcons[i]}</span>
              <span className="pipeline-copy">
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
              {i < pipeline.length - 1 && <span className="pipeline-connector" aria-hidden="true" />}
            </div>
          ))}
        </div>

        <div className="help-secondary" aria-label="Other ways to start">
          <span className="help-secondary-label">Need something else?</span>
          {secondaryPaths.map((path) => (
            <Link key={path.href} href={path.href} className="help-secondary-link">
              {path.title} →
            </Link>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <span>Pay for the service you choose</span>
        <span>Least-privilege connector access</span>
        <span>No unnecessary setup</span>
      </footer>
    </main>
  );
}
