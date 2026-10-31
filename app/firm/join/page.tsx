'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import '../../partner.css';

// The page an invited colleague lands on. The token comes from the link the manager passed on.
export default function JoinPage() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'error'>('ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    // The token is removed from the address bar so it does not stay in history or get copied by accident.
    if (t) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function accept() {
    setState('working');
    try {
      const response = await fetch('/api/firm-invitations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The invitation could not be accepted.');
      setState('done');
    } catch (e) {
      setMessage((e as Error).message);
      setState('error');
    }
  }

  return (
    <main className="pt-shell" id="main">
      <h1>Join a firm</h1>
      {!token && state === 'ready' && <p className="pt-note">This page needs the invitation link your manager gave you.</p>}
      {token && state !== 'done' && (
        <>
          <p className="pt-lead">You have been invited to join an accounting firm on FinClose. Sign in with the email address the invitation was sent to, then accept.</p>
          <button className="pt-button" onClick={accept} disabled={state === 'working'}>{state === 'working' ? 'Working…' : 'Accept the invitation'}</button>
        </>
      )}
      {state === 'error' && <p className="pt-error" role="alert">{message}</p>}
      {state === 'done' && <p className="pt-ok" role="status">You have joined. <Link href="/firm/partner">Open the firm workspace</Link></p>}
    </main>
  );
}
