import Link from 'next/link';

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
