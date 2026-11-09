'use client';

import { useState } from 'react';

// Sends through Web3Forms, which emails hello@finbuks.com.
// The access key is public by design. Set NEXT_PUBLIC_WEB3FORMS_KEY in Vercel.
const ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_KEY || '';

export default function ContactForm() {
  const [status, setStatus] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    if (data.botcheck) return;
    if (!data.name?.trim() || !data.message?.trim() || !/^\S+@\S+\.\S+$/.test(data.email || '')) {
      setStatus({ text: 'Please fill in your name, a valid email and a message.', kind: 'err' });
      return;
    }
    if (!ACCESS_KEY) {
      setStatus({ text: 'The form is not switched on yet. Please email hello@finbuks.com.', kind: 'err' });
      return;
    }
    setBusy(true);
    setStatus({ text: 'Sending…', kind: '' });
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: 'Finbuks contact form: ' + data.topic,
          from_name: 'Finbuks website',
          name: data.name,
          email: data.email,
          topic: data.topic,
          message: data.message
        })
      });
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.message || 'failed');
      form.reset();
      setStatus({ text: 'Thank you. We got your message and will reply by email.', kind: 'ok' });
    } catch {
      setStatus({ text: 'Sorry, that did not send. Please email hello@finbuks.com.', kind: 'err' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      <label>Your name<input name="name" type="text" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
      <label>Topic
        <select name="topic" defaultValue="Question">
          <option>Question</option>
          <option>Pilot access</option>
          <option>Accountant or firm</option>
          <option>Other</option>
        </select>
      </label>
      <label>Message<textarea name="message" required maxLength={4000} /></label>
      <div className="contact-hp" aria-hidden="true">
        <label>Leave empty<input name="botcheck" type="text" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <button type="submit" disabled={busy}>Send message</button>
      <p className={'contact-status ' + status.kind} role="status" aria-live="polite">{status.text}</p>
    </form>
  );
}
