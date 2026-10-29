'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

type Entry = { transaction_id: string; date: string; amount_cents: number; currency: string; counterparty: string; description: string; category_code: string; category_name: string; vat_treatment: string; vat_rate: number | null; status: string; document_ids: string[] };
type Exception = { code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; transaction_id: string | null; message: string; suggested_action: string };
type PackView = {
  error?: string;
  record: { pack_id: string; company_id: string; status: string; version: number; revision: number; expires_at: number; signoff?: { by: string; at: number; note: string } };
  pack: {
    pack_hash: string;
    status: string;
    summary: { readiness_percent: number; accountant_ready: boolean; transaction_count: number; needs_review_count: number; inflow_cents: number; outflow_cents: number; base_currency: string };
    entries: Entry[];
    exceptions: Exception[];
    owner_questions: { transaction_id: string; question: string }[];
  };
  vat_summary: { vat_registered: boolean; domestic_input_by_rate: { rate: number; gross_cents: number; net_cents: number; vat_cents: number; count: number }[]; domestic_input_unsupported: unknown[]; reverse_charge: { vat_cents: number; count: number }; notes: string[] };
  journal: { balanced: boolean; lines: unknown[]; account_totals: { account_code: string; account_name: string; debit_cents: number; credit_cents: number }[]; notice: string };
  portfolio_status: { status: string; reasons: string[] };
  options: { categories: { code: string; name: string }[]; vat_rates: number[]; signoff_enabled: boolean };
};
type PackMeta = { pack_id: string; status: string; version: number; period: { start: string; end: string }; readiness_percent: number; created_at: number };
type Doc = { document_id: string; filename: string; status: string };

const VAT_VALUES = ['NO_VAT', 'INPUT_VAT_DOMESTIC', 'REVERSE_CHARGE_FOREIGN_SERVICE', 'OUT_OF_SCOPE', 'NEEDS_INVOICE_REVIEW', 'NOT_VAT_REGISTERED'];

function money(cents: number, currency = '') {
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${whole}.${String(abs % 100).padStart(2, '0')}${currency ? ' ' + currency : ''}`;
}

export default function PacksPage() {
  const [companyId, setCompanyId] = useState('');
  const [list, setList] = useState<PackMeta[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [view, setView] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ company_name: '', jurisdiction: 'EE', vat_registered: false, period_start: '', period_end: '', date_order: 'DMY', csv_text: '', opening_balance: '', closing_balance: '' });

  const q = (extra = '') => `company_id=${encodeURIComponent(companyId)}${extra}`;

  async function call(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
    return body;
  }
  async function run<T>(work: () => Promise<T>) {
    setBusy(true);
    setError('');
    try {
      return await work();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const post = (url: string, payload: Record<string, unknown>, method = 'POST') => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, ...payload }) });

  const refresh = useCallback(() => run(async () => {
    const [packs, documents] = await Promise.all([call(`/api/review-packs?${q()}`), call(`/api/review-packs/documents?${q()}`)]);
    setList(packs.packs || []);
    setDocs(documents.documents || []);
  }), [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string) => run(async () => setView(await call(`/api/review-packs/${id}?${q()}`)));
  const create = (e: React.FormEvent) => { e.preventDefault(); return run(async () => { const body = await post('/api/review-packs', form); setView(await call(`/api/review-packs/${body.record.pack_id}?${q()}`)); await refresh(); }); };
  const act = (action: string, payload: Record<string, unknown>) => run(async () => setView(await post(`/api/review-packs/${view!.record.pack_id}`, { action, ...payload })));

  const upload = (file: File | undefined) => file && run(async () => {
    const data = new FormData();
    data.set('company_id', companyId);
    data.set('file', file);
    const response = await fetch('/api/review-packs/documents', { method: 'POST', body: data });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'upload failed');
    await refresh();
  });

  const exportData = () => { window.location.href = `/api/company-data?${q()}`; };
  const erase = () => run(async () => {
    const confirm = window.prompt(`This permanently erases every saved pack, document and learned rule for company "${companyId}". Type the company ID to confirm.`);
    if (confirm === null) return;
    await post('/api/company-data', { confirm }, 'DELETE');
    setView(null);
    await refresh();
  });

  const clean = docs.filter(d => d.status === 'CLEAN' || d.status === 'RECEIVED');
  const open_ = view?.record.status === 'OPEN';

  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="FinClose home"><span className="pr-logo">F</span><span>FinClose <em>Saved review packs</em></span></Link>
      </header>
      <section className="pr-body">
        <h1>Saved review packs</h1>
        <p className="pr-lead">Answer the open questions, attach receipts and correct categories. Nothing is posted anywhere. Packs are kept for 90 days.</p>

        <div className="pr-form">
          <label>Company ID <span className="pr-hint">(required for real data)</span><input value={companyId} onChange={e => setCompanyId(e.target.value)} /></label>
          <div className="pr-actions" style={{ margin: 0, alignSelf: 'end' }}>
            <button className="pr-button" type="button" onClick={() => refresh()} disabled={busy}>Load packs</button>
            <button className="pr-button pr-secondary" type="button" onClick={exportData}>Export company data</button>
            <button className="pr-button pr-secondary" type="button" onClick={erase}>Erase company data</button>
          </div>
        </div>

        {error && <p className="pr-error" role="alert">{error}</p>}

        <h2>New pack</h2>
        <form className="pr-form" onSubmit={create}>
          <label>Company name<input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} required /></label>
          <label>Country rules<select value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })}><option value="EE">Estonia (draft rules)</option><option value="GENERIC">Other</option></select></label>
          <label>Period start<input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} required /></label>
          <label>Period end<input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} required /></label>
          <label>Opening balance <span className="pr-hint">(optional, with closing)</span><input value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} /></label>
          <label>Closing balance<input value={form.closing_balance} onChange={e => setForm({ ...form, closing_balance: e.target.value })} /></label>
          <label className="pr-check"><input type="checkbox" checked={form.vat_registered} onChange={e => setForm({ ...form, vat_registered: e.target.checked })} />The company is VAT-registered</label>
          <label className="pr-wide">Bank statement (CSV)<input type="file" accept=".csv,text/csv,text/plain" onChange={async e => { const f = e.target.files?.[0]; if (f) { const text = await f.text(); setForm(prev => ({ ...prev, csv_text: text })); } }} /></label>
          <button className="pr-button" type="submit" disabled={busy || !form.csv_text}>{busy ? 'Working…' : 'Create and save pack'}</button>
        </form>

        {list.length > 0 && (
          <>
            <h2>Saved packs</h2>
            <table className="pr-table"><thead><tr><th>Period</th><th>Version</th><th>Status</th><th>Readiness</th><th /></tr></thead><tbody>
              {list.map(p => <tr key={p.pack_id}><td>{p.period.start} to {p.period.end}</td><td>{p.version}</td><td>{p.status}</td><td>{p.readiness_percent}%</td><td><button className="pr-button pr-secondary" onClick={() => open(p.pack_id)}>Open</button></td></tr>)}
            </tbody></table>
          </>
        )}

        <h2>Receipts and invoices</h2>
        <label className="pr-hint">PDF, PNG or JPG up to 25 MB. In real-data mode a file is held in quarantine until a different person clears it.<br /><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => upload(e.target.files?.[0])} /></label>
        {docs.length > 0 && <ul className="pr-list">{docs.map(d => <li key={d.document_id}><code>{d.document_id}</code> {d.filename} <span className="pr-pill pr-low">{d.status}</span></li>)}</ul>}

        {view && (
          <section className="pr-result" aria-live="polite">
            <h2>Version {view.record.version}: {view.record.status}{view.record.signoff ? ` (signed off by ${view.record.signoff.by})` : ''}</h2>
            <div className="pr-summary">
              <div className={`pr-tile ${view.pack.summary.accountant_ready ? 'pr-ok' : 'pr-warn'}`}><strong>{view.pack.summary.readiness_percent}%</strong><span>{view.pack.summary.accountant_ready ? 'Ready for accountant' : 'Not ready yet'}</span></div>
              <div className="pr-tile"><strong>{view.pack.summary.transaction_count}</strong><span>Transactions</span></div>
              <div className="pr-tile"><strong>{view.pack.summary.needs_review_count}</strong><span>Need review</span></div>
              <div className="pr-tile"><strong>{view.pack.owner_questions.length}</strong><span>Owner questions</span></div>
              <div className="pr-tile"><strong>{view.portfolio_status.status}</strong><span>Portfolio status</span></div>
            </div>

            <h2>Questions for the owner</h2>
            {view.pack.owner_questions.length === 0 && <p className="pr-note">None open.</p>}
            {view.pack.owner_questions.map(item => {
              const entry = view.pack.entries.find(e => e.transaction_id === item.transaction_id);
              return <QuestionRow key={item.transaction_id + item.question} item={item} entry={entry} docs={clean} disabled={!open_ || busy} onAnswer={payload => act('answer', { transaction_id: item.transaction_id, ...payload })} />;
            })}

            <h2>Correct a category</h2>
            <table className="pr-table"><thead><tr><th>Date</th><th>Counterparty</th><th>Amount</th><th>Category and VAT</th></tr></thead><tbody>
              {view.pack.entries.map(e => <CorrectionRow key={e.transaction_id} entry={e} options={view.options} disabled={!open_ || busy} onCorrect={payload => act('correct', { transaction_id: e.transaction_id, ...payload })} />)}
            </tbody></table>

            <h2>VAT estimate <span className="pr-hint">(not a VAT return)</span></h2>
            {!view.vat_summary.vat_registered ? <p className="pr-note">Company is not VAT-registered, so no VAT is estimated.</p> : (
              <ul className="pr-list">
                {view.vat_summary.domestic_input_by_rate.map(r => <li key={r.rate}>Domestic input VAT at {r.rate}%: {money(r.vat_cents)} on {money(r.gross_cents)} gross ({r.count} with invoice)</li>)}
                <li>{view.vat_summary.domestic_input_unsupported.length} domestic purchases without an invoice or rate are not counted</li>
                <li>Reverse-charge purchases: {view.vat_summary.reverse_charge.count}, VAT {money(view.vat_summary.reverse_charge.vat_cents)}</li>
                {view.vat_summary.notes.map(n => <li key={n}>{n}</li>)}
              </ul>
            )}

            <h2>Proposed journal <span className="pr-hint">({view.journal.balanced ? 'balanced' : 'NOT balanced'})</span></h2>
            <p className="pr-note">{view.journal.notice}</p>
            <table className="pr-table"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
              {view.journal.account_totals.map(t => <tr key={t.account_code}><td>{t.account_code} {t.account_name}</td><td>{t.debit_cents ? money(t.debit_cents) : ''}</td><td>{t.credit_cents ? money(t.credit_cents) : ''}</td></tr>)}
            </tbody></table>
            <div className="pr-actions"><a className="pr-button pr-secondary" style={{ display: 'inline-grid', placeItems: 'center' }} href={`/api/review-packs/${view.record.pack_id}?${q('&format=journal_csv')}`}>Download journal CSV</a></div>

            {view.options.signoff_enabled && open_ && <SignOff pack={view} disabled={busy} onSign={payload => act('sign_off', payload)} />}
          </section>
        )}
      </section>
    </main>
  );
}

function QuestionRow({ item, entry, docs, disabled, onAnswer }: { item: { question: string }; entry?: Entry; docs: Doc[]; disabled: boolean; onAnswer: (p: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('');
  const [doc, setDoc] = useState('');
  return (
    <div className="pr-callout" style={{ margin: '8px 0' }}>
      <p><strong>{entry ? `${entry.date} ${entry.counterparty || entry.description} ${money(entry.amount_cents, entry.currency)}` : ''}</strong></p>
      <p>{item.question}</p>
      <div className="pr-actions" style={{ margin: '6px 0 0' }}>
        <input aria-label="Note" placeholder="Your answer" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1, minHeight: 34 }} />
        <select aria-label="Receipt" value={doc} onChange={e => setDoc(e.target.value)}><option value="">No receipt</option>{docs.map(d => <option key={d.document_id} value={d.document_id}>{d.filename}</option>)}</select>
        <button className="pr-button" disabled={disabled || (!note && !doc)} onClick={() => onAnswer({ note, document_ids: doc ? [doc] : [] })}>Send answer</button>
        <button className="pr-button pr-secondary" disabled={disabled} onClick={() => onAnswer({ confirm_duplicate: true })}>This is not a duplicate</button>
      </div>
    </div>
  );
}

function CorrectionRow({ entry, options, disabled, onCorrect }: { entry: Entry; options: PackView['options']; disabled: boolean; onCorrect: (p: Record<string, unknown>) => void }) {
  const [category, setCategory] = useState(entry.category_code);
  const [vat, setVat] = useState(entry.vat_treatment);
  const [rate, setRate] = useState('');
  const [remember, setRemember] = useState(false);
  const changed = category !== entry.category_code || vat !== entry.vat_treatment || rate !== '';
  return (
    <tr>
      <td>{entry.date}</td>
      <td>{entry.counterparty || entry.description}<em>{entry.status}{entry.document_ids.length ? `, ${entry.document_ids.length} document(s)` : ''}</em></td>
      <td>{money(entry.amount_cents, entry.currency)}</td>
      <td>
        <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>{options.categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>{' '}
        <select aria-label="VAT treatment" value={vat} onChange={e => setVat(e.target.value)}>{VAT_VALUES.map(v => <option key={v}>{v}</option>)}</select>{' '}
        {options.vat_rates.length > 0 && <select aria-label="VAT rate" value={rate} onChange={e => setRate(e.target.value)}><option value="">Rate: automatic</option>{options.vat_rates.map(r => <option key={r} value={r}>{r}%</option>)}</select>}{' '}
        <label className="pr-hint"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> remember for this company</label>{' '}
        <button className="pr-button pr-secondary" disabled={disabled || !changed} onClick={() => onCorrect({ category_code: category, vat_treatment: vat, vat_rate: rate === '' ? undefined : Number(rate), remember })}>Apply</button>
      </td>
    </tr>
  );
}

function SignOff({ pack, disabled, onSign }: { pack: PackView; disabled: boolean; onSign: (p: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('');
  const ready = pack.pack.summary.accountant_ready;
  return (
    <div className="pr-callout" style={{ marginTop: 20 }}>
      <p><strong>Accountant sign-off</strong>: records who accepted this exact version (hash {pack.pack.pack_hash.slice(0, 12)}) and locks it. It posts nothing.</p>
      {!ready && <p>The pack is not accountant-ready. You can sign off with open items accepted, with a note.</p>}
      <div className="pr-actions" style={{ margin: '6px 0 0' }}>
        <input aria-label="Sign-off note" placeholder="Note" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1, minHeight: 34 }} />
        <button className="pr-button" disabled={disabled} onClick={() => onSign({ pack_hash: pack.pack.pack_hash, note, accept_open_items: !ready })}>Sign off this version</button>
      </div>
    </div>
  );
}
