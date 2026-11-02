'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Country={code:string;name:string;currency:string};
type Company={company_id:string;legal_name:string;country_name:string;service_scope:string;status:string};
type InitRecord={initialization_id:string;filename:string;legal_name:string;country_name:string;service_scope:string;status:string;ready:boolean;blockers?:{message:string}[]};

type ServiceChoice={label:string;stage:string};
const SERVICES:Record<string,ServiceChoice>={
  'balance-books':{label:'Help me balance my books',stage:'opening_state'},
  payroll:{label:'Help me do payroll',stage:'payroll'},
  'do-bookkeeping':{label:'Do my bookkeeping',stage:'bookkeeping'},
  'bookkeeping-payroll':{label:'Bookkeeping & Payroll',stage:'bookkeeping'}
};

export default function Lab(){
  const [token,setToken]=useState(''); const [health,setHealth]=useState('Checking backend…');
  const [countries,setCountries]=useState<Country[]>([]); const [country,setCountry]=useState('GE'); const [download,setDownload]=useState('');
  const [companies,setCompanies]=useState<Company[]>([]); const [records,setRecords]=useState<InitRecord[]>([]); const [companyId,setCompanyId]=useState('');
  const [initFile,setInitFile]=useState<File|null>(null); const [dataFile,setDataFile]=useState<File|null>(null); const [stage,setStage]=useState('bookkeeping');
  const [selectedService,setSelectedService]=useState('');
  const [note,setNote]=useState('Enter the Lab token and verify Firebase.'); const [dataNote,setDataNote]=useState('Awaiting company data.');

  useEffect(()=>{
    setToken(sessionStorage.getItem('fincloseLabToken')||'');
    const serviceKey=new URLSearchParams(window.location.search).get('service')||'';
    const selected=SERVICES[serviceKey];
    if(selected){setSelectedService(selected.label);setStage(selected.stage);setNote(`Selected need: ${selected.label}`)}
    Promise.all([fetch('/api/health').then(r=>r.json()),fetch('/api/initialization/countries').then(r=>r.json())]).then(([h,c])=>{setHealth(`${h.hosting} + ${h.database} · v${h.version}${h.configured?' · configured':' · credentials pending'}`);setCountries(c)});
  },[]);
  function saveToken(v:string){setToken(v);sessionStorage.setItem('fincloseLabToken',v)}
  async function api(path:string,init:RequestInit={}){const headers=new Headers(init.headers||{});if(token)headers.set('x-finclose-lab-token',token);const r=await fetch('/api'+path,{...init,headers});const text=await r.text();let d:any;try{d=JSON.parse(text)}catch{d={detail:text}}if(!r.ok)throw new Error(d.detail||`HTTP ${r.status}`);return d}
  function b64(f:File){return new Promise<string>((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>fail(r.error);r.readAsDataURL(f)})}
  async function refresh(){try{const list=await api('/companies');setCompanies(list);setCompanyId((v:string)=>v&&list.some((c:Company)=>c.company_id===v)?v:(list[0]?.company_id||''));setNote(selectedService?`Firebase verified · ${selectedService}`:'Firebase connection verified.')}catch(e:any){setNote('Error: '+e.message)}}
  async function template(){try{const d=await api('/initialization/template/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country})});setDownload(d.download_url);setNote(d.note)}catch(e:any){setNote('Error: '+e.message)}}
  async function validate(){if(!initFile)return setNote('Choose an XLSX initialization file.');try{const d=await api('/initialization/upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:initFile.name,content_base64:await b64(initFile)})});setRecords((r)=>[...r,...d.records]);setNote('Initialization validated and stored in Firebase Realtime Database.')}catch(e:any){setNote('Error: '+e.message)}}
  async function initialize(id:string){try{const d=await api(`/initialization/${id}/initialize`,{method:'POST'});setRecords(r=>r.map(x=>x.initialization_id===id?d:x));await refresh();setNote(`${d.legal_name} initialized in Firebase Realtime Database.`)}catch(e:any){setNote('Error: '+e.message)}}
  async function upload(){if(!companyId)return setDataNote('Initialize a company first.');if(!dataFile)return setDataNote('Choose a data file.');try{const d=await api(`/companies/${companyId}/data-chunks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage,filename:dataFile.name,content_base64:await b64(dataFile)})});setDataNote(`${d.status}: ${d.filename} · ${d.country_name} · ${d.base_currency} · SHA ${String(d.sha256).slice(0,12)}…`)}catch(e:any){setDataNote('Error: '+e.message)}}

  return <><header className="top"><div className="topin"><Link href="/" className="brand brand-link"><div className="logo">F</div><div><b>FinClose Lab</b><small>Vercel + Firebase test environment</small></div></Link><div className="pills"><span className="pill">Vercel</span><span className="pill">v0.24</span><span className="pill">Firebase RTDB</span></div></div></header><main className="shell">
    <section className="hero"><div><span className="eyebrow">FINANCIAL OPERATIONS TEST LAB</span><h1>{selectedService||'FinClose workflow'}</h1><p>Company state is stored in Firebase Realtime Database and uploaded source files are stored in Firebase Storage. Use synthetic/test data only.</p><Link className="back-home" href="/">← Change what I need help with</Link></div><aside className="safe"><b>Backend check</b><p className={health.includes('configured')?'good':''}>{health}</p><p>Synthetic/test data only.</p></aside></section>
    <section className="grid">
      <div className="card"><div className="head"><h2>1 · Connect test backend</h2><p>Enter the private Lab token configured in Vercel.</p></div><div className="body"><label className="label"><span>Lab token</span><input className="input" type="password" value={token} onChange={e=>saveToken(e.target.value)} placeholder="FINCLOSE_LAB_TOKEN"/></label><div className="actions"><button className="button primary" onClick={refresh}>Verify Firebase</button></div><div className="note" style={{marginTop:12}}>{note}</div></div></div>
      <div className="card"><div className="head"><h2>2 · Get initialization template</h2><p>Generate a country-specific XLSX.</p></div><div className="body"><label className="label"><span>Country</span><select className="select" value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label><div className="actions"><button className="button primary" onClick={template}>Request template</button>{download&&<a href={download}><button className="button secondary">Download XLSX</button></a>}</div></div></div>
      <div className="card"><div className="head"><h2>3 · Validate + initialize</h2><p>Use the synthetic MDA workbook or a generated template.</p></div><div className="body"><input className="input file" type="file" accept=".xlsx" onChange={e=>setInitFile(e.target.files?.[0]||null)}/><div className="actions"><button className="button primary" onClick={validate}>Validate upload</button></div><div className="tablewrap" style={{marginTop:12}}><table><thead><tr><th>Status</th><th>Company</th><th>Country</th><th>Action</th></tr></thead><tbody>{records.length?records.map(r=><tr key={r.initialization_id}><td><span className={`badge ${r.ready?'ok':'bad'}`}>{r.status}</span></td><td>{r.legal_name}</td><td>{r.country_name}</td><td>{r.ready&&r.status!=='INITIALIZED'?<button className="button secondary" onClick={()=>initialize(r.initialization_id)}>Initialize</button>:'—'}</td></tr>):<tr><td colSpan={4} className="muted">No initialization uploaded.</td></tr>}</tbody></table></div></div></div>
      <div className="card"><div className="head"><h2>4 · Persistent companies</h2><p>Reload and verify the company still exists.</p></div><div className="body"><div className="tablewrap"><table><thead><tr><th>Company</th><th>Country</th><th>Scope</th><th>Status</th></tr></thead><tbody>{companies.length?companies.map(c=><tr key={c.company_id}><td><b>{c.legal_name}</b></td><td>{c.country_name}</td><td>{c.service_scope}</td><td><span className="badge ok">{c.status}</span></td></tr>):<tr><td colSpan={4} className="muted">No companies loaded.</td></tr>}</tbody></table></div></div></div>
      <div className="card full"><div className="head"><h2>5 · Upload company data</h2><p>The selected company provides jurisdiction context; Firebase Storage keeps the source file.</p></div><div className="body"><div className="row"><label className="label"><span>Company</span><select className="select" value={companyId} onChange={e=>setCompanyId(e.target.value)}>{companies.map(c=><option key={c.company_id} value={c.company_id}>{c.legal_name} · {c.country_name}</option>)}</select></label><label className="label"><span>Stage</span><select className="select" value={stage} onChange={e=>setStage(e.target.value)}><option value="bookkeeping">Bookkeeping</option><option value="opening_state">Opening state</option><option value="master_data">Master data</option><option value="payroll">Payroll</option></select></label></div><input className="input file" type="file" onChange={e=>setDataFile(e.target.files?.[0]||null)}/><div className="actions"><button className="button primary" onClick={upload}>Upload chunk</button></div><div className="note" style={{marginTop:12}}>{dataNote}</div></div></div>
    </section><div className="footer">FinClose Lab v0.24 · Vercel runtime · Firebase Realtime Database + Storage · synthetic-data test environment</div>
  </main></>;
}
