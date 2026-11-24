import Link from 'next/link';
import type { Metadata } from 'next';
import ContactForm from './ContactForm';
import './contact.css';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions about Finbuks? Write to us.',
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
        <p className="pr-note">Questions about how Finbuks works, your account or your data? Write to us and we will reply by email.</p>
        <ContactForm />
        <p className="pr-note contact-side">
          Or email <a href="mailto:hello@finbuks.com">hello@finbuks.com</a>. See also <Link href="/faq">FAQ</Link> and <Link href="/how-it-works">How it works</Link>.
        </p>
      </section>
    </main>
  );
}
