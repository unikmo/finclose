import Link from 'next/link';

const choices = [
  {
    number: '01',
    title: 'Help me balance my books',
    description: 'Reconcile what you have and move toward a clean, usable set of books.',
    href: '/lab?service=balance-books',
    tag: 'Close & reconcile'
  },
  {
    number: '02',
    title: 'Help me do payroll',
    description: 'Start the payroll workflow for your company and country.',
    href: '/lab?service=payroll',
    tag: 'Payroll'
  },
  {
    number: '03',
    title: 'Do my bookkeeping',
    description: 'Bring in transactions and supporting files for the bookkeeping workflow.',
    href: '/lab?service=do-bookkeeping',
    tag: 'Ongoing bookkeeping'
  },
  {
    number: '04',
    title: 'Bookkeeping & Payroll',
    description: 'Run bookkeeping and payroll together in one FinClose workflow.',
    href: '/lab?service=bookkeeping-payroll',
    tag: 'Combined service'
  }
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
        <Link href="/lab" className="home-lab-link">Open test lab</Link>
      </header>

      <section className="help-hero">
        <div className="help-intro">
          <h1>
            How Can We
            <span>Help?</span>
          </h1>
          <p>Choose the help you need. FinClose takes you straight to the right workflow.</p>
          <div className="help-trust-row" aria-label="FinClose capabilities">
            <span>Bookkeeping</span>
            <span>Payroll</span>
            <span>Monthly close</span>
            <span>Year-end close</span>
          </div>
        </div>

        <div className="help-grid" aria-label="FinClose services">
          {choices.map((choice) => (
            <Link key={choice.number} href={choice.href} className="help-card">
              <div className="help-card-top">
                <span className="help-number">{choice.number}</span>
                <span className="help-tag">{choice.tag}</span>
              </div>
              <div className="help-card-copy">
                <h2>{choice.title}</h2>
                <p>{choice.description}</p>
              </div>
              <span className="help-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <span>Clear workflows</span>
        <span>Country-aware setup</span>
        <span>Persistent company data</span>
      </footer>
    </main>
  );
}
