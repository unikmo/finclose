'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import '../../partner.css';

type Firm = { firm_id: string; name: string; role: string };
type Item = { key: string; client: string; kind: string; title: string; due_date: string; source: string; state: 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'; days_left: number };
type Calendar = {
  scope: string;
  clients: { company_id: string; client: string; pack_status: string; readiness_percent: number | null; high_open: number; medium_open: number; low_open: number }[];
  calendar: Item[];
  exception_queue: { client: string; code: string; severity: string; message: string; days_to_next_deadline: number | null }[];
  workload: { user_id: string; email: string; clients: number; open_items: number }[];
  notes: string[];
};
type Invitation = { invitation_id: string; email: string; role: string; status: string; expires_at: number };
type Usage = { month: string; plan: { plan_name: string; price_cents_per_client_month: number; currency: string }; billable_clients: { organization_id: string; name: string; reason: string }[]; total_cents: number; notes: string[] };

const STATE: Record<Item['state'], string> = { DONE: 'Done', OVERDUE: 'Overdue', DUE_SOON: 'Due soon', UPCOMING: 'Coming up' };
const KIND: Record<string, string> = { MONTH_CLOSE: 'Month close', VAT_RETURN: 'VAT return', CUSTOM: 'Other' };
const SOURCE: Record<string, string> = { FIRM_SETTING: 'from your close-day setting', RULE_UNVERIFIED: 'rule not yet checked with the tax authority', ENTERED_BY_FIRM: 'added by your firm' };
const ROLES = ['REVIEWER', 'ACCOUNTANT', 'PAYROLL_SPECIALIST', 'MANAGER', 'PARTNER'];
const money = (cents: number, cur = 'EUR') => `${(cents / 100).toFixed(2)} ${cur}`;
const humanise = (code: string) => code.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export default function PartnerPage() {
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [firmId, setFirmId] = useState('');
  const [tab, setTab] = useState<'calendar' | 'team' | 'plan' | 'brand'>('calendar');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cal, setCal] = useState<Calendar | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<{ user_id: string; email: string; role: string }[]>([]);
  const [newLink, setNewLink] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plan, setPlan] = useState({ plan_name: 'Standard', price_cents_per_client_month: '500', currency: 'EUR', max_clients: '', max_staff: '' });
  const [brand, setBrand] = useState({ display_name: '', accent_color: '#1f4e79', logo_url: '', support_email: '', footer: '' });
  const [closeDay, setCloseDay] = useState('10');
  const [deadline, setDeadline] = useState({ company_id: '', title: '', due_date: '' });
  const [invite, setInvite] = useState({ email: '', role: 'ACCOUNTANT' });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const role = firms?.find(f => f.firm_id === firmId)?.role || '';
  const lead = role === 'PARTNER' || role === 'MANAGER';

  async function call(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Something went wrong (code ${response.status}).`);
    return body;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const send = (url: string, method: string, payload: Record<string, unknown>) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firm_id: firmId, ...payload }) });

  useEffect(() => {
    fetch('/api/my-firms').then(r => r.json()).then(b => {
      if (b.error) { setError(b.error); setFirms([]); return; }
      setFirms(b.firms || []);
      if ((b.firms || []).length === 1) setFirmId(b.firms[0].firm_id);
    }).catch(() => { setError('Could not load your firms.'); setFirms([]); });
  }, []);

  const loadCalendar = useCallback(() => run(async () => setCal(await call(`/api/firm-calendar?firm_id=${encodeURIComponent(firmId)}`))), [firmId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadTeam = useCallback(() => run(async () => { const b = await call(`/api/firm-invitations?firm_id=${encodeURIComponent(firmId)}`); setInvites(b.invitations || []); setMembers(b.members || []); }), [firmId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadPlan = useCallback(() => run(async () => {
    const q = encodeURIComponent(firmId);
    const [p, s, b] = await Promise.all([call(`/api/firm-settings?firm_id=${q}&resource=plan`), call(`/api/firm-settings?firm_id=${q}&resource=settings`), call(`/api/firm-settings?firm_id=${q}&resource=branding`)]);
    if (p.plan) setPlan({ plan_name: p.plan.plan_name, price_cents_per_client_month: String(p.plan.price_cents_per_client_month), currency: p.plan.currency, max_clients: p.plan.max_clients ?? '', max_staff: p.plan.max_staff ?? '' });
    if (s.settings) setCloseDay(String(s.settings.close_due_day));
    if (b.branding) setBrand({ display_name: b.branding.display_name, accent_color: b.branding.accent_color, logo_url: b.branding.logo_url || '', support_email: b.branding.support_email || '', footer: b.branding.footer || '' });
    if (role === 'PARTNER') setUsage((await call(`/api/firm-settings?firm_id=${q}&resource=usage&month=${month}`)).statement);
  }), [firmId, month, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!firmId) return;
    if (tab === 'calendar') loadCalendar();
    else if (tab === 'team' && lead) loadTeam();
    else if (tab === 'plan' || tab === 'brand') loadPlan();
  }, [firmId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="pt-shell" id="main">
      <header className="pt-nav"><Link href="/firm/portfolio">← Client portfolio</Link></header>
      <h1>Firm workspace</h1>
      <p className="pt-lead">Deadlines, the open problems across your clients, your team, your plan and your branding.</p>
      {firms && firms.length > 1 && (
        <label className="pt-field">Firm<select value={firmId} onChange={e => setFirmId(e.target.value)}><option value="">Choose a firm</option>{firms.map(f => <option key={f.firm_id} value={f.firm_id}>{f.name} ({humanise(f.role)})</option>)}</select></label>
      )}
      {firms && firms.length === 0 && !error && <p className="pt-note">You are not a member of a firm yet. Ask your firm for an invitation link, or create a firm from the portfolio page.</p>}
      <div aria-live="polite" className="pt-status">{busy ? 'Working…' : ''}</div>
      {error && <p className="pt-error" role="alert">{error}</p>}
      {notice && <p className="pt-ok" role="status">{notice}</p>}

      {firmId && (
        <>
          <div className="pt-tabs" role="tablist" aria-label="Firm workspace sections">
            {([['calendar', 'Calendar and queue'], ['team', 'Team'], ['plan', 'Plan and usage'], ['brand', 'Branding']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'pt-tab pt-on' : 'pt-tab'} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === 'calendar' && cal && (
            <section aria-label="Calendar and queue">
              <p className="pt-note">{cal.scope === 'ALL_CLIENTS' ? 'Showing every client.' : 'Showing only the clients assigned to you.'}</p>
              <h2>Deadlines</h2>
              {cal.calendar.length === 0 ? <p className="pt-note">No deadlines yet. Clients appear here once they have accepted your invitation.</p> : (
                <table className="pt-table"><thead><tr><th>Due</th><th>Client</th><th>What</th><th>Status</th></tr></thead><tbody>
                  {cal.calendar.map(i => (
                    <tr key={i.key}>
                      <td>{i.due_date}</td><td>{i.client}</td>
                      <td>{KIND[i.kind]}: {i.title}<br /><span className="pt-hint">{SOURCE[i.source]}</span></td>
                      <td><span className={`pt-pill pt-${i.state.toLowerCase()}`}>{STATE[i.state]}</span> <span className="pt-hint">{i.state === 'DONE' ? '' : i.days_left < 0 ? `${-i.days_left} days late` : `${i.days_left} days left`}</span></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
              {lead && (
                <form className="pt-form" onSubmit={e => { e.preventDefault(); run(async () => { await send('/api/firm-calendar', 'POST', { action: 'add', ...deadline }); setDeadline({ company_id: '', title: '', due_date: '' }); setNotice('Deadline added.'); setCal(await call(`/api/firm-calendar?firm_id=${encodeURIComponent(firmId)}`)); }); }}>
                  <h3>Add a deadline</h3>
                  <label>Client<select value={deadline.company_id} onChange={e => setDeadline({ ...deadline, company_id: e.target.value })} required><option value="">Choose</option>{cal.clients.map(c => <option key={c.company_id} value={c.company_id}>{c.client}</option>)}</select></label>
                  <label>What<input value={deadline.title} onChange={e => setDeadline({ ...deadline, title: e.target.value })} required maxLength={120} /></label>
                  <label>Due date<input type="date" value={deadline.due_date} onChange={e => setDeadline({ ...deadline, due_date: e.target.value })} required /></label>
                  <button className="pt-button" disabled={busy}>Add</button>
                </form>
              )}

              <h2>Open problems across clients</h2>
              {cal.exception_queue.length === 0 ? <p className="pt-note">Nothing open.</p> : (
                <ul className="pt-list">{cal.exception_queue.slice(0, 40).map((q, n) => <li key={n}><span className={`pt-pill pt-${q.severity.toLowerCase()}`}>{humanise(q.severity)}</span> <strong>{q.client}</strong>: {q.message}{q.days_to_next_deadline !== null && <span className="pt-hint"> (next deadline in {q.days_to_next_deadline} days)</span>}</li>)}</ul>
              )}

              <h2>Clients</h2>
              <table className="pt-table"><thead><tr><th>Client</th><th>Latest pack</th><th>Ready</th><th>Open items</th></tr></thead><tbody>
                {cal.clients.map(c => <tr key={c.company_id}><td>{c.client}</td><td>{c.pack_status === 'NONE' ? 'No pack yet' : humanise(c.pack_status)}</td><td>{c.readiness_percent === null ? '—' : `${c.readiness_percent}%`}</td><td>{c.high_open + c.medium_open + c.low_open} ({c.high_open} serious)</td></tr>)}
              </tbody></table>

              {cal.workload.length > 0 && (<><h2>Workload</h2>
                <table className="pt-table"><thead><tr><th>Person</th><th>Clients</th><th>Open items</th></tr></thead><tbody>{cal.workload.map(w => <tr key={w.user_id}><td>{w.email || w.user_id}</td><td>{w.clients}</td><td>{w.open_items}</td></tr>)}</tbody></table></>)}
              <ul className="pt-hint">{cal.notes.map(n => <li key={n}>{n}</li>)}</ul>
            </section>
          )}

          {tab === 'team' && (!lead ? <p className="pt-note">Only managers and partners manage the team.</p> : (
            <section aria-label="Team">
              <h2>Members</h2>
              <ul className="pt-list">{members.map(m => <li key={m.user_id}>{m.email} <span className="pt-pill">{humanise(m.role)}</span></li>)}</ul>
              <h2>Invite someone</h2>
              <p className="pt-note">FinClose does not send email. You get a one-time link to pass on. The person must sign in with the same email address.</p>
              <form className="pt-form" onSubmit={e => { e.preventDefault(); run(async () => { const b = await send('/api/firm-invitations', 'POST', invite); setNewLink(`${window.location.origin}${b.accept_path}`); setInvite({ email: '', role: 'ACCOUNTANT' }); await loadTeam(); }); }}>
                <label>Email<input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} required /></label>
                <label>Role<select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{humanise(r)}</option>)}</select></label>
                <button className="pt-button" disabled={busy}>Create invitation link</button>
              </form>
              {newLink && <div className="pt-callout" role="status"><p><strong>Copy this link now. It is shown once.</strong></p><input readOnly value={newLink} aria-label="Invitation link" onFocus={e => e.target.select()} /></div>}
              <h2>Invitations</h2>
              {invites.length === 0 ? <p className="pt-note">None yet.</p> : (
                <ul className="pt-list">{invites.map(i => <li key={i.invitation_id}>{i.email} as {humanise(i.role)}: {humanise(i.status)}{i.status === 'PENDING' && <> <button className="pt-link" onClick={() => run(async () => { await send('/api/firm-invitations', 'DELETE', { invitation_id: i.invitation_id }); await loadTeam(); })}>Withdraw</button></>}</li>)}</ul>
              )}
            </section>
          ))}

          {tab === 'plan' && (
            <section aria-label="Plan and usage">
              {role !== 'PARTNER' ? <p className="pt-note">Only partners change the plan or see usage.</p> : (
                <>
                  <h2>Plan</h2>
                  <form className="pt-form" onSubmit={e => { e.preventDefault(); run(async () => { await send('/api/firm-settings', 'PUT', { resource: 'plan', ...plan, price_cents_per_client_month: Number(plan.price_cents_per_client_month) }); await send('/api/firm-settings', 'PUT', { resource: 'settings', close_due_day: Number(closeDay) }); setNotice('Saved.'); await loadPlan(); }); }}>
                    <label>Plan name<input value={plan.plan_name} onChange={e => setPlan({ ...plan, plan_name: e.target.value })} /></label>
                    <label>Price per client per month, in cents<input inputMode="numeric" value={plan.price_cents_per_client_month} onChange={e => setPlan({ ...plan, price_cents_per_client_month: e.target.value })} required /></label>
                    <label>Currency<input value={plan.currency} onChange={e => setPlan({ ...plan, currency: e.target.value })} maxLength={3} /></label>
                    <label>Most clients <span className="pt-hint">(empty for no limit)</span><input inputMode="numeric" value={plan.max_clients} onChange={e => setPlan({ ...plan, max_clients: e.target.value })} /></label>
                    <label>Most staff <span className="pt-hint">(empty for no limit)</span><input inputMode="numeric" value={plan.max_staff} onChange={e => setPlan({ ...plan, max_staff: e.target.value })} /></label>
                    <label>Month-close due day <span className="pt-hint">(day of the following month, 1 to 28)</span><input inputMode="numeric" value={closeDay} onChange={e => setCloseDay(e.target.value)} required /></label>
                    <button className="pt-button" disabled={busy}>Save</button>
                  </form>
                  <h2>Usage</h2>
                  <label className="pt-field">Month<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
                  <button className="pt-button pt-secondary" onClick={() => loadPlan()} disabled={busy}>Show</button>{' '}
                  <a className="pt-button pt-secondary pt-linkbutton" href={`/api/firm-settings?firm_id=${encodeURIComponent(firmId)}&resource=usage&month=${month}&format=csv`}>Download as a spreadsheet</a>
                  {usage && (<>
                    <p><strong>{usage.billable_clients.length}</strong> clients in {usage.month} at {money(usage.plan.price_cents_per_client_month, usage.plan.currency)} = <strong>{money(usage.total_cents, usage.plan.currency)}</strong></p>
                    <ul className="pt-list">{usage.billable_clients.map(c => <li key={c.organization_id}>{c.name} <span className="pt-hint">({c.reason})</span></li>)}</ul>
                    <ul className="pt-hint">{usage.notes.map(n => <li key={n}>{n}</li>)}</ul>
                  </>)}
                </>
              )}
            </section>
          )}

          {tab === 'brand' && (
            <section aria-label="Branding">
              <p className="pt-note">Your clients see your name and colour on their packs. Nothing else about your firm is shown to them.</p>
              {role !== 'PARTNER' ? <p className="pt-note">Only partners change the branding.</p> : (
                <form className="pt-form" onSubmit={e => { e.preventDefault(); run(async () => { await send('/api/firm-settings', 'PUT', { resource: 'branding', ...brand }); setNotice('Saved.'); }); }}>
                  <label>Name shown to clients<input value={brand.display_name} onChange={e => setBrand({ ...brand, display_name: e.target.value })} required maxLength={80} /></label>
                  <label>Colour<input type="color" value={brand.accent_color} onChange={e => setBrand({ ...brand, accent_color: e.target.value })} /></label>
                  <label>Logo address <span className="pt-hint">(https only, optional)</span><input type="url" value={brand.logo_url} onChange={e => setBrand({ ...brand, logo_url: e.target.value })} /></label>
                  <label>Support email <span className="pt-hint">(optional)</span><input type="email" value={brand.support_email} onChange={e => setBrand({ ...brand, support_email: e.target.value })} /></label>
                  <label>Footer line on exports <span className="pt-hint">(optional)</span><input value={brand.footer} onChange={e => setBrand({ ...brand, footer: e.target.value })} maxLength={200} /></label>
                  <p className="pt-preview" style={{ borderLeft: `6px solid ${brand.accent_color}` }}>Prepared for you by <strong>{brand.display_name || 'Your firm'}</strong></p>
                  <button className="pt-button" disabled={busy}>Save</button>
                </form>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
