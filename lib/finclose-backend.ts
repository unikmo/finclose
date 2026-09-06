import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getStorage } from 'firebase-admin/storage';
import { NextRequest } from 'next/server';
import { validateFinancialUpload } from './file-security';
import { registerProductionCompany } from './production-ledger';
import { assertRealDataRuntimeReady, isRealDataMode, runtimeMode } from './runtime-mode';

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

const DEFAULT_DATABASE_URL = 'https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/';

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
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
  });
}

export function realtimeDatabase() { return getDatabase(firebaseApp()); }
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
  const synthetic = isRealDataMode() ? 'NO' : 'YES';
  const companyRows: Array<[string,string,string,string,string]> = [
    ['template_version','Template version','1.1','YES','Do not change.'],
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
    ['data_is_synthetic','Data is synthetic/test data',synthetic,'YES',isRealDataMode() ? 'Use NO for real company data and YES only for a test company.' : 'Lab requires YES.'],
    ['information_complete_to_best_knowledge','Information complete to best knowledge','','YES','YES required.'],
    ['prepared_by','Prepared by','','YES','Name or role.'],
    ['prepared_date','Prepared date','2026-09-06','YES','YYYY-MM-DD.']
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
  const warnings: Array<{message:string}> = [];
  for (const id of ['legal_name','template_country','service_scope','company_stage','base_currency','timezone','cutover_date']) if (!company[id]) blockers.push({ message: `Missing required field: ${id}` });
  if (!country) blockers.push({ message: `Unsupported country: ${company.template_country || '(blank)'}` });
  if (attestation.authorized_to_provide !== 'YES') blockers.push({ message: 'authorized_to_provide must be YES' });
  if (attestation.information_complete_to_best_knowledge !== 'YES') blockers.push({ message: 'information_complete_to_best_knowledge must be YES' });
  const synthetic = String(attestation.data_is_synthetic || '').toUpperCase();
  if (!['YES','NO'].includes(synthetic)) blockers.push({ message: 'data_is_synthetic must be YES or NO' });
  if (!isRealDataMode() && synthetic !== 'YES') blockers.push({ message: 'Lab requires data_is_synthetic = YES' });
  if (isRealDataMode() && synthetic === 'YES') warnings.push({ message: `${runtimeMode()} is configured for real data, but this initialization is explicitly synthetic.` });
  return { company, attestation, country, blockers, warnings };
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

export async function saveInitialization(filename: string, buffer: Buffer, ownership?: { organization_id?: string; owner_user_id?: string }) {
  if (isRealDataMode()) assertRealDataRuntimeReady();
  const validation = validateFinancialUpload(filename, buffer, 'initialization');
  const parsed = parseInitialization(buffer);
  const id = crypto.randomUUID();
  const ready = parsed.blockers.length === 0;
  const now = Date.now();
  const organizationId = String(ownership?.organization_id || '').trim();
  const ownerUserId = String(ownership?.owner_user_id || '').trim();
  if (isRealDataMode() && (!organizationId || !ownerUserId)) {
    const e = new Error('production initialization requires organization and authenticated owner identity');
    (e as Error & {status?:number}).status = 409;
    throw e;
  }
  const record = {
    initialization_id:id,
    runtime_mode: runtimeMode(),
    data_is_synthetic: String(parsed.attestation.data_is_synthetic || '').toUpperCase() === 'YES',
    organization_id: organizationId || null,
    owner_user_id: ownerUserId || null,
    filename: validation.safe_name,
    file_validation_status: validation.validation_status,
    legal_name:parsed.company.legal_name||'',
    country_code:parsed.country?.code||parsed.company.template_country||'',
    country_name:parsed.country?.name||'',
    base_currency:parsed.company.base_currency||parsed.country?.currency||'',
    timezone:parsed.company.timezone||parsed.country?.timezone||'',
    service_scope:parsed.company.service_scope||'',
    company_stage:parsed.company.company_stage||'',
    cutover_date:parsed.company.cutover_date||'',
    source_as_of_date:parsed.company.source_as_of_date||'',
    registration_number:parsed.company.registration_number||'',
    finance_admin_email:parsed.company.finance_admin_email||'',
    status:ready?'READY':'BLOCKED', ready, blockers:parsed.blockers, warnings:parsed.warnings, created_at:now
  };
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_initializations/${id}`]: record,
    [`finclose_audit_events/${auditKey}`]: { event:'INITIALIZATION_VALIDATED', initialization_id:id, organization_id:organizationId||null, owner_user_id:ownerUserId||null, runtime_mode:runtimeMode(), status:record.status, created_at:now }
  });
  return plainInit(record);
}

export async function initializeCompany(initializationId: string) {
  const db = realtimeDatabase();
  const snap = await db.ref(`finclose_initializations/${initializationId}`).once('value');
  if (!snap.exists()) { const e=new Error('initialization not found'); (e as Error & {status?:number}).status=404; throw e; }
  const init = snap.val() as Record<string, unknown>;
  if (!init.ready) { const e=new Error('initialization has blockers'); (e as Error & {status?:number}).status=409; throw e; }
  if (init.company_id) return plainInit(init);

  const companyId = initializationId;
  const organizationId = String(init.organization_id || '').trim();
  const ownerUserId = String(init.owner_user_id || '').trim();
  if (isRealDataMode() && (!organizationId || !ownerUserId)) {
    const e = new Error('production initialization is missing tenant ownership');
    (e as Error & {status?:number}).status = 409;
    throw e;
  }
  const now = Date.now();
  const company = {
    company_id:companyId,
    organization_id:organizationId||null,
    legal_name:init.legal_name,
    country_code:init.country_code,
    country_name:init.country_name,
    base_currency:init.base_currency,
    timezone:init.timezone,
    service_scope:init.service_scope,
    company_stage:init.company_stage,
    cutover_date:init.cutover_date,
    source_as_of_date:init.source_as_of_date,
    registration_number:init.registration_number,
    data_is_synthetic:init.data_is_synthetic===true,
    status:'INITIALIZED',
    initialization_id:initializationId,
    created_at:now
  };
  if (isRealDataMode()) {
    await registerProductionCompany({
      organization_id: organizationId,
      company_id: companyId,
      legal_name: String(init.legal_name || ''),
      country_code: String(init.country_code || ''),
      base_currency: String(init.base_currency || ''),
      actor_user_id: ownerUserId
    });
  }
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const updates: Record<string, unknown> = {
    [`finclose_companies/${companyId}`]: company,
    [`finclose_initializations/${initializationId}/company_id`]: companyId,
    [`finclose_initializations/${initializationId}/status`]: 'INITIALIZED',
    [`finclose_initializations/${initializationId}/initialized_at`]: now,
    [`finclose_audit_events/${auditKey}`]: { event:'COMPANY_INITIALIZED', initialization_id:initializationId, company_id:companyId, organization_id:organizationId||null, actor_user_id:ownerUserId||null, created_at:now }
  };
  if (organizationId) {
    updates[`finclose_company_ownership/${companyId}`] = { company_id:companyId, organization_id:organizationId, status:'ACTIVE', bound_by_user_id:ownerUserId, created_at:now, updated_at:now };
  }
  await db.ref().update(updates);
  return plainInit({ ...init, company_id:companyId, status:'INITIALIZED' });
}

export async function listCompanies() {
  const snap = await realtimeDatabase().ref('finclose_companies').once('value');
  const values = (snap.val() || {}) as Record<string, Record<string, unknown>>;
  return Object.values(values)
    .sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0))
    .slice(0,100)
    .map(d=>({company_id:d.company_id,legal_name:d.legal_name,country_code:d.country_code,country_name:d.country_name,base_currency:d.base_currency,service_scope:d.service_scope,status:d.status}));
}

export async function saveDataChunk(companyId:string,stage:string,filename:string,buffer:Buffer){
  if (isRealDataMode()) assertRealDataRuntimeReady();
  const db = realtimeDatabase();
  const companySnap = await db.ref(`finclose_companies/${companyId}`).once('value');
  if(!companySnap.exists()){const e=new Error('company not found');(e as Error & {status?:number}).status=404;throw e;}
  const company = companySnap.val() as Record<string, unknown>;
  const validation = validateFinancialUpload(filename, buffer, 'current_source');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const importId = `${companyId}__${sha256}`;
  const importRef = db.ref(`finclose_data_imports/${importId}`);
  const existing = await importRef.once('value');
  if(existing.exists()) return {...existing.val(),status:'ALREADY_RECEIVED'};

  const organizationId = String(company.organization_id || 'lab');
  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/data/${stage}/${crypto.randomUUID()}/${validation.safe_name}`;
  await storageBucket().file(storagePath).save(buffer,{resumable:false,metadata:{contentType:validation.content_type,metadata:{organizationId,companyId,stage,sha256,validationStatus:validation.validation_status}}});
  const now = Date.now();
  const record = {import_id:importId,organization_id:company.organization_id||null,company_id:companyId,country_code:company.country_code,country_name:company.country_name,base_currency:company.base_currency,stage,filename:validation.safe_name,bytes:buffer.length,sha256,content_type:validation.content_type,validation_status:validation.validation_status,malware_scan_status:validation.malware_scan_status,storage_path:storagePath,metadata:workbookMetadata(buffer,filename),status:'RECEIVED',created_at:now};
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_data_imports/${importId}`]: record,
    [`finclose_audit_events/${auditKey}`]: {event:'DATA_CHUNK_RECEIVED',organization_id:company.organization_id||null,company_id:companyId,import_id:importId,stage,sha256,created_at:now}
  });
  return record;
}
