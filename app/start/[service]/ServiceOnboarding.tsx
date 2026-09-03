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

type Deployment = {
  deployment_id: string;
  service: string;
  service_title: string;
  billing_scope: string;
  agents: string[];
  full_company_initialization_required: boolean;
  country_code?: string | null;
  configuration?: Record<string, string>;
  selected_connector?: string | null;
  connector_state?: string | null;
  status: string;
};

const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'FinClose Orchestrator',
  reconciliation: 'Close & Reconciliation Agent',
  bookkeeping: 'Bookkeeping Agent',
  payroll: 'Payroll Agent'
};

export default function ServiceOnboarding({ serviceKey }: { serviceKey: string }) {
  const [token, setToken] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('GE');
  const [legalName, setLegalName] = useState('');
  const [payFrequency, setPayFrequency] = useState('monthly');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [note, setNote] = useState('Enter the Lab access token, then register for this service.');
  const [busy, setBusy] = useState(false);

  const profile = useMemo(() => profiles.find(p => p.key === serviceKey) || null, [profiles, serviceKey]);

  useEffect(() => {
    setToken(sessionStorage.getItem('fincloseLabToken') || '');
    Promise.all([
      fetch('/api/service-deployments/catalog').then(r => r.json()),
      fetch('/api/initialization/countries').then(r => r.json())
    ]).then(([catalog, countryList]) => {
      setProfiles(catalog);
      setCountries(countryList);
    }).catch(() => setNote('Could not load the FinClose service catalog.'));
  }, []);

  function saveToken(value: string) {
    setToken(value);
    sessionStorage.setItem('fincloseLabToken', value);
  }

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('x-finclose-lab-token', token);
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

  async function register() {
    if (!profile) return;
    setBusy(true);
    try {
      const result = await api('/service-deployments/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: serviceKey,
          name,
          email,
          country_code: profile.countryRequiredAtRegistration ? country : undefined
        })
      });
      setDeployment(result);
      setNote(profile.configurationFields.length
        ? 'Registered. Add only the essentials required for this service.'
        : 'Registered. No company initialization is required — connect the accounting source next.');
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function saveConfiguration() {
    if (!deployment || !profile) return;
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (profile.configurationFields.includes('legal_name')) payload.legal_name = legalName;
      if (profile.configurationFields.includes('country_code')) payload.country_code = country;
      if (profile.configurationFields.includes('pay_frequency')) payload.pay_frequency = payFrequency;
      const result = await api(`/service-deployments/${deployment.deployment_id}/configuration`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setDeployment(result);
      setNote('Service essentials saved. Nothing outside this deployment scope was requested.');
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
      if (connector.id === 'manual-upload') {
        setNote('Secure file upload selected. Upload a source file and FinClose can prepare the selected agent deployment.');
      } else if (result.connector.configured) {
        setNote(`${connector.name} provider credentials are present. OAuth/API authorization still needs its secure token callback before live customer use.`);
      } else {
        setNote(`${connector.name} is in the connector layer but still needs provider/customer API credentials before live authorization.`);
      }
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function uploadSource() {
    if (!deployment || !sourceFile) return;
    setBusy(true);
    try {
      const result = await api(`/service-deployments/${deployment.deployment_id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: sourceFile.name, content_base64: await base64(sourceFile) })
      });
      setDeployment({ ...deployment, status: result.status === 'ALREADY_RECEIVED' ? deployment.status : 'READY_FOR_AGENT' });
      setNote(`${result.status}: source received for ${profile?.title}. SHA ${String(result.sha256).slice(0, 12)}…`);
    } catch (error: any) {
      setNote(`Error: ${error.message}`);
    } finally { setBusy(false); }
  }

  if (!profile) {
    return <main className="service-start-shell"><div className="service-loading">Loading FinClose service…</div></main>;
  }

  const configurationRequired = profile.configurationFields.length > 0;
  const configurationSaved = !configurationRequired || Boolean(deployment?.configuration && Object.keys(deployment.configuration).length);

  return (
    <main className="service-start-shell">
      <header className="service-start-nav">
        <Link href="/" className="home-brand" aria-label="FinClose home">
          <span className="home-logo">F</span>
          <span className="home-brand-copy"><strong>FinClose</strong><small>Deploy only what you need</small></span>
        </Link>
        <Link href="/" className="service-back">← Change service</Link>
      </header>

      <section className="service-start-hero">
        <div className="service-start-copy">
          <span className="service-route-label">{profile.billingScope.replaceAll('_', ' ')}</span>
          <h1>{profile.title}</h1>
          <p>{profile.description}</p>
          <div className="deployment-facts">
            <span>{profile.fullCompanyInitializationRequired ? 'Company initialization: required' : 'Company initialization: not required'}</span>
            <span>Billing: this service only</span>
            <span>Access: {profile.connectorAccess.replaceAll('-', ' ')}</span>
          </div>
        </div>
        <aside className="agent-deployment-card">
          <div className="agent-title">Agent deployment</div>
          {profile.agents.map(agent => <div key={agent} className="agent-row"><span className="agent-dot" />{AGENT_LABELS[agent] || agent}</div>)}
          <div className="agent-boundary">No unrelated agent is activated.</div>
        </aside>
      </section>

      <section className="service-workflow">
        <article className={`service-step ${deployment ? 'done' : 'active'}`}>
          <div className="service-step-number">01</div>
          <div className="service-step-body">
            <h2>Register</h2>
            <p>This creates the service deployment record. It is not a full company initialization.</p>
            {!deployment ? <>
              <label><span>Lab access token</span><input type="password" value={token} onChange={e => saveToken(e.target.value)} placeholder="FINCLOSE_LAB_TOKEN" /></label>
              <div className="service-form-row">
                <label><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
                <label><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
              </div>
              {profile.countryRequiredAtRegistration && <label><span>Country</span><select value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>}
              <button className="service-primary" onClick={register} disabled={busy}>Register for this service</button>
            </> : <div className="service-complete">Registered · deployment {deployment.deployment_id.slice(0, 8)}</div>}
          </div>
        </article>

        {configurationRequired && <article className={`service-step ${configurationSaved ? 'done' : deployment ? 'active' : ''}`}>
          <div className="service-step-number">02</div>
          <div className="service-step-body">
            <h2>Service essentials</h2>
            <p>Only fields required by {profile.title} are requested.</p>
            {deployment && !configurationSaved ? <>
              {profile.configurationFields.includes('legal_name') && <label><span>Legal company name</span><input value={legalName} onChange={e => setLegalName(e.target.value)} /></label>}
              {profile.configurationFields.includes('country_code') && <label><span>Country</span><select value={country} onChange={e => setCountry(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>}
              {profile.configurationFields.includes('pay_frequency') && <label><span>Pay frequency</span><select value={payFrequency} onChange={e => setPayFrequency(e.target.value)}><option value="monthly">Monthly</option><option value="semimonthly">Semi-monthly</option><option value="biweekly">Biweekly</option><option value="weekly">Weekly</option></select></label>}
              <button className="service-primary" onClick={saveConfiguration} disabled={busy}>Save essentials</button>
            </> : configurationSaved && deployment ? <div className="service-complete">Essentials complete</div> : <div className="service-waiting">Complete registration first.</div>}
          </div>
        </article>}

        <article className={`service-step ${selectedConnector ? 'done' : deployment && configurationSaved ? 'active' : ''}`}>
          <div className="service-step-number">{configurationRequired ? '03' : '02'}</div>
          <div className="service-step-body">
            <h2>Connect your system</h2>
            <p>The connector layer is shared across agents, but each service receives only the access it needs.</p>
            {deployment && configurationSaved ? <div className="connector-grid">
              {profile.connectors.map(connector => (
                <button key={connector.id} className={`connector-card ${selectedConnector?.id === connector.id ? 'selected' : ''}`} onClick={() => chooseConnector(connector)} disabled={busy}>
                  <span className="connector-name">{connector.name}</span>
                  <span className="connector-method">{connector.method}</span>
                  <span className={`connector-state ${connector.configured ? 'ready' : ''}`}>{connector.state.replaceAll('_', ' ')}</span>
                </button>
              ))}
            </div> : <div className="service-waiting">Complete the earlier step first.</div>}
            {selectedConnector && <div className="connector-note">{selectedConnector.note}</div>}
          </div>
        </article>

        <article className={`service-step ${deployment?.status === 'READY_FOR_AGENT' ? 'done' : selectedConnector ? 'active' : ''}`}>
          <div className="service-step-number">{configurationRequired ? '04' : '03'}</div>
          <div className="service-step-body">
            <h2>Provide source access</h2>
            {selectedConnector?.id === 'manual-upload' ? <>
              <p>Upload a synthetic source file. This path works without creating a FinClose company first.</p>
              <input className="service-file" type="file" onChange={e => setSourceFile(e.target.files?.[0] || null)} />
              <button className="service-primary" onClick={uploadSource} disabled={busy || !sourceFile}>Send source to selected agent</button>
            </> : selectedConnector ? <>
              <p>FinClose has selected the {selectedConnector.name} adapter. Provider authorization is intentionally blocked until its credentials, callback and secure token-vault controls are complete.</p>
              <div className="service-waiting">Connector state: {deployment?.connector_state?.replaceAll('_', ' ')}</div>
            </> : <div className="service-waiting">Choose a connector first.</div>}
          </div>
        </article>
      </section>

      <div className="service-status-note">{note}</div>
      <footer className="home-footer"><span>Service-specific deployment</span><span>Least-privilege connector access</span><span>No bundled features</span></footer>
    </main>
  );
}
