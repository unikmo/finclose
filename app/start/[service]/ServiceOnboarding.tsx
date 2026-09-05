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
type User = { user_id: string; name: string; email: string };
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
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
  const [historyResults, setHistoryResults] = useState<Array<{ filename: string; status: string; sha256: string }>>([]);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [note, setNote] = useState('Sign in or create an account to continue.');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const profile = useMemo(() => profiles.find(p => p.key === serviceKey) || null, [profiles, serviceKey]);
  const companyInitializationRequired = serviceKey !== 'balance-books';
  const companyComplete = Boolean(user && (!companyInitializationRequired || deployment?.company_id));
  const historyComplete = Boolean(deployment && (deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY' || historyResults.length));
  const effectiveCountry = String(deployment?.country_code || country || '').toUpperCase();
  const visibleConnectors = useMemo(() => profile ? profile.connectors.filter(c => connectorFits(profile, c, effectiveCountry)) : [], [profile, effectiveCountry]);

  const phases = companyInitializationRequired
    ? ['Account', 'Company', 'Prior information', 'System connection']
    : ['Account', 'Prior information', 'System connection'];
  const currentPhase = !user ? 0 : companyInitializationRequired && !companyComplete ? 1 : !historyComplete ? (companyInitializationRequired ? 2 : 1) : (companyInitializationRequired ? 3 : 2);

  useEffect(() => {
    Promise.all([
      fetch('/api/service-deployments/catalog').then(r => r.json()),
      fetch('/api/initialization/countries').then(r => r.json()),
      fetch('/api/account/session').then(r => r.json())
    ]).then(([catalog, countryList, session]) => {
      setProfiles(catalog);
      setCountries(countryList);
      setUser(session.authenticated ? session.user : null);
      setAuthReady(true);
    }).catch(() => {
      setAuthReady(true);
      setNote('Could not load FinClose setup information.');
    });
  }, []);

  useEffect(() => {
    if (!user || !profile || deployment || restoring) return;
    const stored = sessionStorage.getItem(`fincloseDeployment:${serviceKey}`);
    if (!stored) {
      if (!companyInitializationRequired) void createDeployment();
      return;
    }
    setRestoring(true);
    api(`/service-deployments/${stored}`)
      .then(async result => {
        setDeployment(result);
        if (companyInitializationRequired && !result.company_id) await loadCompanies(result.country_code || country);
        setNote('Previous onboarding session restored.');
      })
      .catch(() => sessionStorage.removeItem(`fincloseDeployment:${serviceKey}`))
      .finally(() => setRestoring(false));
  }, [user, profile]);

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

  async function submitAccount() {
    setBusy(true);
    try {
      const result = await api(`/account/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(authMode === 'register' ? { name, email, password } : { email, password })
      });
      setUser(result.user);
      setPassword('');
      setNote(authMode === 'register' ? 'Account created. Continue with the company setup this service requires.' : 'Signed in. Continue where you left off.');
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try {
      await api('/account/logout', { method: 'POST' });
      setUser(null);
      setDeployment(null);
      setCompanies([]);
      setHistoryResults([]);
      setSelectedConnector(null);
      setNote('Signed out.');
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function createDeployment(selectedCountry?: string) {
    if (!profile || !user) return null;
    setBusy(true);
    try {
      const result = await api('/service-deployments/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: serviceKey, country_code: profile.countryRequiredAtRegistration ? (selectedCountry || country) : undefined })
      });
      setDeployment(result);
      sessionStorage.setItem(`fincloseDeployment:${serviceKey}`, result.deployment_id);
      if (companyInitializationRequired) {
        const existing = await loadCompanies(result.country_code || selectedCountry || country);
        setNote(existing.length ? 'Choose a previously initialized company or initialize another one.' : 'No initialized company was found for this country. Use the initialization form.');
      } else {
        setNote('Account confirmed. Add prior accounting information so FinClose can understand the books before current-system access.');
      }
      return result;
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
      return null;
    } finally { setBusy(false); }
  }

  async function loadCompanies(expectedCountry?: string) {
    const list: Company[] = await api('/companies');
    const wanted = String(expectedCountry || country || '').toUpperCase();
    const filtered = wanted ? list.filter(c => !c.country_code || String(c.country_code).toUpperCase() === wanted) : list;
    setCompanies(filtered);
    setSelectedCompanyId(filtered[0]?.company_id || '');
    return filtered;
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
      setNote(`${result.company?.legal_name || 'Company'} connected. Next, upload prior information for context.`);
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
      setNote('Initialization form ready. Complete it, then upload it here.');
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
      setNote(`${linked.company?.legal_name || record.legal_name} initialized. Next, provide prior information for context.`);
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
      setDeployment(await api(`/service-deployments/${deployment.deployment_id}`));
      setNote(`${received.length} prior file${received.length === 1 ? '' : 's'} received. Current-system connection is now available.`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function skipHistoryForNewCompany() {
    if (!deployment) return;
    setBusy(true);
    try {
      setDeployment(await api(`/service-deployments/${deployment.deployment_id}/history/skip`, { method: 'POST' }));
      setNote('No prior information is required because the company is marked NEW.');
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
      if (connector.id === 'manual-upload') setNote('Secure file upload selected for current operating data.');
      else if (result.connector.configured) setNote(`${connector.name} is provider-configured; customer authorization still needs the secure provider callback flow.`);
      else setNote(`${connector.name} is not live-authorized in the Lab yet.`);
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

  function phaseClass(index: number) {
    if (index < currentPhase) return 'complete';
    if (index === currentPhase) return 'current';
    return '';
  }

  if (!profile || !authReady) return <main className="service-start-shell"><div className="service-loading">Loading FinClose…</div></main>;

  const heroText = !user
    ? 'Start with your FinClose account. After that, we ask only for the company information this service actually needs.'
    : companyInitializationRequired && !companyComplete
      ? 'You are signed in. Next, connect an already initialized company or initialize a new one.'
      : !historyComplete
        ? 'Setup is complete. Now give FinClose the prior information needed to understand the starting position.'
        : 'Prior context is in place. You can now connect the current accounting or payroll system.';

  return (
    <main className="service-start-shell">
      <header className="service-start-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span className="home-brand-copy"><strong>FinClose</strong><small>Account first · company second</small></span>
        </Link>
        <div className="service-nav-actions">
          {user && <span className="signed-in-as">{user.email}</span>}
          {user && <button className="nav-signout" onClick={signOut} disabled={busy}>Sign out</button>}
          <Link href="/" className="service-back">← Change service</Link>
        </div>
      </header>

      <section className="service-start-hero compact">
        <div className="service-start-copy">
          <span className="service-route-label">{profile.billingScope.replaceAll('_', ' ')}</span>
          <h1>{profile.title}</h1>
          <p>{heroText}</p>
        </div>
        <div className="phase-strip" aria-label="FinClose onboarding phases">
          {phases.map((phase, index) => <span className={phaseClass(index)} key={phase}>{index + 1} · {phase}</span>)}
        </div>
      </section>

      {!user && <section className="focus-panel auth-panel">
        <div className="focus-kicker">STEP 1</div>
        <h2>{authMode === 'register' ? 'Create your account' : 'Sign in'}</h2>
        <p className="focus-lead">Your service choice is already known. Sign in if you have a FinClose account, or register once. No technical access token is required.</p>

        <div className="auth-switch" role="tablist" aria-label="Account access">
          <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button>
          <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
        </div>

        <div className="setup-block account-form">
          {authMode === 'register' && <label><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>}
          <label><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} /></label>
          {authMode === 'register' && <div className="field-hint">Use at least 10 characters.</div>}
          <button className="service-primary" onClick={submitAccount} disabled={busy || !email || !password || (authMode === 'register' && !name)}>{authMode === 'register' ? 'Create account & continue' : 'Sign in & continue'}</button>
        </div>
      </section>}

      {user && companyInitializationRequired && !companyComplete && <section className="focus-panel">
        <div className="completed-line"><span>✓</span> Account · {user.email}</div>
        <div className="focus-kicker">STEP 2</div>
        <h2>Company</h2>
        <p className="focus-lead">Now identify the company. If it has already been initialized in FinClose, reuse it. Otherwise complete the existing country initialization form once.</p>

        {!deployment ? <div className="setup-block company-country">
          <h3>Where is the company registered?</h3>
          <p>This selects the correct registration and accounting context before we look for an existing FinClose company.</p>
          <label><span>Company country</span><select value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
          <button className="service-primary" onClick={() => createDeployment(country)} disabled={busy}>Continue to company</button>
        </div> : <div className="initialization-choice-grid">
          <div className="setup-block">
            <span className="choice-label">Already initialized</span>
            <h3>Use an existing company</h3>
            <p>Previously initialized FinClose companies for {effectiveCountry} appear here. An existing company such as MDA is reused rather than initialized again.</p>
            <button className="service-secondary" onClick={() => loadCompanies(deployment.country_code || country)} disabled={busy}>Refresh companies</button>
            {companies.length ? <>
              <label><span>Initialized company</span><select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.legal_name} · {c.country_name || c.country_code}</option>)}</select></label>
              <button className="service-primary" onClick={linkExistingCompany} disabled={busy || !selectedCompanyId}>Use this company</button>
            </> : <div className="service-waiting">No matching initialized company is loaded for this country.</div>}
          </div>

          <div className="setup-block">
            <span className="choice-label">New to FinClose</span>
            <h3>Initialize this company</h3>
            <p>Use the initialization workbook already created for this country. Initialization is company setup; it does not add unrelated services.</p>
            <div className="inline-actions">
              <button className="service-secondary" onClick={requestTemplate} disabled={busy}>Prepare initialization form</button>
              {downloadUrl && <a className="service-download" href={downloadUrl}>Download XLSX</a>}
            </div>
            <label><span>Completed initialization form</span><input className="service-file" type="file" accept=".xlsx" onChange={e => setInitFile(e.target.files?.[0] || null)} /></label>
            <button className="service-primary" onClick={validateAndInitialize} disabled={busy || !initFile}>Validate & initialize</button>
            {initRecord && <div className={initRecord.ready ? 'service-complete' : 'service-waiting'}>{initRecord.ready ? `${initRecord.legal_name} validated` : (initRecord.blockers || []).map(b => b.message).join(' · ')}</div>}
          </div>
        </div>}
      </section>}

      {user && companyComplete && !historyComplete && deployment && <section className="focus-panel">
        <div className="completed-line"><span>✓</span> Account · {user.email}</div>
        {companyInitializationRequired && <div className="completed-line"><span>✓</span> Company · {deployment.company_name || 'initialized company'}</div>}
        <div className="focus-kicker">STEP {companyInitializationRequired ? '3' : '2'}</div>
        <h2>Upload prior information</h2>
        <p className="focus-lead">This is not another registration step. It gives FinClose the historical context needed to understand balances, open items and previous accounting or payroll decisions before current-system access.</p>

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

      {user && historyComplete && deployment && <section className="focus-panel">
        <div className="completed-line"><span>✓</span> Account</div>
        {companyInitializationRequired && <div className="completed-line"><span>✓</span> Company</div>}
        <div className="completed-line"><span>✓</span> Prior information {deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY' ? 'not applicable for new company' : 'received'}</div>
        <div className="focus-kicker">STEP {companyInitializationRequired ? '4' : '3'}</div>
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
      <footer className="home-footer"><span>Account first</span><span>Company only when required</span><span>History before current access</span></footer>
    </main>
  );
}
