'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Country = { code: string; name: string; currency: string };
type User = { user_id: string; name: string; email: string };
type Company = {
  company_id: string;
  legal_name: string;
  country_code?: string;
  country_name?: string;
  service_scope?: string;
  status?: string;
};
type InitRecord = {
  initialization_id: string;
  legal_name: string;
  country_code: string;
  country_name: string;
  status: string;
  ready: boolean;
  blockers?: { message: string }[];
  company_id?: string;
};
type Deployment = {
  deployment_id: string;
  service: string;
  service_title: string;
  country_code?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  history_status?: string | null;
  history_count?: number;
  selected_connector?: string | null;
  latest_source_id?: string | null;
  status: string;
};

type Connector = {
  id: string;
  name: string;
  configured: boolean;
  state: string;
  payrollCountries?: string[];
};

type PayrollProfile = {
  key: string;
  title: string;
  connectors: Connector[];
};

const STEPS = ['Account', 'Company', 'Payroll history', 'Current payroll'];
const HISTORY_ITEMS = [
  ['Payroll registers', 'Your latest payroll runs and year-to-date totals.'],
  ['Employee payroll data', 'Employee master data used by the previous payroll process.'],
  ['Taxes & social charges', 'Recent tax, social-security, pension or similar payroll submissions.'],
  ['Open adjustments', 'Outstanding payroll liabilities, corrections, bonuses or other unresolved items.']
];

function supportsPayroll(connector: Connector, country: string) {
  const supported = connector.payrollCountries || [];
  return supported.includes('*') || supported.includes(country);
}

export default function PayrollOnboarding() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [profile, setProfile] = useState<PayrollProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [country, setCountry] = useState('GE');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [linkedCompanyStage, setLinkedCompanyStage] = useState('');

  const [initFile, setInitFile] = useState<File | null>(null);
  const [initRecord, setInitRecord] = useState<InitRecord | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');

  const [historyFiles, setHistoryFiles] = useState<File[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState('');

  const companyComplete = Boolean(deployment?.company_id);
  const historyComplete = Boolean(
    deployment?.history_status === 'RECEIVED' ||
    deployment?.history_status === 'NOT_APPLICABLE_NEW_COMPANY'
  );
  const sourceComplete = deployment?.status === 'READY_FOR_AGENT' || Boolean(deployment?.latest_source_id);
  const currentStep = !user ? 0 : !companyComplete ? 1 : !historyComplete ? 2 : 3;
  const effectiveCountry = String(deployment?.country_code || country || '').toUpperCase();
  const countryName = countries.find(item => item.code === effectiveCountry)?.name || effectiveCountry;

  const availablePayrollConnectors = useMemo(() => {
    if (!profile) return [];
    return profile.connectors.filter(connector => connector.id !== 'manual-upload' && connector.configured && supportsPayroll(connector, effectiveCountry));
  }, [profile, effectiveCountry]);

  useEffect(() => {
    Promise.all([
      fetch('/api/initialization/countries').then(r => r.json()),
      fetch('/api/service-deployments/catalog').then(r => r.json()),
      fetch('/api/account/session').then(r => r.json())
    ]).then(([countryList, catalog, session]) => {
      setCountries(countryList);
      setProfile((catalog as PayrollProfile[]).find(item => item.key === 'payroll') || null);
      setUser(session.authenticated ? session.user : null);
      setAuthReady(true);
    }).catch(() => {
      setAuthReady(true);
      setNote('FinClose could not load the payroll setup. Please reload the page.');
    });
  }, []);

  useEffect(() => {
    if (!user || deployment || restoring) return;
    const stored = sessionStorage.getItem('fincloseDeployment:payroll');
    if (!stored) return;
    setRestoring(true);
    api(`/service-deployments/${stored}`)
      .then(async result => {
        setDeployment(result);
        setCountry(String(result.country_code || country));
        if (!result.company_id) await loadCompanies(String(result.country_code || country));
      })
      .catch(() => sessionStorage.removeItem('fincloseDeployment:payroll'))
      .finally(() => setRestoring(false));
  }, [user]);

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch('/api' + path, init);
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { detail: text }; }
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  function base64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function setError(error: unknown) {
    setNote((error as Error)?.message ? `Error: ${(error as Error).message}` : 'Something went wrong. Please try again.');
  }

  async function submitAccount() {
    setBusy(true);
    setNote('');
    try {
      const result = await api(`/account/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(authMode === 'register' ? { name, email, password } : { email, password })
      });
      setUser(result.user);
      setPassword('');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await api('/account/logout', { method: 'POST' });
      setUser(null);
      setDeployment(null);
      setCompanies([]);
      setSelectedCompanyId('');
      setHistoryFiles([]);
      setSourceFile(null);
      setNote('');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function loadCompanies(expectedCountry: string) {
    const list: Company[] = await api('/companies');
    const wanted = expectedCountry.toUpperCase();
    const filtered = list.filter(company => String(company.country_code || '').toUpperCase() === wanted);
    setCompanies(filtered);
    setSelectedCompanyId(filtered[0]?.company_id || '');
    return filtered;
  }

  async function startCompanyStep() {
    if (!user) return;
    setBusy(true);
    setNote('');
    try {
      const result = await api('/service-deployments/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: 'payroll', country_code: country })
      });
      setDeployment(result);
      sessionStorage.setItem('fincloseDeployment:payroll', result.deployment_id);
      await loadCompanies(country);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function linkExistingCompany() {
    if (!deployment || !selectedCompanyId) return;
    setBusy(true);
    setNote('');
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/company`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: selectedCompanyId })
      });
      setDeployment(result.deployment);
      setLinkedCompanyStage(String(result.company?.company_stage || '').toUpperCase());
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function requestTemplate() {
    setBusy(true);
    setNote('');
    try {
      const result = await api('/initialization/template/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: effectiveCountry })
      });
      setDownloadUrl(result.download_url);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function initializeCompany() {
    if (!deployment || !initFile) return;
    setBusy(true);
    setNote('');
    try {
      const validated = await api('/initialization/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: initFile.name, content_base64: await base64(initFile) })
      });
      const record: InitRecord = validated.records[0];
      setInitRecord(record);
      if (!record.ready) {
        setNote((record.blockers || []).map(item => item.message).join(' · ') || 'The company form needs attention.');
        return;
      }
      const initialized = await api(`/initialization/${record.initialization_id}/initialize`, { method: 'POST' });
      const linked = await api(`/service-deployments/${deployment.deployment_id}/company`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: initialized.company_id })
      });
      setDeployment(linked.deployment);
      setLinkedCompanyStage(String(linked.company?.company_stage || '').toUpperCase());
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function uploadHistory() {
    if (!deployment || !historyFiles.length) return;
    setBusy(true);
    setNote('');
    try {
      for (const file of historyFiles) {
        await api(`/service-deployments/${deployment.deployment_id}/history`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content_base64: await base64(file) })
        });
      }
      setDeployment(await api(`/service-deployments/${deployment.deployment_id}`));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function skipHistory() {
    if (!deployment) return;
    setBusy(true);
    setNote('');
    try {
      setDeployment(await api(`/service-deployments/${deployment.deployment_id}/history/skip`, { method: 'POST' }));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCurrentPayroll() {
    if (!deployment || !sourceFile) return;
    setBusy(true);
    setNote('');
    try {
      if (deployment.selected_connector !== 'manual-upload') {
        const selected = await api(`/service-deployments/${deployment.deployment_id}/connector`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ connector: 'manual-upload' })
        });
        setDeployment(selected.deployment);
      }
      await api(`/service-deployments/${deployment.deployment_id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: sourceFile.name, content_base64: await base64(sourceFile) })
      });
      setDeployment(await api(`/service-deployments/${deployment.deployment_id}`));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  function stepClass(index: number) {
    if (index < currentStep || (index === 3 && sourceComplete)) return 'complete';
    if (index === currentStep) return 'current';
    return '';
  }

  if (!authReady || !profile) {
    return <main className="payroll-flow-shell"><div className="payroll-loading">Loading payroll setup…</div></main>;
  }

  return (
    <main className="payroll-flow-shell">
      <header className="payroll-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span className="home-brand-copy"><strong>FinClose</strong><small>Bookkeeping · Payroll · Close</small></span>
        </Link>
        <div className="payroll-nav-actions">
          {user && <span className="payroll-user">{user.email}</span>}
          {user && <button className="payroll-text-button" onClick={signOut} disabled={busy}>Sign out</button>}
          <Link href="/" className="service-back">← Change service</Link>
        </div>
      </header>

      <section className="payroll-heading">
        <div>
          <span className="payroll-eyebrow">PAYROLL ONLY</span>
          <h1>Help me do payroll</h1>
          <p>Set up only what payroll needs. FinClose keeps company setup, payroll history and current payroll data in the right order.</p>
        </div>
        <div className="payroll-steps" aria-label="Payroll setup progress">
          {STEPS.map((step, index) => (
            <div className={stepClass(index)} key={step}>
              <span>{index < currentStep || (index === 3 && sourceComplete) ? '✓' : index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>

      {!user && (
        <section className="payroll-stage payroll-auth-stage">
          <div className="payroll-stage-copy">
            <span className="payroll-stage-number">01</span>
            <h2>Start with your account</h2>
            <p>Sign in if you already use FinClose, or create an account once. Your payroll choice is already saved for this setup.</p>
            <div className="payroll-reassurance">
              <span>One account</span>
              <span>One payroll setup</span>
              <span>No technical credentials</span>
            </div>
          </div>

          <div className="payroll-card payroll-auth-card">
            <div className="payroll-auth-tabs" role="tablist" aria-label="Account access">
              <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button>
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
            </div>
            {authMode === 'register' && (
              <label><span>Your name</span><input value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label>
            )}
            <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
            <label><span>Password</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} /></label>
            {authMode === 'register' && <small className="payroll-field-help">At least 10 characters.</small>}
            <button className="payroll-primary" onClick={submitAccount} disabled={busy || !email || !password || (authMode === 'register' && !name)}>
              {busy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </section>
      )}

      {user && !companyComplete && (
        <section className="payroll-stage">
          <div className="payroll-stage-head">
            <div>
              <span className="payroll-stage-number">02</span>
              <h2>Add the company</h2>
              <p>Payroll needs a company context. Reuse a company that is already in FinClose, or initialize it once.</p>
            </div>
            <div className="payroll-account-chip"><span>✓</span>{user.email}</div>
          </div>

          {!deployment ? (
            <div className="payroll-card payroll-country-card">
              <span className="payroll-card-label">COMPANY COUNTRY</span>
              <h3>Where is the company registered?</h3>
              <p>FinClose uses this to apply the correct company and payroll setup.</p>
              <label><span>Country</span><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
              <button className="payroll-primary" onClick={startCompanyStep} disabled={busy}>{busy ? 'Loading…' : 'Continue'}</button>
            </div>
          ) : (
            <div className="payroll-company-grid">
              <div className="payroll-card">
                <span className="payroll-card-label">ALREADY IN FINCLOSE</span>
                <h3>Use an existing company</h3>
                <p>Use a company that was already initialized for {countryName}. You do not need to set it up again.</p>
                {companies.length > 0 ? (
                  <>
                    <label><span>Company</span><select value={selectedCompanyId} onChange={event => setSelectedCompanyId(event.target.value)}>{companies.map(company => <option key={company.company_id} value={company.company_id}>{company.legal_name}</option>)}</select></label>
                    <button className="payroll-primary" onClick={linkExistingCompany} disabled={busy || !selectedCompanyId}>Use this company</button>
                  </>
                ) : (
                  <div className="payroll-empty-state">No initialized {countryName} company is available for this account yet.</div>
                )}
              </div>

              <div className="payroll-card">
                <span className="payroll-card-label">NEW TO FINCLOSE</span>
                <h3>Initialize the company</h3>
                <p>Download the {countryName} company form, complete it once, then upload it here.</p>
                <div className="payroll-inline-actions">
                  <button className="payroll-secondary" onClick={requestTemplate} disabled={busy}>Prepare company form</button>
                  {downloadUrl && <a className="payroll-download" href={downloadUrl}>Download XLSX</a>}
                </div>
                <label><span>Completed company form</span><input className="payroll-file" type="file" accept=".xlsx" onChange={event => setInitFile(event.target.files?.[0] || null)} /></label>
                <button className="payroll-primary" onClick={initializeCompany} disabled={busy || !initFile}>Validate & add company</button>
                {initRecord && <div className={initRecord.ready ? 'payroll-success-inline' : 'payroll-warning-inline'}>{initRecord.ready ? `${initRecord.legal_name} validated` : (initRecord.blockers || []).map(item => item.message).join(' · ')}</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {user && companyComplete && !historyComplete && deployment && (
        <section className="payroll-stage">
          <div className="payroll-stage-head">
            <div>
              <span className="payroll-stage-number">03</span>
              <h2>Bring your payroll history</h2>
              <p>Give FinClose enough history to understand year-to-date payroll, employee setup and anything still open before it receives current payroll data.</p>
            </div>
            <div className="payroll-account-chip company"><span>✓</span>{deployment.company_name || 'Company added'}</div>
          </div>

          <div className="payroll-history-grid">
            <div className="payroll-history-list">
              {HISTORY_ITEMS.map(([title, description]) => (
                <div className="payroll-history-item" key={title}>
                  <span>✓</span>
                  <div><strong>{title}</strong><p>{description}</p></div>
                </div>
              ))}
            </div>
            <div className="payroll-card payroll-upload-card">
              <span className="payroll-card-label">UPLOAD WHAT YOU HAVE</span>
              <h3>Previous payroll files</h3>
              <p>You can send several files together. XLSX, XLS, CSV and PDF are accepted.</p>
              <label className="payroll-dropzone">
                <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf" onChange={event => setHistoryFiles(Array.from(event.target.files || []))} />
                <strong>{historyFiles.length ? `${historyFiles.length} file${historyFiles.length === 1 ? '' : 's'} selected` : 'Choose payroll files'}</strong>
                <span>Payroll registers, employee data, filings, adjustments</span>
              </label>
              <button className="payroll-primary" onClick={uploadHistory} disabled={busy || !historyFiles.length}>{busy ? 'Uploading…' : 'Upload payroll history'}</button>
              {linkedCompanyStage === 'NEW' && <button className="payroll-text-action" onClick={skipHistory} disabled={busy}>This is a new company — no payroll history exists</button>}
            </div>
          </div>
        </section>
      )}

      {user && historyComplete && deployment && (
        <section className="payroll-stage">
          <div className="payroll-stage-head">
            <div>
              <span className="payroll-stage-number">04</span>
              <h2>{sourceComplete ? 'Payroll setup received' : 'Connect current payroll data'}</h2>
              <p>{sourceComplete ? 'FinClose has the account, company, payroll history and current payroll source for this setup.' : 'Now provide the current payroll source. This is kept separate from the historical files you already supplied.'}</p>
            </div>
            <div className="payroll-account-chip company"><span>✓</span>{deployment.company_name || 'Company added'}</div>
          </div>

          {sourceComplete ? (
            <div className="payroll-complete-card">
              <div className="payroll-complete-mark">✓</div>
              <div>
                <span className="payroll-card-label">SETUP COMPLETE</span>
                <h3>Everything needed for the payroll handoff has been received.</h3>
                <p>FinClose can now move into payroll validation and preparation. No bookkeeping service has been added to this payroll-only setup.</p>
                <div className="payroll-summary-row">
                  <span>Account <strong>confirmed</strong></span>
                  <span>Company <strong>{deployment.company_name || 'added'}</strong></span>
                  <span>History <strong>{deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY' ? 'not applicable' : 'received'}</strong></span>
                  <span>Current source <strong>received</strong></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="payroll-current-grid">
              <div className="payroll-card payroll-current-card featured">
                <span className="payroll-card-label">AVAILABLE NOW</span>
                <h3>Secure payroll upload</h3>
                <p>Send the latest export from your payroll system. FinClose stores this separately from historical payroll information.</p>
                <label className="payroll-dropzone compact">
                  <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={event => setSourceFile(event.target.files?.[0] || null)} />
                  <strong>{sourceFile ? sourceFile.name : 'Choose current payroll file'}</strong>
                  <span>Latest payroll export or current payroll source</span>
                </label>
                <button className="payroll-primary" onClick={uploadCurrentPayroll} disabled={busy || !sourceFile}>{busy ? 'Uploading…' : 'Send current payroll data'}</button>
              </div>

              <div className="payroll-card payroll-integrations-card">
                <span className="payroll-card-label">DIRECT CONNECTIONS</span>
                <h3>Payroll systems</h3>
                {availablePayrollConnectors.length ? (
                  <div className="payroll-provider-list">
                    {availablePayrollConnectors.map(connector => <div key={connector.id}><strong>{connector.name}</strong><span>Connection setup available for {countryName}</span></div>)}
                  </div>
                ) : (
                  <p>Secure upload is the available connection method for {countryName} right now. Direct payroll integrations only appear once they are live for the selected country.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {note && <div className={`payroll-status ${note.startsWith('Error:') ? 'error' : ''}`}>{note}</div>}

      <footer className="payroll-footer">
        <span>Payroll only</span>
        <span>Company setup only when needed</span>
        <span>History stays separate from current data</span>
        <span>Test data only on this preview</span>
      </footer>
    </main>
  );
}
