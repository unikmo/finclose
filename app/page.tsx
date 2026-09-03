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
    title: 'I need bookkeeping',
    description: 'Start a bookkeeping setup for a new or existing company.',
    href: '/lab?service=need-bookkeeping',
    tag: 'Bookkeeping setup'
  }
];

export default function Home() {
  return (
    <main className="home-shell">
      <header className="home-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span>FinClose</span>
        </Link>
        <Link href="/lab" className="home-lab-link">Open FinClose</Link>
      </header>

      <section className="help-hero">
        <div className="help-intro">
          <span className="help-kicker">FINANCIAL OPERATIONS</span>
          <h1>How Can We Help?</h1>
          <p>Choose what you need help with. FinClose will take you straight to the right workflow.</p>
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
        <span>Bookkeeping</span>
        <span>Payroll</span>
        <span>Monthly close</span>
        <span>Year-end close</span>
      </footer>
    </main>
  );
}
