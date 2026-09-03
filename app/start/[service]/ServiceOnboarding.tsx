'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Connector = {
  id: string;
  name: string;
  method: string;
  note: string;
  state: string;
  configured: boolean;
  accountingCountries?: string[];
  payrollCountries?: string[];
};

type Profile = {
  key: string;
  title: string;
  description: string;
  agents: string[];
  fullCompanyInitializationRequired: boolean;
  countryRequiredAtRegistration: boolean;
  configurationFields: string[];
  connectorAccess: string;
  billingScope: string;
  connectors: Connector[];
};

type Country = { code: string; name: string; currency: string };
type Company = { company_id: string; legal_name: string; country_code?: string; country_name?: string; service_scope?: string; status?: string };
type InitRecord = { initialization_id: string; legal_name: string; country_code: string; country_name: string; status: string; ready: boolean; blockers?: { message: string }[]; company_id?: string };

type Deployment = {
  deployment_id: string;
  service: string;
  service_title: string;
  billing_scope: string;
  agents: string[];
  country_code?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  initialization_status?: string | null;
  history_status?: string | null;
  history_count?: number;
  selected_connector?: string | null;
  connector_state?: string | null;
  status: string;
};

const HISTORY_GUIDANCE: Record<string, string[]> = {
  'balance-books': [
    'General ledger or accounting-system export',
    'Trial balance and latest reconciliations',
    'Bank statements or bank reconciliation files',
    'Open receivables and payables',
    'Missing-receipt or unresolved-item lists, if available'
  ],
  payroll: [
    'Previous payroll registers and year-to-date totals',
    'Employee/payroll master data from the former system',
    'Tax, social-security or pension submissions',
    'Outstanding payroll liabilities or adjustments'
  ],
  'do-bookkeeping': [
    'Prior general ledger and trial balance',
    'Bank statements and reconciliation files',
    'Open receivables and payables',
    'Sales and purchase journals or accounting exports',
    'Chart of accounts and unresolved items'
  ],
  'bookkeeping-payroll': [
    'Prior general ledger, trial balance and bank reconciliations',
    'Open receivables and payables',
    'Previous payroll registers and year-to-date totals',
    'Employee/payroll master data and payroll liabilities',
    'Any unresolved accounting or payroll items'
  ]
};

function supports(countries: string[] | undefined, country: string) {
  if (!countries || !country) return true;
  return countries.includes('*') || countries.includes(country);
}

function connectorFits(profile: Profile, connector: Connector, country: string) {
  if (!country) return true;
  if (profile.connectorAccess === 'payroll') return supports(connector.payrollCountries, country);
  if (profile.connectorAccess === 'accounting-and-payroll') return supports(connector.accountingCountries, country) && supports(connector.payrollCountries, country);
  return supports(connector.accountingCountries, country);
}

export default function ServiceOnboarding({ serviceKey }: { serviceKey: string }) {
  const [token, setToken] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('GE');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [linkedCompanyStage, setLinkedCompanyStage] = useState('');
  const [initFile, setInitFile] = useState<File | null>(null);
  const [initRecord, setInitRecord] = useState<InitRecord | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [historyFiles, setHistoryFiles] = useState<File[]>([]);
  const [historyResults, setHistoryResults] = useState<Array<{ filename: string; status: string; sha256: string }>>([]);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [note, setNote] = useState('Start with registration and, where needed, company initialization.');
  const [busy, setBusy] = useState(false);

  const profile = useMemo(() => profiles.find(p => p.key === serviceKey) || null, [profiles, serviceKey]);
  const companyInitializationRequired = serviceKey !== 'balance-books';
  const initializationComplete = Boolean(deployment && (!companyInitializationRequired || deployment.company_id));
  const historyComplete = Boolean(deployment && (deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY' || historyResults.length));
  const effectiveCountry = String(deployment?.country_code || (profile?.countryRequiredAtRegistration ? country : '') || '').toUpperCase();
  const visibleConnectors = useMemo(() => profile ? profile.connectors.filter(c => connectorFits(profile, c, effectiveCountry)) : [], [profile, effectiveCountry]);

  useEffect(() => {
    setToken(sessionStorage.getItem('fincloseLabToken') || '');
    Promise.all([
      fetch('/api/service-deployments/catalog').then(r => r.json()),
      fetch('/api/initialization/countries').then(r => r.json())
    ]).then(([catalog, countryList]) => {
      setProfiles(catalog);
      setCountries(countryList);
    }).catch(() => setNote('Could not load FinClose setup information.'));
  }, []);

  function saveToken(value: string) {
    setToken(value);
    sessionStorage.setItem('fincloseLabToken', value);
  }

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    if (token) headers.set('x-finclose-lab-token', token);
    const response = await fetch('/api' + path, { ...init, headers });
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

  async function loadCompanies(expectedCountry?: string) {
    const list: Company[] = await api('/companies');
    const wanted = String(expectedCountry || country || '').toUpperCase();
    const filtered = wanted ? list.filter(c => !c.country_code || String(c.country_code).toUpperCase() === wanted) : list;
    setCompanies(filtered);
    setSelectedCompanyId(filtered[0]?.company_id || '');
    return filtered;
  }

  async function register() {
    if (!profile) return;
    setBusy(true);
    try {
      const result = await api('/service-deployments/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: serviceKey, name, email, country_code: profile.countryRequiredAtRegistration ? country : undefined })
      });
      setDeployment(result);
      if (companyInitializationRequired) {
        const existing = await loadCompanies(result.country_code || country);
        setNote(existing.length
          ? 'Registration complete. Choose an already initialized FinClose company — MDA will appear here if it matches the selected country — or initialize another company.'
          : 'Registration complete. No initialized company was found for this country; use the initialization form below.');
      } else {
        setNote('Registration complete. No company initialization is required for this service. Add prior records next so FinClose understands the books before connecting to the live system.');
      }
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function linkExistingCompany() {
    if (!deployment || !selectedCompanyId) return;
    setBusy(true);
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/company`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: selectedCompanyId })
      });
      setDeployment(result.deployment);
      setLinkedCompanyStage(String(result.company?.company_stage || '').toUpperCase());
      setNote(`${result.company?.legal_name || 'Company'} is already initialized. Next, upload prior information so FinClose can understand the starting position.`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function requestTemplate() {
    setBusy(true);
    try {
      const result = await api('/initialization/template/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country })
      });
      setDownloadUrl(result.download_url);
      setNote('Initialization form ready. Complete it, then upload it here. The service you selected remains the only deployed/billed service.');
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function validateAndInitialize() {
    if (!deployment || !initFile) return;
    setBusy(true);
    try {
      const validated = await api('/initialization/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: initFile.name, content_base64: await base64(initFile) })
      });
      const record: InitRecord = validated.records[0];
      setInitRecord(record);
      if (!record.ready) {
        setNote(`Initialization blocked: ${(record.blockers || []).map(b => b.message).join(' · ') || 'check the form'}`);
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
      setNote(`${linked.company?.legal_name || record.legal_name} initialized and linked. Next, provide prior information for context.`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function uploadHistory() {
    if (!deployment || !historyFiles.length) return;
    setBusy(true);
    try {
      const received: Array<{ filename: string; status: string; sha256: string }> = [];
      for (const file of historyFiles) {
        const result = await api(`/service-deployments/${deployment.deployment_id}/history`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content_base64: await base64(file) })
        });
        received.push({ filename: result.filename, status: result.status, sha256: result.sha256 });
      }
      setHistoryResults(received);
      const refreshed = await api(`/service-deployments/${deployment.deployment_id}`);
      setDeployment(refreshed);
      setNote(`${received.length} historical file${received.length === 1 ? '' : 's'} received. FinClose can now use this context before live-system access.`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function skipHistoryForNewCompany() {
    if (!deployment) return;
    setBusy(true);
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/history/skip`, { method: 'POST' });
      setDeployment(result);
      setNote('No prior history is required because the initialized company is marked NEW. Continue to the system connection.');
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function chooseConnector(connector: Connector) {
    if (!deployment) return;
    setBusy(true);
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/connector`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connector: connector.id })
      });
      setDeployment(result.deployment);
      setSelectedConnector(result.connector);
      if (connector.id === 'manual-upload') setNote('Secure file upload selected for current operational data. Historical context remains stored separately.');
      else if (result.connector.configured) setNote(`${connector.name} is provider-configured; customer authorization still requires the secure OAuth/API callback flow.`);
      else setNote(`${connector.name} is available in the connector layer but is not live-authorized yet.`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function uploadCurrentSource() {
    if (!deployment || !sourceFile) return;
    setBusy(true);
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: sourceFile.name, content_base64: await base64(sourceFile) })
      });
      setNote(`${result.status}: current source received. SHA ${String(result.sha256).slice(0, 12)}…`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  if (!profile) return <main className="service-start-shell"><div className="service-loading">Loading FinClose service…</div></main>;

  return (
    <main className="service-start-shell">
      <header className="service-start-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span className="home-brand-copy"><strong>FinClose</strong><small>Start with the minimum required setup</small></span>
        </Link>
        <Link href="/" className="service-back">← Change service</Link>
      </header>

      <section className="service-start-hero compact">
        <div className="service-start-copy">
          <span className="service-route-label">{profile.billingScope.replaceAll('_', ' ')}</span>
          <h1>{profile.title}</h1>
          <p>{initializationComplete ? 'Setup is complete. FinClose now needs the prior information that explains where the books or payroll are starting from.' : companyInitializationRequired ? 'First register, then use an existing FinClose initialization or complete the initialization form. Nothing else is shown until this is done.' : 'This service needs registration only. No company initialization is required.'}</p>
        </div>
        <div className="phase-strip" aria-label="FinClose onboarding phases">
          <span className={!initializationComplete ? 'current' : 'complete'}>1 · Registration / initialization</span>
          <span className={initializationComplete && !historyComplete ? 'current' : historyComplete ? 'complete' : ''}>2 · Prior information</span>
          <span className={historyComplete ? 'current' : ''}>3 · System connection</span>
        </div>
      </section>

      {!initializationComplete && <section className="focus-panel">
        <div className="focus-kicker">STEP 1</div>
        <h2>Registration {companyInitializationRequired ? '& company initialization' : ''}</h2>
        <p className="focus-lead">{companyInitializationRequired ? 'Register the service first. Then either link an already initialized company such as MDA, or use the existing FinClose initialization form.' : 'Register the person requesting the service. FinClose does not require a company initialization for a balance-books review.'}</p>

        {!deployment ? <div className="setup-block">
          <h3>Register</h3>
          <label><span>Lab access token</span><input type="password" value={token} onChange={e => saveToken(e.target.value)} placeholder="FINCLOSE_LAB_TOKEN" /></label>
          <div className="service-form-row">
            <label><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            <label><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          </div>
          {profile.countryRequiredAtRegistration && <label><span>Company country</span><select value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>}
          <button className="service-primary" onClick={register} disabled={busy}>Continue</button>
        </div> : companyInitializationRequired ? <div className="initialization-choice-grid">
          <div className="setup-block">
            <span className="choice-label">Already initialized</span>
            <h3>Use an existing FinClose company</h3>
            <p>MDA was initialized earlier. If its country matches this registration, it will appear in this list.</p>
            <button className="service-secondary" onClick={() => loadCompanies(deployment.country_code || country)} disabled={busy}>Refresh initialized companies</button>
            {companies.length ? <>
              <label><span>Initialized company</span><select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.legal_name} · {c.country_name || c.country_code}</option>)}</select></label>
              <button className="service-primary" onClick={linkExistingCompany} disabled={busy || !selectedCompanyId}>Use this initialization</button>
            </> : <div className="service-waiting">No matching initialized company loaded yet.</div>}
          </div>

          <div className="setup-block">
            <span className="choice-label">New initialization</span>
            <h3>Initialize another company</h3>
            <p>Use the country initialization workbook we already created. Company initialization does not expand the service or billing scope you selected.</p>
            <label><span>Country</span><select value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <div className="inline-actions">
              <button className="service-secondary" onClick={requestTemplate} disabled={busy}>Prepare initialization form</button>
              {downloadUrl && <a className="service-download" href={downloadUrl}>Download XLSX</a>}
            </div>
            <label><span>Completed initialization form</span><input className="service-file" type="file" accept=".xlsx" onChange={e => setInitFile(e.target.files?.[0] || null)} /></label>
            <button className="service-primary" onClick={validateAndInitialize} disabled={busy || !initFile}>Validate & initialize</button>
            {initRecord && <div className={initRecord.ready ? 'service-complete' : 'service-waiting'}>{initRecord.ready ? `${initRecord.legal_name} validated` : (initRecord.blockers || []).map(b => b.message).join(' · ')}</div>}
          </div>
        </div> : null}
      </section>}

      {initializationComplete && !historyComplete && <section className="focus-panel">
        <div className="completed-line"><span>✓</span> Step 1 complete{deployment?.company_name ? ` · ${deployment.company_name}` : ' · registration only'}</div>
        <div className="focus-kicker">STEP 2</div>
        <h2>Upload prior information</h2>
        <p className="focus-lead">This is not another initialization. It gives FinClose the historical context needed to understand balances, patterns, open items and prior payroll/accounting decisions before touching the current system.</p>

        <div className="history-layout">
          <div className="history-guidance">
            <h3>Useful history for this service</h3>
            <ul>{(HISTORY_GUIDANCE[serviceKey] || []).map(item => <li key={item}>{item}</li>)}</ul>
            <p>Upload what you have. Multiple files are allowed.</p>
          </div>
          <div className="setup-block history-upload">
            <label><span>Prior files</span><input className="service-file" type="file" multiple accept=".xlsx,.xls,.csv,.pdf" onChange={e => setHistoryFiles(Array.from(e.target.files || []))} /></label>
            {historyFiles.length > 0 && <div className="file-count">{historyFiles.length} file{historyFiles.length === 1 ? '' : 's'} selected</div>}
            <button className="service-primary" onClick={uploadHistory} disabled={busy || !historyFiles.length}>Upload prior information</button>
            {linkedCompanyStage === 'NEW' && <button className="text-action" onClick={skipHistoryForNewCompany} disabled={busy}>No prior information — this is a new company</button>}
          </div>
        </div>
      </section>}

      {historyComplete && <section className="focus-panel">
        <div className="completed-line"><span>✓</span> Registration / initialization complete</div>
        <div className="completed-line"><span>✓</span> Prior information {deployment?.history_status === 'NOT_APPLICABLE_NEW_COMPANY' ? 'not applicable for new company' : 'received'}</div>
        <div className="focus-kicker">STEP 3</div>
        <h2>Connect the current system</h2>
        <p className="focus-lead">Only now does FinClose ask for ongoing/current source access. The connector is restricted to the service selected on the homepage.</p>

        <div className="connector-grid refined">
          {visibleConnectors.map(connector => (
            <button key={connector.id} className={`connector-card ${selectedConnector?.id === connector.id ? 'selected' : ''}`} onClick={() => chooseConnector(connector)} disabled={busy}>
              <span className="connector-name">{connector.name}</span>
              <span className="connector-method">{connector.method}</span>
              <span className={`connector-state ${connector.configured ? 'ready' : ''}`}>{connector.state.replaceAll('_', ' ')}</span>
            </button>
          ))}
        </div>
        {selectedConnector && <div className="connector-note">{selectedConnector.note}</div>}

        {selectedConnector?.id === 'manual-upload' && <div className="setup-block current-source">
          <h3>Current operating source</h3>
          <p>This is separate from the historical files above.</p>
          <input className="service-file" type="file" onChange={e => setSourceFile(e.target.files?.[0] || null)} />
          <button className="service-primary" onClick={uploadCurrentSource} disabled={busy || !sourceFile}>Send current source</button>
        </div>}
      </section>}

      <div className="service-status-note">{note}</div>
      <footer className="home-footer"><span>Setup first</span><span>History second</span><span>Current system third</span></footer>
    </main>
  );
}
