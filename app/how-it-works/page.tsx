import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Five steps from sign-up to accountant sign-off.',
  alternates: { canonical: '/how-it-works' }
};

const steps = [
  ['Choose a service', 'Book close, or ongoing bookkeeping.'],
  ['Add your company', 'Pick a company already in FinClose, or set it up once with the form for your country.'],
  ['Upload prior records', 'Ledger, trial balance, bank statements, open items. This shows FinClose your starting position.'],
  ['Connect your current system', 'Secure file upload, or a read-only connection to your accounting system where available.'],
  ['Review and sign off', 'FinClose prepares and flags what needs a decision. Your accountant reviews and signs off. FinClose posts nothing to your books.']
];

export default function HowItWorks() {
  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="FinClose home">
          <span className="pr-logo">F</span>
          <span>FinClose <em>How it works</em></span>
        </Link>
      </header>
      <section className="pr-body">
        <h1>How it works</h1>
        <ol className="pr-list">
          {steps.map(([title, text]) => <li key={title}><strong>{title}.</strong> {text}</li>)}
        </ol>
        <p className="pr-note">Questions? <Link href="/faq">Read the FAQ</Link>.</p>
      </section>
    </main>
  );
}
