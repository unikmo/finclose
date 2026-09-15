'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';

type Firm = { firm_id: string; name: string; role: string };
type PortfolioRow = {
  company_id: string;
  organization_id: string;
  legal_name: string;
  country_code: string;
  service_scope: string;
  status: 'GREEN' | 'YELLOW' | 'RED' | 'NOT_STARTED';
  reasons: string[];
};
type PortfolioResponse = {
  firm_id: string;
  rows: PortfolioRow[];
  summary: { total: number; green: number; yellow: number; red: number; not_started: number; needs_attention_company_ids: string[] };
  note?: string;
  error?: string;
};

// Derives a per-area (Books/Payroll/Bank) indicator from the SAME reason
// codes the row's overall status already carries -- lib/portfolio-status.ts
// only computes one composite status per company (it has no independently
// tracked per-service state to draw on yet), so this reconstructs the
// area breakdown the brief's dashboard table wants from the exception
// codes' own names rather than inventing separate data this app doesn't
// have. A company without that service enabled (per its service_scope)
// shows "--", matching the brief's own dashboard example.
function areaIndicator(row: PortfolioRow, area: 'BOOKS' | 'PAYROLL' | 'BANK', serviceEnabled: boolean): { symbol: string; className: string; title: string } {
  if (!serviceEnabled) return { symbol: '—', className: 'fp-dot-na', title: 'Not applicable for this client' };
  if (row.status === 'NOT_STARTED') return { symbol: '—', className: 'fp-dot-na', title: 'Not started yet' };
  const prefix = area === 'BOOKS' ? 'BOOKKEEPING' : area === 'PAYROLL' ? 'PAYROLL' : 'BANK';
  const hit = row.reasons.find(r => r.startsWith(prefix) || (area === 'BANK' && r.startsWith('BANK_')));
  if (hit) {
    const severe = row.status === 'RED';
    return { symbol: severe ? '●' : '●', className: severe ? 'fp-dot-red' : 'fp-dot-yellow', title: hit };
  }
  return { symbol: '●', className: 'fp-dot-green', title: 'No open exceptions in this area' };
}

function statusLabel(status: PortfolioRow['status']) {
  if (status === 'GREEN') return 'Ready for review';
  if (status === 'YELLOW') return 'Needs review';
  if (status === 'RED') return 'Blocked';
  return 'Not started';
}

export default function FirmPortfolioPage() {
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/my-firms')
      .then(r => r.json().then(body => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { setAuthError(true); return; }
        setFirms(body.firms || []);
        if ((body.firms || []).length === 1) setSelectedFirmId(body.firms[0].firm_id);
      })
      .catch(() => setAuthError(true))
      .finally(() => setLoadingFirms(false));
  }, []);

  useEffect(() => {
    if (!selectedFirmId) { setPortfolio(null); return; }
    setLoadingPortfolio(true);
    fetch('/api/firm-portfolio?firm_id=' + encodeURIComponent(selectedFirmId))
      .then(r => r.json())
      .then(setPortfolio)
      .finally(() => setLoadingPortfolio(false));
  }, [selectedFirmId]);

  const selectedFirm = useMemo(() => firms?.find(f => f.firm_id === selectedFirmId) || null, [firms, selectedFirmId]);

  if (loadingFirms) {
    return (
      <main className="fp-shell">
        <p className="fp-loading">Loading your firms…</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="fp-shell">
        <div className="fp-empty">
          <h1>Sign in to view your Firm Workspace</h1>
          <p>The portfolio dashboard is only visible to signed-in firm members.</p>
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
        {firms && firms.length > 1 && (
          <select
            className="fp-firm-select"
            value={selectedFirmId}
            onChange={e => setSelectedFirmId(e.target.value)}
            aria-label="Select firm"
          >
            {firms.map(f => <option key={f.firm_id} value={f.firm_id}>{f.name}</option>)}
          </select>
        )}
      </header>

      {(!firms || firms.length === 0) && (
        <div className="fp-empty">
          <h1>No firm yet</h1>
          <p>You're not an active member of any accounting firm. Ask a firm partner to add you, or create one.</p>
          <Link href="/" className="fp-link">← Back to FinClose</Link>
        </div>
      )}

      {selectedFirm && (
        <section className="fp-body">
          <div className="fp-title-row">
            <h1>{selectedFirm.name}</h1>
            <span className="fp-role-pill">{selectedFirm.role}</span>
          </div>

          {portfolio?.note && <p className="fp-note">{portfolio.note}</p>}

          {portfolio?.summary && (
            <div className="fp-summary" aria-label="Portfolio summary">
              <div className="fp-summary-item"><strong>{portfolio.summary.total}</strong><span>Clients</span></div>
              <div className="fp-summary-item fp-summary-green"><strong>{portfolio.summary.green}</strong><span>Ready</span></div>
              <div className="fp-summary-item fp-summary-yellow"><strong>{portfolio.summary.yellow}</strong><span>Needs review</span></div>
              <div className="fp-summary-item fp-summary-red"><strong>{portfolio.summary.red}</strong><span>Blocked</span></div>
              <div className="fp-summary-item"><strong>{portfolio.summary.not_started}</strong><span>Not started</span></div>
            </div>
          )}

          {loadingPortfolio && <p className="fp-loading">Loading portfolio…</p>}

          {!loadingPortfolio && portfolio && portfolio.rows.length === 0 && !portfolio.note && (
            <div className="fp-empty fp-empty-inline">
              <p>No clients yet. Delegated client organizations will appear here once they accept your firm's invitation.</p>
            </div>
          )}

          {!loadingPortfolio && portfolio && portfolio.rows.length > 0 && (
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Books</th>
                  <th>Payroll</th>
                  <th>Bank</th>
                  <th>Close</th>
                  <th>Exceptions</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.rows.map(row => {
                  const scope = String(row.service_scope || '');
                  const hasBooks = scope.includes('BOOKKEEPING');
                  const hasPayroll = scope.includes('PAYROLL');
                  const books = areaIndicator(row, 'BOOKS', hasBooks);
                  const payroll = areaIndicator(row, 'PAYROLL', hasPayroll);
                  const bank = areaIndicator(row, 'BANK', hasBooks); // bank reconciliation lives under bookkeeping in this codebase
                  const expanded = expandedCompanyId === row.company_id;
                  return (
                    <Fragment key={row.company_id}>
                      <tr
                        className={'fp-row fp-row-' + row.status.toLowerCase()}
                        onClick={() => setExpandedCompanyId(expanded ? null : row.company_id)}
                      >
                        <td className="fp-client-cell">{row.legal_name || row.company_id}<span className="fp-country">{row.country_code}</span></td>
                        <td title={books.title}><span className={'fp-dot ' + books.className}>{books.symbol}</span></td>
                        <td title={payroll.title}><span className={'fp-dot ' + payroll.className}>{payroll.symbol}</span></td>
                        <td title={bank.title}><span className={'fp-dot ' + bank.className}>{bank.symbol}</span></td>
                        <td><span className={'fp-status-pill fp-status-' + row.status.toLowerCase()}>{statusLabel(row.status)}</span></td>
                        <td>{row.reasons.length || 0}</td>
                      </tr>
                      {expanded && (
                        <tr className="fp-drill-row">
                          <td colSpan={6}>
                            {row.reasons.length === 0 ? (
                              <p className="fp-drill-empty">No open exceptions.</p>
                            ) : (
                              <ul className="fp-drill-list">
                                {row.reasons.map(reason => <li key={reason}>{reason}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
