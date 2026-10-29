'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { decodeStatementBytes } from '../../lib/statement-decode';
import AccountNumbers from './AccountNumbers';

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

// Plain words for the codes the engine uses. Anything not listed falls back to humanise().
const VAT_LABELS: Record<string, string> = {
  NO_VAT: 'No VAT (exempt)',
  INPUT_VAT_DOMESTIC: 'VAT on a local purchase',
  REVERSE_CHARGE_FOREIGN_SERVICE: 'Foreign service (you account for the VAT)',
  OUT_OF_SCOPE: 'Outside VAT (taxes, transfers)',
  NEEDS_INVOICE_REVIEW: 'Check the invoice',
  NOT_VAT_REGISTERED: 'Company is not VAT-registered'
};
const PACK_STATUS: Record<string, string> = { OPEN: 'Open', SUPERSEDED: 'Replaced by a newer version', SIGNED_OFF: 'Signed off' };
const OVERALL: Record<string, { label: string; tone: string }> = {
  RED: { label: 'Needs attention', tone: 'pr-bad' },
  YELLOW: { label: 'In progress', tone: 'pr-warn' },
  GREEN: { label: 'Signed off', tone: 'pr-ok' },
  NOT_STARTED: { label: 'Not started', tone: '' }
};
const SEVERITY: Record<string, string> = { HIGH: 'Important', MEDIUM: 'Check', LOW: 'For information' };
const DOC_STATUS: Record<string, string> = { RECEIVED: 'Received', CLEAN: 'Cleared', QUARANTINED: 'Waiting for a second person to clear it', REJECTED: 'Rejected' };

const humanise = (code: string) => { const t = code.toLowerCase().replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const vatLabel = (v: string) => VAT_LABELS[v] || humanise(v);
const VAT_VALUES = Object.keys(VAT_LABELS).filter(v => v !== 'NOT_VAT_REGISTERED'); // set by the engine, never picked by hand
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function money(cents: number, currency = '') {
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${whole}.${String(abs % 100).padStart(2, '0')}${currency ? ' ' + currency : ''}`;
}

export default function PacksPage() {
  const [companyId, setCompanyId] = useState('');
  const [list, setList] = useState<PackMeta[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyReview, setOnlyReview] = useState(true);
  const [confirmErase, setConfirmErase] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState({ company_name: '', jurisdiction: 'EE', vat_registered: false, period_start: '', period_end: '', date_order: 'DMY', csv_text: '', opening_balance: '', closing_balance: '' });

  const q = (extra = '') => `company_id=${encodeURIComponent(companyId)}${extra}`;

  async function call(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Something went wrong (code ${response.status}). Try again.`);
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
    setLoaded(true);
  }), [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string) => run(async () => setView(await call(`/api/review-packs/${id}?${q()}`)));
  const create = (e: React.FormEvent) => { e.preventDefault(); return run(async () => { const body = await post('/api/review-packs', form); setView(await call(`/api/review-packs/${body.record.pack_id}?${q()}`)); await refresh(); }); };
  const act = (action: string, payload: Record<string, unknown>) => run(async () => setView(await post(`/api/review-packs/${view!.record.pack_id}`, { action, ...payload })));

  const upload = (file: File | undefined) => file && run(async () => {
    const data = new FormData();
    data.set('company_id', companyId);
    data.set('file', file);
    const response = await fetch('/api/review-packs/documents', { method: 'POST', body: data });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The upload failed. Check the file type and size, then try again.');
    await refresh();
  });

  const exportData = () => { window.location.href = `/api/company-data?${q()}`; };
  const erase = () => run(async () => {
    await post('/api/company-data', { confirm: confirmErase }, 'DELETE');
    setConfirmErase(null);
    setView(null);
    await refresh();
  });

  const clean = docs.filter(d => d.status === 'CLEAN' || d.status === 'RECEIVED');
  const open_ = view?.record.status === 'OPEN';
  const needsLook = view ? view.pack.entries.filter(e => e.status === 'NEEDS_REVIEW') : [];
  const shownEntries = view ? (onlyReview && needsLook.length ? needsLook : view.pack.entries) : [];
  const overall = view ? OVERALL[view.portfolio_status.status] || { label: humanise(view.portfolio_status.status), tone: '' } : null;

  return (
    <main className="pr-shell" id="main">
      <a className="pr-skip" href="#content">Skip to the content</a>
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="FinClose home"><span className="pr-logo" aria-hidden="true">F</span><span>FinClose <em>Saved review packs</em></span></Link>
      </header>
      <section className="pr-body" id="content">
        <h1>Saved review packs</h1>
        <p className="pr-lead">A review pack is your bank statement, sorted and checked, ready for your accountant. Answer the open questions, attach receipts and fix any category that is wrong. Nothing is posted to your accounts. Packs are deleted automatically after a set time; the date is shown on each pack.</p>

        <div className="pr-form pr-oneperrow">
          <label htmlFor="company-id">Company ID <span className="pr-hint">(needed when using real data)</span></label>
          <input id="company-id" value={companyId} onChange={e => setCompanyId(e.target.value)} autoComplete="off" />
          <div className="pr-actions pr-wide pr-tight">
            <button className="pr-button" type="button" onClick={() => refresh()} disabled={busy || !companyId}>Load saved packs</button>
            <button className="pr-button pr-secondary" type="button" onClick={exportData} disabled={!companyId}>Download all company data</button>
            <button className="pr-button pr-secondary" type="button" onClick={() => setConfirmErase('')} disabled={!companyId}>Erase all company data</button>
          </div>
          {confirmErase !== null && (
            <div className="pr-callout pr-wide pr-danger" role="alertdialog" aria-labelledby="erase-h">
              <p id="erase-h"><strong>This permanently erases every saved pack, receipt and learned rule for this company.</strong> It cannot be undone. Download the data first if you may need it.</p>
              <label htmlFor="erase-confirm">Type the company ID to confirm</label>
              <input id="erase-confirm" value={confirmErase} onChange={e => setConfirmErase(e.target.value)} autoComplete="off" />
              <div className="pr-actions pr-tight">
                <button className="pr-button pr-dangerbtn" type="button" disabled={busy || confirmErase !== companyId} onClick={erase}>Erase everything</button>
                <button className="pr-button pr-secondary" type="button" onClick={() => setConfirmErase(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div aria-live="polite" className="pr-status">{busy ? 'Working…' : ''}</div>
        {error && <p className="pr-error" role="alert">{error}</p>}

        <h2>New pack</h2>
        <form className="pr-form" onSubmit={create}>
          <label>Company name<input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} required /></label>
          <label>Country rules<select value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })}><option value="EE">Estonia (draft rules, not yet checked by an accountant)</option><option value="GENERIC">Other country (no tax rates applied)</option></select></label>
          <label>First day of the period<input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} required /></label>
          <label>Last day of the period<input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} required /></label>
          <label>Balance at the start <span className="pr-hint">(optional, fill in both balances or neither)</span><input inputMode="decimal" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} /></label>
          <label>Balance at the end<input inputMode="decimal" value={form.closing_balance} onChange={e => setForm({ ...form, closing_balance: e.target.value })} /></label>
          <label className="pr-check"><input type="checkbox" checked={form.vat_registered} onChange={e => setForm({ ...form, vat_registered: e.target.checked })} />The company is registered for VAT</label>
          <label className="pr-wide">Bank statement (CSV file from your bank)
            <input type="file" accept=".csv,text/csv,text/plain" onChange={async e => { const f = e.target.files?.[0]; if (f) { const { text } = decodeStatementBytes(new Uint8Array(await f.arrayBuffer())); setForm(prev => ({ ...prev, csv_text: text })); setFileName(f.name); } }} />
            <span className="pr-hint">{fileName ? `Chosen: ${fileName}` : 'Choose the file you downloaded from internet banking. Excel files and PDFs cannot be read yet.'}</span>
          </label>
          <button className="pr-button" type="submit" disabled={busy || !form.csv_text}>{busy ? 'Working…' : 'Create and save pack'}</button>
        </form>

        <h2>Saved packs</h2>
        {!loaded && <p className="pr-note">Enter the company ID above and choose Load saved packs.</p>}
        {loaded && list.length === 0 && <p className="pr-note">No saved packs for this company yet. Create one above.</p>}
        {list.length > 0 && (
          <div className="pr-scroll">
            <table className="pr-table pr-stack">
              <caption className="pr-sr">Saved review packs</caption>
              <thead><tr><th scope="col">Period</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Ready</th><th scope="col"><span className="pr-sr">Open</span></th></tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.pack_id}>
                    <td data-label="Period">{p.period.start} to {p.period.end}</td>
                    <td data-label="Version">{p.version}</td>
                    <td data-label="Status">{PACK_STATUS[p.status] || humanise(p.status)}</td>
                    <td data-label="Ready">{p.readiness_percent}%</td>
                    <td><button className="pr-button pr-secondary" onClick={() => open(p.pack_id)} aria-label={`Open the pack for ${p.period.start} to ${p.period.end}, version ${p.version}`}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Receipts and invoices</h2>
        <label className="pr-hint" htmlFor="receipt-file">PDF, PNG or JPG, up to 25 MB. With real data, a file waits until a different person clears it.</label>
        <div className="pr-fileline"><input id="receipt-file" type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={!companyId || busy} onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} /></div>
        {loaded && docs.length === 0 && <p className="pr-note">No receipts uploaded yet.</p>}
        {docs.length > 0 && <ul className="pr-list">{docs.map(d => <li key={d.document_id}>{d.filename} <span className="pr-pill pr-low">{DOC_STATUS[d.status] || humanise(d.status)}</span></li>)}</ul>}

        {view && overall && (
          <section className="pr-result" aria-labelledby="result-h" aria-live="polite">
            <h2 id="result-h">Version {view.record.version}: {PACK_STATUS[view.record.status] || humanise(view.record.status)}{view.record.signoff ? ` (by ${view.record.signoff.by})` : ''}</h2>
            <p className="pr-note">Kept until {new Date(view.record.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, then deleted automatically{view.record.status === 'SIGNED_OFF' ? ' (a signed-off pack is kept longer)' : ''}.</p>
            <div className="pr-summary" role="list">
              <div role="listitem" className={`pr-tile ${view.pack.summary.accountant_ready ? 'pr-ok' : 'pr-warn'}`}><strong>{view.pack.summary.readiness_percent}%</strong><span>{view.pack.summary.accountant_ready ? 'Ready for your accountant' : 'Not ready yet'}</span></div>
              <div role="listitem" className="pr-tile"><strong>{view.pack.summary.transaction_count}</strong><span>Payments in the statement</span></div>
              <div role="listitem" className="pr-tile"><strong>{view.pack.summary.needs_review_count}</strong><span>Need a look</span></div>
              <div role="listitem" className="pr-tile"><strong>{view.pack.owner_questions.length}</strong><span>Questions for you</span></div>
              <div role="listitem" className={`pr-tile ${overall.tone}`}><strong className="pr-small">{overall.label}</strong><span>Overall</span></div>
            </div>

            <h2>Things to look at</h2>
            {view.pack.exceptions.length === 0 && <p className="pr-note">Nothing flagged.</p>}
            {view.pack.exceptions.length > 0 && (
              <ul className="pr-issues">
                {[...view.pack.exceptions].sort((a, b) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.severity) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.severity)).map((x, i) => (
                  <li key={x.code + (x.transaction_id || '') + i}>
                    <span className={`pr-pill ${x.severity === 'HIGH' ? 'pr-high' : x.severity === 'MEDIUM' ? 'pr-medium' : 'pr-low'}`}>{SEVERITY[x.severity]}</span>{' '}
                    {x.message}
                    {x.suggested_action && <em>What to do: {x.suggested_action}</em>}
                  </li>
                ))}
              </ul>
            )}

            <h2>Questions for you</h2>
            {view.pack.owner_questions.length === 0 && <p className="pr-note">No open questions.</p>}
            {view.pack.owner_questions.map(item => {
              const entry = view.pack.entries.find(e => e.transaction_id === item.transaction_id);
              return <QuestionRow key={item.transaction_id + item.question} item={item} entry={entry} docs={clean} disabled={!open_ || busy} onAnswer={payload => act('answer', { transaction_id: item.transaction_id, ...payload })} />;
            })}
            {!open_ && <p className="pr-note">This version is {view.record.status === 'SIGNED_OFF' ? 'signed off' : 'replaced by a newer one'}, so it can no longer be changed.</p>}

            <h2>Check the categories</h2>
            <p className="pr-note">Each payment is given a category and a VAT treatment. Change any that are wrong. Tick “remember” and the same payee is sorted that way next time.</p>
            {needsLook.length > 0 && (
              <label className="pr-check pr-inlinecheck"><input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} />Show only the {needsLook.length} that need a look</label>
            )}
            <div className="pr-scroll">
              <table className="pr-table pr-stack">
                <caption className="pr-sr">Payments with their category and VAT treatment</caption>
                <thead><tr><th scope="col">Date</th><th scope="col">Paid to or from</th><th scope="col">Amount</th><th scope="col">Category and VAT</th></tr></thead>
                <tbody>
                  {shownEntries.map(e => <CorrectionRow key={e.transaction_id} entry={e} options={view.options} disabled={!open_ || busy} onCorrect={payload => act('correct', { transaction_id: e.transaction_id, ...payload })} />)}
                </tbody>
              </table>
            </div>

            <h2>VAT estimate <span className="pr-hint">(an estimate, not a VAT return)</span></h2>
            {!view.vat_summary.vat_registered ? <p className="pr-note">The company is not registered for VAT, so no VAT is estimated.</p> : (
              <ul className="pr-list">
                {view.vat_summary.domestic_input_by_rate.map(r => <li key={r.rate}>VAT on local purchases at {r.rate}%: {money(r.vat_cents)} on {money(r.gross_cents)} paid ({r.count} with an invoice)</li>)}
                <li>{plural(view.vat_summary.domestic_input_unsupported.length, 'local purchase has', 'local purchases have')} no invoice or rate yet and {view.vat_summary.domestic_input_unsupported.length === 1 ? 'is' : 'are'} not counted</li>
                <li>Foreign services where you account for the VAT yourself: {plural(view.vat_summary.reverse_charge.count, 'payment', 'payments')}, VAT {money(view.vat_summary.reverse_charge.vat_cents)}</li>
                {view.vat_summary.notes.length > 0 && <li className="pr-hint">Notes for your accountant:</li>}
                {view.vat_summary.notes.map(n => <li key={n} className="pr-hint">{n}</li>)}
              </ul>
            )}

            <h2>Proposed journal <span className="pr-hint">({view.journal.balanced ? 'adds up' : 'DOES NOT ADD UP'})</span></h2>
            <p className="pr-note">{view.journal.notice}</p>
            <div className="pr-scroll">
              <table className="pr-table pr-numeric">
                <caption className="pr-sr">Totals for each account</caption>
                <thead><tr><th scope="col">Account</th><th scope="col" className="pr-right">Debit</th><th scope="col" className="pr-right">Credit</th></tr></thead>
                <tbody>
                  {view.journal.account_totals.map(t => <tr key={t.account_code}><th scope="row">{t.account_code} {t.account_name}</th><td className="pr-right">{t.debit_cents ? money(t.debit_cents) : ''}</td><td className="pr-right">{t.credit_cents ? money(t.credit_cents) : ''}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="pr-actions"><a className="pr-button pr-secondary pr-linkbutton" href={`/api/review-packs/${view.record.pack_id}?${q('&format=journal_csv')}`}>Download the journal as a spreadsheet</a></div>

            {view.options.signoff_enabled && open_ && <SignOff pack={view} disabled={busy} onSign={payload => act('sign_off', payload)} />}
          </section>
        )}

        <AccountNumbers companyId={companyId} jurisdiction={form.jurisdiction} call={call} busy={busy} onError={setError} />
      </section>
    </main>
  );
}

function QuestionRow({ item, entry, docs, disabled, onAnswer }: { item: { question: string }; entry?: Entry; docs: Doc[]; disabled: boolean; onAnswer: (p: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('');
  const [doc, setDoc] = useState('');
  const who = entry ? entry.counterparty || entry.description : 'this payment';
  return (
    <div className="pr-callout pr-question">
      <p><strong>{entry ? `${entry.date}, ${who}, ${money(entry.amount_cents, entry.currency)}` : ''}</strong></p>
      <p>{item.question}</p>
      <div className="pr-actions pr-tight">
        <input aria-label={`Your answer about ${who}`} placeholder="Your answer" value={note} onChange={e => setNote(e.target.value)} className="pr-grow" />
        <select aria-label={`Receipt for ${who}`} value={doc} onChange={e => setDoc(e.target.value)}><option value="">No receipt</option>{docs.map(d => <option key={d.document_id} value={d.document_id}>{d.filename}</option>)}</select>
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
  const who = entry.counterparty || entry.description;
  return (
    <tr>
      <td data-label="Date">{entry.date}</td>
      <td data-label="Paid to or from">{who}<em>{entry.status === 'NEEDS_REVIEW' ? 'Needs a look' : 'Looks fine'}{entry.document_ids.length ? `, ${entry.document_ids.length} receipt(s) attached` : ''}</em></td>
      <td data-label="Amount" className="pr-right-on-wide">{money(entry.amount_cents, entry.currency)}</td>
      <td data-label="Category and VAT">
        <div className="pr-controls">
          <select aria-label={`Category for ${who}`} value={category} onChange={e => setCategory(e.target.value)}>{options.categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
          <select aria-label={`VAT treatment for ${who}`} value={vat} onChange={e => setVat(e.target.value)}>{[...new Set([...VAT_VALUES, entry.vat_treatment])].map(v => <option key={v} value={v}>{vatLabel(v)}</option>)}</select>
          {options.vat_rates.length > 0 && <select aria-label={`VAT rate for ${who}`} value={rate} onChange={e => setRate(e.target.value)}><option value="">Rate: automatic</option>{options.vat_rates.map(r => <option key={r} value={r}>{r}%</option>)}</select>}
          <label className="pr-hint pr-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember for this company</label>
          <button className="pr-button pr-secondary" disabled={disabled || !changed} onClick={() => onCorrect({ category_code: category, vat_treatment: vat, vat_rate: rate === '' ? undefined : Number(rate), remember })} aria-label={`Apply the change for ${who}`}>Apply</button>
        </div>
      </td>
    </tr>
  );
}

function SignOff({ pack, disabled, onSign }: { pack: PackView; disabled: boolean; onSign: (p: Record<string, unknown>) => void }) {
  const [note, setNote] = useState('');
  const ready = pack.pack.summary.accountant_ready;
  return (
    <div className="pr-callout pr-signoff">
      <p><strong>Accountant sign-off.</strong> This records who accepted this exact version (code {pack.pack.pack_hash.slice(0, 12)}) and locks it. It posts nothing.</p>
      {!ready && <p>The pack is not ready yet. You can still sign off with the open items accepted. A note is required.</p>}
      <div className="pr-actions pr-tight">
        <input aria-label="Sign-off note" placeholder="Note (at least 10 characters if items are open)" value={note} onChange={e => setNote(e.target.value)} className="pr-grow" />
        <button className="pr-button" disabled={disabled} onClick={() => onSign({ pack_hash: pack.pack.pack_hash, note, accept_open_items: !ready })}>Sign off this version</button>
      </div>
    </div>
  );
}
