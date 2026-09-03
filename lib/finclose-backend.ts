import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NextRequest } from 'next/server';

export type Country = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  countryRequirements: Array<[string, string, string, string]>;
};

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', currency: 'USD', timezone: 'America/New_York', countryRequirements: [['federal_ein','Federal EIN','YES','Employer tax identifier'],['employer_type','Employer type','YES','corporation | llc | partnership | sole_proprietor']] },
  { code: 'DE', name: 'Germany', currency: 'EUR', timezone: 'Europe/Berlin', countryRequirements: [['steuernummer','Steuernummer','YES','Company tax number'],['ust_id','USt-IdNr.','NO','VAT ID if applicable'],['betriebsnummer','Betriebsnummer','CONDITIONAL','Required when payroll enabled']] },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London', countryRequirements: [['paye_reference','PAYE reference','CONDITIONAL','Required when payroll enabled'],['accounts_office_reference','Accounts Office reference','CONDITIONAL','Required when payroll enabled'],['utr','UTR','NO','Unique Taxpayer Reference']] },
  { code: 'EE', name: 'Estonia', currency: 'EUR', timezone: 'Europe/Tallinn', countryRequirements: [['registry_code','Registry code','YES','Company registry code'],['vat_number','VAT number','NO','If registered']] },
  { code: 'GE', name: 'Georgia', currency: 'GEL', timezone: 'Asia/Tbilisi', countryRequirements: [['tax_id','Tax ID','YES','Company taxpayer identifier'],['pension_employer_profile','Pension employer profile','NO','If applicable']] },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', timezone: 'Africa/Douala', countryRequirements: [['niu','NIU','YES','Taxpayer identifier'],['cnps_employer_number','CNPS employer number','CONDITIONAL','Required when payroll enabled']] }
];

export function getCountry(code: string) {
  return COUNTRIES.find(c => c.code === code.toUpperCase());
}

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  const parsed = JSON.parse(raw);
  if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
  return parsed;
}

export function firebaseApp() {
  if (getApps().length) return getApps()[0];
  const account = serviceAccount();
  return initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
  });
}

export function firestore() { return getFirestore(firebaseApp()); }
export function storageBucket() {
  if (!process.env.FIREBASE_STORAGE_BUCKET) throw new Error('FIREBASE_STORAGE_BUCKET is not configured');
  return getStorage(firebaseApp()).bucket(process.env.FIREBASE_STORAGE_BUCKET);
}

export function assertLabToken(req: NextRequest) {
  const expected = process.env.FINCLOSE_LAB_TOKEN;
  if (!expected) throw new Error('FINCLOSE_LAB_TOKEN is not configured');
  const supplied = req.headers.get('x-finclose-lab-token');
  if (!supplied || supplied !== expected) {
    const err = new Error('invalid lab access token');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
}
export function statusFor(error: unknown) { return (error as { status?: number })?.status || 500; }

function fieldSheet(title: string, subtitle: string, rows: Array<[string,string,string,string,string]>) {
  return XLSX.utils.aoa_to_sheet([[title], [subtitle], [], ['Field ID','Field','Value','Required','Guidance'], ...rows]);
}

export function buildTemplate(country: Country) {
  const wb = XLSX.utils.book_new();
  const companyRows: Array<[string,string,string,string,string]> = [
    ['template_version','Template version','1.0','YES','Do not change.'],
    ['template_country','Country template',country.code,'YES',country.name],
    ['legal_name','Legal company name','','YES','As registered.'],
    ['trading_name','Trading name','','NO','If different.'],
    ['entity_type','Entity type','corporation','YES','corporation | llc | partnership | sole_proprietor'],
    ['registration_number','Registration number','','YES','Company registry identifier.'],
    ['service_scope','FinClose service scope','BOOKKEEPING_AND_PAYROLL','YES','BOOKKEEPING_ONLY | PAYROLL_ONLY | BOOKKEEPING_AND_PAYROLL'],
    ['company_stage','Company stage','EXISTING','YES','NEW | EXISTING'],
    ['base_currency','Base currency',country.currency,'YES','Functional/base accounting currency.'],
    ['timezone','Company timezone',country.timezone,'YES','IANA timezone.'],
    ['fiscal_year_start','Fiscal year start','2026-01-01','YES','YYYY-MM-DD.'],
    ['cutover_date','FinClose cutover date','2026-01-01','YES','First date FinClose owns the new operating process.'],
    ['source_as_of_date','Source system as-of date','2025-12-31','YES','Last trusted date from predecessor/source system.'],
    ['finance_admin_email','Finance admin email','','YES','Operational finance contact.'],
    ['payroll_approver_email','Payroll approver email','','CONDITIONAL','Required if payroll is enabled.'],
    ['authorized_signatory_email','Authorized signatory email','','NO','Approval/filing authority contact.'],
    ['execution_authority','Execution authority','PREPARE_ONLY','YES','PREPARE_ONLY | APPROVAL_REQUIRED | STANDING_AUTHORIZATION']
  ];
  XLSX.utils.book_append_sheet(wb, fieldSheet('Company Setup','Core identity, operating scope, accounting cutover and governance',companyRows),'Company Setup');
  XLSX.utils.book_append_sheet(wb, fieldSheet(`${country.name} — Standing Requirements`,'Country-specific company identifiers and standing configuration',country.countryRequirements.map(([id,label,required,guidance])=>[id,label,'',required,guidance])),'Country Requirements');
  XLSX.utils.book_append_sheet(wb, fieldSheet('Payroll Setup','Complete when service scope includes payroll',[
    ['payroll_country','Payroll country',country.code,'CONDITIONAL','Required when payroll enabled.'],
    ['pay_frequency','Pay frequency','monthly','CONDITIONAL','monthly | semimonthly | biweekly | weekly'],
    ['first_finclose_pay_date','First FinClose pay date','2026-01-31','CONDITIONAL','YYYY-MM-DD.'],
    ['workweek_timezone','Workweek timezone',country.timezone,'CONDITIONAL','IANA timezone.'],
    ['historical_payroll_ytd_available','Historical payroll YTD available','YES','CONDITIONAL','YES / NO / NOT_APPLICABLE.']
  ]),'Payroll Setup');
  XLSX.utils.book_append_sheet(wb, fieldSheet('Historical Takeover','Source-system standing and opening-data availability',[
    ['last_closed_period','Last closed period','2025-12','CONDITIONAL','Required for existing companies.'],
    ['trial_balance_available','Trial balance available','YES','NO','Opening data uploaded separately.'],
    ['open_ar_available','Open AR available','YES','NO','Opening data uploaded separately.'],
    ['open_ap_available','Open AP available','YES','NO','Opening data uploaded separately.'],
    ['bank_statements_available','Bank statements available','YES','NO','Uploaded separately; no credentials.'],
    ['payroll_history_available','Payroll history available','YES','CONDITIONAL','Required as applicable for payroll takeover.']
  ]),'Historical Takeover');
  XLSX.utils.book_append_sheet(wb, fieldSheet('Attestation','Confirm the initialization facts are complete enough for FinClose to validate',[
    ['authorized_to_provide','Authorized to provide company data','','YES','YES required.'],
    ['data_is_synthetic','Data is synthetic/test data','YES','YES','For the Lab this must be YES.'],
    ['information_complete_to_best_knowledge','Information complete to best knowledge','','YES','YES required.'],
    ['prepared_by','Prepared by','','YES','Name or role.'],
    ['prepared_date','Prepared date','2026-09-03','YES','YYYY-MM-DD.']
  ]),'Attestation');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function readFieldMap(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return {} as Record<string,string>;
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: false, defval: '' });
  const values: Record<string,string> = {};
  for (const row of rows.slice(4)) {
    const id = String(row[0] || '').trim();
    if (id) values[id] = String(row[2] || '').trim();
  }
  return values;
}

export function parseInitialization(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const company = readFieldMap(workbook, 'Company Setup');
  const attestation = readFieldMap(workbook, 'Attestation');
  const country = getCountry(company.template_country || '');
  const blockers: Array<{message:string}> = [];
  for (const id of ['legal_name','template_country','service_scope','company_stage','base_currency','timezone','cutover_date']) if (!company[id]) blockers.push({ message: `Missing required field: ${id}` });
  if (!country) blockers.push({ message: `Unsupported country: ${company.template_country || '(blank)'}` });
  if (attestation.data_is_synthetic !== 'YES') blockers.push({ message: 'Lab requires data_is_synthetic = YES' });
  if (attestation.authorized_to_provide && attestation.authorized_to_provide !== 'YES') blockers.push({ message: 'authorized_to_provide must be YES' });
  return { company, country, blockers, warnings: [] as Array<{message:string}> };
}

export function workbookMetadata(buffer: Buffer, filename: string) {
  if (!/\.xlsx$/i.test(filename)) return {};
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet_rows: Record<string,number> = {};
    for (const name of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null });
      sheet_rows[name] = rows.filter(row => Array.isArray(row) && row.some(v => v !== null && v !== '')).length;
    }
    return { sheet_rows };
  } catch { return {}; }
}

export type InitRecord = { initialization_id:string; filename:string; legal_name:string; country_code:string; country_name:string; service_scope:string; status:string; ready:boolean; blockers:Array<{message:string}>; warnings:Array<{message:string}>; company_id?:string };
function plainInit(data: Record<string, unknown>): InitRecord {
  return { initialization_id:String(data.initialization_id), filename:String(data.filename), legal_name:String(data.legal_name||''), country_code:String(data.country_code||''), country_name:String(data.country_name||''), service_scope:String(data.service_scope||''), status:String(data.status||''), ready:Boolean(data.ready), blockers:(data.blockers||[]) as Array<{message:string}>, warnings:(data.warnings||[]) as Array<{message:string}>, company_id:data.company_id?String(data.company_id):undefined };
}

export async function saveInitialization(filename: string, buffer: Buffer) {
  const parsed = parseInitialization(buffer); const id = crypto.randomUUID(); const ready = parsed.blockers.length === 0;
  const record = { initialization_id:id, filename, legal_name:parsed.company.legal_name||'', country_code:parsed.country?.code||parsed.company.template_country||'', country_name:parsed.country?.name||'', base_currency:parsed.company.base_currency||parsed.country?.currency||'', timezone:parsed.company.timezone||parsed.country?.timezone||'', service_scope:parsed.company.service_scope||'', company_stage:parsed.company.company_stage||'', cutover_date:parsed.company.cutover_date||'', source_as_of_date:parsed.company.source_as_of_date||'', registration_number:parsed.company.registration_number||'', finance_admin_email:parsed.company.finance_admin_email||'', status:ready?'READY':'BLOCKED', ready, blockers:parsed.blockers, warnings:parsed.warnings, created_at:FieldValue.serverTimestamp() };
  await firestore().collection('finclose_initializations').doc(id).set(record);
  await firestore().collection('finclose_audit_events').add({ event:'INITIALIZATION_VALIDATED', initialization_id:id, status:record.status, created_at:FieldValue.serverTimestamp() });
  return plainInit(record);
}

export async function initializeCompany(initializationId: string) {
  const db = firestore(); const ref = db.collection('finclose_initializations').doc(initializationId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) { const e=new Error('initialization not found'); (e as any).status=404; throw e; }
    const init=snap.data()!;
    if (!init.ready) { const e=new Error('initialization has blockers'); (e as any).status=409; throw e; }
    if (init.company_id) return plainInit(init);
    const companyId=crypto.randomUUID(); const companyRef=db.collection('finclose_companies').doc(companyId);
    tx.set(companyRef,{ company_id:companyId, legal_name:init.legal_name, country_code:init.country_code, country_name:init.country_name, base_currency:init.base_currency, timezone:init.timezone, service_scope:init.service_scope, company_stage:init.company_stage, cutover_date:init.cutover_date, source_as_of_date:init.source_as_of_date, registration_number:init.registration_number, status:'INITIALIZED', initialization_id:initializationId, created_at:FieldValue.serverTimestamp() });
    tx.update(ref,{ company_id:companyId, status:'INITIALIZED', initialized_at:FieldValue.serverTimestamp() });
    tx.set(db.collection('finclose_audit_events').doc(),{ event:'COMPANY_INITIALIZED', initialization_id:initializationId, company_id:companyId, created_at:FieldValue.serverTimestamp() });
    return plainInit({ ...init, company_id:companyId, status:'INITIALIZED' });
  });
}

export async function listCompanies() {
  const snap=await firestore().collection('finclose_companies').orderBy('created_at','desc').limit(100).get();
  return snap.docs.map(doc=>{const d=doc.data();return {company_id:d.company_id,legal_name:d.legal_name,country_code:d.country_code,country_name:d.country_name,base_currency:d.base_currency,service_scope:d.service_scope,status:d.status};});
}
function safeFilename(name:string){return name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180)||'upload.bin';}
function contentType(name:string){if(/\.xlsx$/i.test(name))return'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';if(/\.csv$/i.test(name))return'text/csv';if(/\.pdf$/i.test(name))return'application/pdf';return'application/octet-stream';}

export async function saveDataChunk(companyId:string,stage:string,filename:string,buffer:Buffer){
  const db=firestore(); const companySnap=await db.collection('finclose_companies').doc(companyId).get();
  if(!companySnap.exists){const e=new Error('company not found');(e as any).status=404;throw e;} const company=companySnap.data()!;
  const sha256=crypto.createHash('sha256').update(buffer).digest('hex'); const importId=`${companyId}__${sha256}`; const importRef=db.collection('finclose_data_imports').doc(importId); const existing=await importRef.get();
  if(existing.exists)return{...existing.data(),status:'ALREADY_RECEIVED'};
  const path=`finclose/${companyId}/${stage}/${crypto.randomUUID()}/${safeFilename(filename)}`;
  await storageBucket().file(path).save(buffer,{resumable:false,metadata:{contentType:contentType(filename),metadata:{companyId,stage,sha256}}});
  const record={import_id:importId,company_id:companyId,country_code:company.country_code,country_name:company.country_name,base_currency:company.base_currency,stage,filename,bytes:buffer.length,sha256,storage_path:path,metadata:workbookMetadata(buffer,filename),status:'RECEIVED',created_at:FieldValue.serverTimestamp()};
  await importRef.set(record); await db.collection('finclose_audit_events').add({event:'DATA_CHUNK_RECEIVED',company_id:companyId,import_id:importId,stage,sha256,created_at:FieldValue.serverTimestamp()}); return record;
}
