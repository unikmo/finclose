'use client';

import { FormEvent, useState } from 'react';

const topics = ['General question', 'How Finbuks works', 'Accountants and firms', 'My account', 'Privacy or data'];

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setStatus('sending');
    setError('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '');
      form.reset();
      setStatus('sent');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Your message could not be sent. Please try again or email hello@finbuks.com.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="contact-sent" role="status" aria-live="polite">
        <h2>Thank you. Your message is with us.</h2>
        <p className="pr-note">
          We will reply by email, usually within two working days. If you do not hear from us, check your spam folder or write to{' '}
          <a href="mailto:hello@finbuks.com">hello@finbuks.com</a>.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <label>Name
        <input name="name" required maxLength={100} autoComplete="name" />
      </label>
      <label>Email
        <input name="email" type="email" required maxLength={254} autoComplete="email" />
      </label>
      <label>Topic
        <select name="topic">
          {topics.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label>Message
        <textarea name="message" required minLength={2} maxLength={5000} rows={6} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="contact-hp" />
      <p className="pr-note">Please do not send bank details, passwords or full financial records here. We use your details only to answer your message.</p>
      {status === 'error' && <p role="alert" className="contact-error">{error}</p>}
      <button type="submit" className="pr-button" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
