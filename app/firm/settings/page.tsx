'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Firm = { firm_id: string; name: string; role: string };
type FirmBillingTier = 'STANDARD' | 'WHITE_LABEL';
type FirmBilling = {
  tier: FirmBillingTier;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  billing_email: string;
  price_per_client_cents: number;
  currency: string;
} | null;
type FirmUsage = { active_client_count: number; active_member_count: number };
type FirmBranding = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
} | null;

function centsToDisplay(cents: number, currency: string) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency });
}

export default function FirmSettingsPage() {
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [authError, setAuthError] = useState(false);

  const [billing, setBilling] = useState<FirmBilling>(null);
  const [usage, setUsage] = useState<FirmUsage>({ active_client_count: 0, active_member_count: 0 });
  const [estimateCents, setEstimateCents] = useState(0);
  const [billingNote, setBillingNote] = useState('');
  const [loadingBilling, setLoadingBilling] = useState(false);

  const [branding, setBrandingState] = useState<FirmBranding>(null);
  const [loadingBranding, setLoadingBranding] = useState(false);

  const [billingEmailInput, setBillingEmailInput] = useState('');
  const [savingTier, setSavingTier] = useState(false);
  const [tierMessage, setTierMessage] = useState('');

  const [nameInput, setNameInput] = useState('');
  const [logoInput, setLogoInput] = useState('');
  const [primaryInput, setPrimaryInput] = useState('#d6ad57');
  const [accentInput, setAccentInput] = useState('#d6ad57');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState('');

  useEffect(() => {
    fetch('/api/my-firms')
      .then(r => r.json().then(body => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { setAuthError(true); return; }
        setFirms(body.firms || []);
        if ((body.firms || []).length === 1) setSelectedFirmId(body.firms[0].firm_id);
      })
      .catch(() => setAuthError(true));
  }, []);

  function loadBilling(firmId: string) {
    setLoadingBilling(true);
    fetch('/api/firm-billing?firm_id=' + encodeURIComponent(firmId))
      .then(r => r.json())
      .then(body => {
        setBilling(body.billing || null);
        setUsage(body.usage || { active_client_count: 0, active_member_count: 0 });
        setEstimateCents(body.estimated_monthly_charge_cents || 0);
        setBillingNote(body.note || '');
        setBillingEmailInput(body.billing?.billing_email || '');
      })
      .finally(() => setLoadingBilling(false));
  }

  function loadBranding(firmId: string) {
    setLoadingBranding(true);
    fetch('/api/firm-branding?firm_id=' + encodeURIComponent(firmId) + '&raw=1')
      .then(r => r.json())
      .then(body => {
        const b = body.branding || null;
        setBrandingState(b);
        setNameInput(b?.display_name || '');
        setLogoInput(b?.logo_url || '');
        setPrimaryInput(b?.primary_color || '#d6ad57');
        setAccentInput(b?.accent_color || '#d6ad57');
      })
      .finally(() => setLoadingBranding(false));
  }

  useEffect(() => {
    if (!selectedFirmId) return;
    loadBilling(selectedFirmId);
    loadBranding(selectedFirmId);
  }, [selectedFirmId]);

  const selectedFirm = useMemo(() => firms?.find(f => f.firm_id === selectedFirmId) || null, [firms, selectedFirmId]);
  const isPartner = selectedFirm?.role === 'PARTNER';
  const isManagerOrAbove = selectedFirm?.role === 'PARTNER' || selectedFirm?.role === 'MANAGER';
  const isWhiteLabel = billing?.tier === 'WHITE_LABEL' && billing?.status === 'ACTIVE';

  async function changeTier(tier: FirmBillingTier) {
    if (!selectedFirmId) return;
    setTierMessage('');
    const email = billingEmailInput.trim();
    if (!email) { setTierMessage('A billing email is required.'); return; }
    setSavingTier(true);
    try {
      const res = await fetch('/api/firm-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firm_id: selectedFirmId, tier, billing_email: email })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not update billing tier.');
      setTierMessage(tier === 'WHITE_LABEL' ? 'Upgraded to White Label.' : 'Switched to Standard.');
      loadBilling(selectedFirmId);
    } catch (e) {
      setTierMessage((e as Error).message);
    } finally {
      setSavingTier(false);
    }
  }

  async function saveBranding() {
    if (!selectedFirmId) return;
    setBrandingMessage('');
    setSavingBranding(true);
    try {
      const res = await fetch('/api/firm-branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm_id: selectedFirmId,
          display_name: nameInput,
          logo_url: logoInput,
          primary_color: primaryInput,
          accent_color: accentInput
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save branding.');
      setBrandingMessage('Branding saved.');
      loadBranding(selectedFirmId);
    } catch (e) {
      setBrandingMessage((e as Error).message);
    } finally {
      setSavingBranding(false);
    }
  }

  if (authError) {
    return (
      <main className="fp-shell">
        <div className="fp-empty">
          <h1>Sign in to view Firm Workspace settings</h1>
          <Link href="/" className="fp-link">← Back to FinClose</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="fp-shell">
      <header className="fp-nav">
        <Link href="/" className="fp-brand" aria-label="FinClose home">
          <span className="fp-logo">F</span>
          <span>FinClose <em>Firm Workspace</em></span>
        </Link>
        <nav className="fp-settings-nav">
          <Link href="/firm/portfolio" className="fp-link">Portfolio</Link>
          {firms && firms.length > 1 && (
            <select className="fp-firm-select" value={selectedFirmId} onChange={e => setSelectedFirmId(e.target.value)} aria-label="Select firm">
              {firms.map(f => <option key={f.firm_id} value={f.firm_id}>{f.name}</option>)}
            </select>
          )}
        </nav>
      </header>

      {(!firms || firms.length === 0) && (
        <div className="fp-empty">
          <h1>No firm yet</h1>
          <p>You're not an active member of any accounting firm.</p>
          <Link href="/" className="fp-link">← Back to FinClose</Link>
        </div>
      )}

      {selectedFirm && (
        <section className="fp-body">
          <div className="fp-title-row">
            <h1>{selectedFirm.name} — Settings</h1>
            <span className="fp-role-pill">{selectedFirm.role}</span>
          </div>

          <div className="fp-settings-grid">
            <div className="fp-settings-card">
              <h2>Billing</h2>
              {billingNote && <p className="fp-note">{billingNote}</p>}
              {loadingBilling && <p className="fp-loading">Loading…</p>}
              {!loadingBilling && (
                <>
                  <div className="fp-settings-row">
                    <span>Current plan</span>
                    <strong>{billing?.tier === 'WHITE_LABEL' ? 'White Label' : 'Standard'}{billing && billing.status !== 'ACTIVE' ? ` (${billing.status})` : ''}</strong>
                  </div>
                  <div className="fp-settings-row">
                    <span>Active client companies</span>
                    <strong>{usage.active_client_count}</strong>
                  </div>
                  <div className="fp-settings-row">
                    <span>Active firm members</span>
                    <strong>{usage.active_member_count}</strong>
                  </div>
                  <div className="fp-settings-row">
                    <span>Estimated monthly charge</span>
                    <strong>{centsToDisplay(estimateCents, billing?.currency || 'USD')}</strong>
                  </div>

                  {isPartner ? (
                    <>
                      <label className="fp-field">
                        <span>Billing email</span>
                        <input type="email" value={billingEmailInput} onChange={e => setBillingEmailInput(e.target.value)} placeholder="billing@yourfirm.com" />
                      </label>
                      <div className="fp-settings-actions">
                        <button className="fp-btn" disabled={savingTier || billing?.tier === 'STANDARD' || !billing} onClick={() => changeTier('STANDARD')}>Switch to Standard</button>
                        <button className="fp-btn fp-btn-primary" disabled={savingTier || (billing?.tier === 'WHITE_LABEL' && billing?.status === 'ACTIVE')} onClick={() => changeTier('WHITE_LABEL')}>
                          {savingTier ? 'Saving…' : 'Upgrade to White Label'}
                        </button>
                      </div>
                      {tierMessage && <p className="fp-settings-message">{tierMessage}</p>}
                      <p className="fp-settings-hint">White Label is {centsToDisplay(1900, 'USD')} per active client company / month. This provisions the tier; it is not yet connected to a live payment processor in this pilot.</p>
                    </>
                  ) : (
                    <p className="fp-settings-hint">Only a firm partner can change the billing tier.</p>
                  )}
                </>
              )}
            </div>

            <div className="fp-settings-card">
              <h2>Branding</h2>
              {!isWhiteLabel && <p className="fp-settings-hint">Branding is a White Label feature. Upgrade the billing tier above to customize it.</p>}
              {loadingBranding && <p className="fp-loading">Loading…</p>}
              {!loadingBranding && isManagerOrAbove && isWhiteLabel && (
                <>
                  <label className="fp-field">
                    <span>Display name</span>
                    <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Your Firm's Workspace" maxLength={60} />
                  </label>
                  <label className="fp-field">
                    <span>Logo URL (https)</span>
                    <input type="url" value={logoInput} onChange={e => setLogoInput(e.target.value)} placeholder="https://yourfirm.com/logo.svg" />
                  </label>
                  <label className="fp-field">
                    <span>Primary color</span>
                    <input type="color" value={primaryInput} onChange={e => setPrimaryInput(e.target.value)} />
                  </label>
                  <label className="fp-field">
                    <span>Accent color</span>
                    <input type="color" value={accentInput} onChange={e => setAccentInput(e.target.value)} />
                  </label>
                  <div className="fp-settings-actions">
                    <button className="fp-btn fp-btn-primary" disabled={savingBranding} onClick={saveBranding}>{savingBranding ? 'Saving…' : 'Save branding'}</button>
                  </div>
                  {brandingMessage && <p className="fp-settings-message">{brandingMessage}</p>}
                </>
              )}
              {!loadingBranding && !isManagerOrAbove && isWhiteLabel && (
                <p className="fp-settings-hint">Only a firm manager or partner can edit branding.</p>
              )}
              {!loadingBranding && branding && !isWhiteLabel && (
                <p className="fp-settings-hint">Saved branding for "{branding.display_name}" is kept but not applied while off White Label.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
