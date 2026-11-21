import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Five steps from sign-up to finished books and an owner-readable financial summary.',
  alternates: { canonical: '/how-it-works' }
};

const steps = [
  ['Choose a service', 'Book close, or ongoing bookkeeping.'],
  ['Add your company', 'Pick a company already in Finbuks, or set it up once with the form for your country.'],
  ['Upload prior records', 'Ledger, trial balance, bank statements, open items. This shows Finbuks your starting position.'],
  ['Connect your current system', 'Secure file upload, or a read-only connection to your accounting system where available.'],
  ['Review, sign off, understand', 'Finbuks prepares and flags what needs a decision. Your accountant reviews and signs off. You receive the finished books plus an Owner Financial Summary explaining sales, costs, profit or loss, cash, amounts customers owe, bills, taxes and loans in plain language.']
];

export default function HowItWorks() {
  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="Finbuks home">
          <span className="pr-logo">F</span>
          <span>Finbuks <em>How it works</em></span>
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
