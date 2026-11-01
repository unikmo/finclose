'use client';

import Link from 'next/link';
import { useState } from 'react';
import { decodeStatementBytes } from '../../lib/statement-decode';

type Exception = {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  suggested_action: string;
  evidence: { date: string; amount_cents: number; currency: string; counterparty: string; description: string } | null;
};
type PrepareResponse = {
  error?: string;
  markdown: string;
  entries_csv: string;
  pack: {
    status: string;
    summary: {
      transaction_count: number;
      inflow_cents: number;
      outflow_cents: number;
      proposed_count: number;
      needs_review_count: number;
      readiness_percent: number;
      readiness_definition: string;
      accountant_ready: boolean;
    };
    category_totals: { category_code: string; category_name: string; count: number; total_cents: number }[];
    exceptions: Exception[];
    owner_questions: { transaction_id: string; question: string }[];
    limitations: string[];
  };
  intake: { imported: number; rejected_count: number; rejected_sample: { row: number; reason: string }[]; warnings: string[] };
};

function money(cents: number, currency = '') {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${whole}.${String(abs % 100).padStart(2, '0')}${currency ? ' ' + currency : ''}`;
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PreparePage() {
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [jurisdiction, setJurisdiction] = useState('EE');
  const [vatRegistered, setVatRegistered] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [dateOrder, setDateOrder] = useState('DMY');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PrepareResponse | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setCsvText(decodeStatementBytes(new Uint8Array(await file.arrayBuffer())).text);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/review-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          company_id: companyId || undefined,
          jurisdiction,
          vat_registered: vatRegistered,
          period_start: periodStart,
          period_end: periodEnd,
          date_order: dateOrder,
          csv_text: csvText
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
      setResult(body as PrepareResponse);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const summary = result?.pack.summary;
  const currency = result?.pack.exceptions.find(e => e.evidence)?.evidence?.currency || 'EUR';

  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="FinClose home">
          <span className="pr-logo">F</span>
          <span>FinClose <em>Prepare for review</em></span>
        </Link>
      </header>

      <section className="pr-body">
        <h1>Prepare your books for the accountant</h1>
        <p className="pr-lead">
          Upload a bank statement (CSV). Nothing is posted, approved or stored.
        </p>

        <form className="pr-form" onSubmit={submit}>
          <label>Company name
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} required maxLength={200} />
          </label>
          <label>Company ID <span className="pr-hint">(required for real data)</span>
            <input value={companyId} onChange={e => setCompanyId(e.target.value)} />
          </label>
          <label>Country rules
            <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)}>
              <option value="EE">Estonia (draft rules)</option>
              <option value="GENERIC">Other (no VAT rates)</option>
            </select>
          </label>
          <label>Date format in the file
            <select value={dateOrder} onChange={e => setDateOrder(e.target.value)}>
              <option value="DMY">Day first (31.03.2026)</option>
              <option value="MDY">Month first (03/31/2026)</option>
              <option value="auto">Detect</option>
            </select>
          </label>
          <label>Period start
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} required />
          </label>
          <label>Period end
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} required />
          </label>
          <label className="pr-check">
            <input type="checkbox" checked={vatRegistered} onChange={e => setVatRegistered(e.target.checked)} />
            The company is VAT-registered
          </label>
          <label className="pr-wide">Bank statement (CSV)
            <input type="file" accept=".csv,text/csv,text/plain" onChange={e => onFile(e.target.files?.[0])} />
            {fileName && <span className="pr-hint">{fileName}</span>}
          </label>
          <button className="pr-button" type="submit" disabled={busy || !csvText}>{busy ? 'Preparing…' : 'Prepare review pack'}</button>
        </form>

        {error && <p className="pr-error" role="alert">{error}</p>}

        {result && summary && (
          <section className="pr-result" aria-live="polite">
            <div className="pr-summary">
              <div className={`pr-tile ${summary.accountant_ready ? 'pr-ok' : 'pr-warn'}`}>
                <strong>{summary.readiness_percent}%</strong>
                <span>{summary.accountant_ready ? 'Ready for accountant review' : 'Not ready yet'}</span>
              </div>
              <div className="pr-tile"><strong>{summary.transaction_count}</strong><span>Transactions</span></div>
              <div className="pr-tile"><strong>{summary.proposed_count}</strong><span>Proposed</span></div>
              <div className="pr-tile"><strong>{summary.needs_review_count}</strong><span>Need review</span></div>
              <div className="pr-tile"><strong>{result.pack.owner_questions.length}</strong><span>Owner questions</span></div>
            </div>
            <p className="pr-note">
              Money in {money(summary.inflow_cents, currency)}. Money out {money(summary.outflow_cents, currency)}. Status: {result.pack.status}. {summary.readiness_definition}
            </p>

            {(result.intake.warnings.length > 0 || result.intake.rejected_count > 0) && (
              <div className="pr-callout">
                {result.intake.warnings.map(w => <p key={w}>{w}</p>)}
                {result.intake.rejected_count > 0 && (
                  <p>{result.intake.rejected_count} row(s) could not be read, for example line {result.intake.rejected_sample[0]?.row}: {result.intake.rejected_sample[0]?.reason}.</p>
                )}
              </div>
            )}

            <div className="pr-actions">
              <button className="pr-button" onClick={() => download('review-pack.md', result.markdown, 'text/markdown')}>Download pack (Markdown)</button>
              <button className="pr-button pr-secondary" onClick={() => download('proposed-entries.csv', result.entries_csv, 'text/csv')}>Download entries (CSV)</button>
            </div>

            <h2>Questions for the owner</h2>
            {result.pack.owner_questions.length === 0 ? <p className="pr-note">None.</p> : (
              <ul className="pr-list">{result.pack.owner_questions.map(q => <li key={q.transaction_id + q.question}>{q.question}</li>)}</ul>
            )}

            <h2>Exceptions</h2>
            {result.pack.exceptions.length === 0 ? <p className="pr-note">None.</p> : (
              <table className="pr-table">
                <thead><tr><th>Severity</th><th>Issue</th><th>Date</th><th>Amount</th><th>Detail and action</th></tr></thead>
                <tbody>
                  {result.pack.exceptions.map((e, i) => (
                    <tr key={i}>
                      <td><span className={`pr-pill pr-${e.severity.toLowerCase()}`}>{e.severity}</span></td>
                      <td>{e.code.replace(/_/g, ' ').toLowerCase()}</td>
                      <td>{e.evidence?.date}</td>
                      <td>{e.evidence ? money(e.evidence.amount_cents, e.evidence.currency) : ''}</td>
                      <td>{e.message} <em>{e.suggested_action}</em></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Totals by category</h2>
            <table className="pr-table">
              <thead><tr><th>Category</th><th>Count</th><th>Total</th></tr></thead>
              <tbody>
                {result.pack.category_totals.map(row => (
                  <tr key={row.category_code}><td>{row.category_name}</td><td>{row.count}</td><td>{money(row.total_cents, currency)}</td></tr>
                ))}
              </tbody>
            </table>

            <h2>Limitations</h2>
            <ul className="pr-list">{result.pack.limitations.map(l => <li key={l}>{l}</li>)}</ul>
          </section>
        )}
      </section>
    </main>
  );
}
