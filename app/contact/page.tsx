import Link from 'next/link';
import type { Metadata } from 'next';
import ContactForm from './ContactForm';
import './contact.css';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the Finbuks team.',
  alternates: { canonical: '/contact' }
};

export default function Contact() {
  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="Finbuks home">
          <span className="pr-logo">F</span>
          <span>Finbuks <em>Contact</em></span>
        </Link>
      </header>
      <section className="pr-body">
        <h1>Contact</h1>
        <p className="pr-note">Ask a question about Finbuks. We reply by email.</p>
        <ContactForm />
        <p className="pr-note">Prefer email? Write to <a href="mailto:hello@finbuks.com">hello@finbuks.com</a>.</p>
        <p className="pr-note"><Link href="/faq">FAQ</Link> · <Link href="/how-it-works">How it works</Link></p>
      </section>
    </main>
  );
}
