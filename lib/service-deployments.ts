import crypto from 'node:crypto';
import { getCountry, realtimeDatabase, storageBucket } from './finclose-backend';
import { validateFinancialUpload } from './file-security';
import { assertRealDataRuntimeReady, isRealDataMode, runtimeMode } from './runtime-mode';
import { quarantineStorageSegment, realDataUploadSecurityState } from './upload-quarantine';

export type ServiceKey = 'balance-books' | 'payroll' | 'do-bookkeeping' | 'bookkeeping-payroll';
export type AgentKey = 'orchestrator' | 'reconciliation' | 'bookkeeping' | 'payroll';
export type ConnectorKey = 'xero' | 'quickbooks-online' | 'datev' | 'smartaccounts' | 'manual-upload';

type ServiceProfile = {
  key: ServiceKey;
  title: string;
  description: string;
  agents: AgentKey[];
  fullCompanyInitializationRequired: boolean;
  countryRequiredAtRegistration: boolean;
  configurationFields: Array<'legal_name' | 'country_code' | 'pay_frequency'>;
  connectorAccess: 'accounting-read' | 'accounting-operate' | 'payroll' | 'accounting-and-payroll';
  allowedConnectors: ConnectorKey[];
  billingScope: string;
};

type Connector = {
  id: ConnectorKey;
  name: string;
  method: 'oauth2' | 'partner-api' | 'api-key' | 'file';
  capabilities: Array<'accounting-read' | 'accounting-write' | 'payroll-read' | 'payroll-write'>;
  accountingCountries?: string[];
  payrollCountries?: string[];
  note: string;
};

export const SERVICE_PROFILES: Record<ServiceKey, ServiceProfile> = {
  'balance-books': {
    key: 'balance-books',
    title: 'Help me balance my books',
    description: 'Review, reconcile and diagnose an existing set of books without deploying unrelated bookkeeping or payroll services.',
    agents: ['orchestrator', 'reconciliation'],
    fullCompanyInitializationRequired: false,
    countryRequiredAtRegistration: false,
    configurationFields: [],
    connectorAccess: 'accounting-read',
    allowedConnectors: ['xero', 'quickbooks-online', 'datev', 'smartaccounts', 'manual-upload'],
    billingScope: 'BALANCE_BOOKS'
  },
  payroll: {
    key: 'payroll',
    title: 'Help me do payroll',
    description: 'Deploy payroll only, with the minimum company and payroll essentials needed for the selected country.',
    agents: ['orchestrator', 'payroll'],
    fullCompanyInitializationRequired: false,
    countryRequiredAtRegistration: true,
    configurationFields: ['legal_name', 'country_code', 'pay_frequency'],
    connectorAccess: 'payroll',
    allowedConnectors: ['xero', 'datev', 'smartaccounts', 'manual-upload'],
    billingScope: 'PAYROLL_ONLY'
  },
  'do-bookkeeping': {
    key: 'do-bookkeeping',
    title: 'Do my bookkeeping',
    description: 'Deploy ongoing bookkeeping only, with accounting connectivity and no payroll setup.',
    agents: ['orchestrator', 'bookkeeping'],
    fullCompanyInitializationRequired: false,
    countryRequiredAtRegistration: true,
    configurationFields: ['legal_name', 'country_code'],
    connectorAccess: 'accounting-operate',
    allowedConnectors: ['xero', 'quickbooks-online', 'datev', 'smartaccounts', 'manual-upload'],
    billingScope: 'BOOKKEEPING_ONLY'
  },
  'bookkeeping-payroll': {
    key: 'bookkeeping-payroll',
    title: 'Bookkeeping & Payroll',
    description: 'Deploy bookkeeping and payroll together under one coordinated FinClose service.',
    agents: ['orchestrator', 'bookkeeping', 'payroll'],
    fullCompanyInitializationRequired: true,
    countryRequiredAtRegistration: true,
    configurationFields: ['legal_name', 'country_code', 'pay_frequency'],
    connectorAccess: 'accounting-and-payroll',
    allowedConnectors: ['xero', 'datev', 'smartaccounts', 'manual-upload'],
    billingScope: 'BOOKKEEPING_AND_PAYROLL'
  }
};

export const CONNECTORS: Record<ConnectorKey, Connector> = {
  xero: {
    id: 'xero',
    name: 'Xero',
    method: 'oauth2',
    capabilities: ['accounting-read', 'accounting-write', 'payroll-read', 'payroll-write'],
    accountingCountries: ['*'],
    payrollCountries: ['GB'],
    note: 'OAuth 2.0 accounting connector. Payroll access is only offered where the selected Xero payroll API and country are supported; FinClose currently routes payroll through Xero only for the UK profile.'
  },
  'quickbooks-online': {
    id: 'quickbooks-online',
    name: 'QuickBooks Online',
    method: 'oauth2',
    capabilities: ['accounting-read', 'accounting-write'],
    accountingCountries: ['*'],
    payrollCountries: [],
    note: 'OAuth 2.0 accounting connector. FinClose does not advertise this adapter as a payroll connector.'
  },
  datev: {
    id: 'datev',
    name: 'DATEV',
    method: 'partner-api',
    capabilities: ['accounting-read', 'accounting-write', 'payroll-read', 'payroll-write'],
    accountingCountries: ['DE'],
    payrollCountries: ['DE'],
    note: 'Germany-specific DATEV connector slot. Live access requires a registered DATEV app and the relevant Rechnungswesen or payroll API product permissions.'
  },
  smartaccounts: {
    id: 'smartaccounts',
    name: 'SmartAccounts',
    method: 'api-key',
    capabilities: ['accounting-read', 'accounting-write', 'payroll-read'],
    accountingCountries: ['EE'],
    payrollCountries: ['EE'],
    note: 'Estonia-specific SmartAccounts API connector slot. Customer API credentials must be handled through a secure secret flow before live use.'
  },
  'manual-upload': {
    id: 'manual-upload',
    name: 'Secure file upload',
    method: 'file',
    capabilities: ['accounting-read', 'payroll-read'],
    accountingCountries: ['*'],
    payrollCountries: ['*'],
    note: 'Validated private upload path. In PILOT/PRODUCTION it is tenant-scoped and real-data readiness is checked before acceptance.'
  }
};

function connectorState(id: ConnectorKey) {
  if (id === 'manual-upload') return { state: 'AVAILABLE_NOW', configured: true };
  if (id === 'xero') {
    const configured = Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_SCOPES);
    return { state: configured ? 'PROVIDER_CONFIGURED' : 'PROVIDER_CREDENTIALS_REQUIRED', configured };
  }
  if (id === 'quickbooks-online') {
    const configured = Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
    return { state: configured ? 'PROVIDER_CONFIGURED' : 'PROVIDER_CREDENTIALS_REQUIRED', configured };
  }
  if (id === 'datev') {
    const configured = Boolean(process.env.DATEV_CLIENT_ID && process.env.DATEV_CLIENT_SECRET);
    return { state: configured ? 'PROVIDER_CONFIGURED' : 'PARTNER_APP_REQUIRED', configured };
  }
  return { state: 'CUSTOMER_API_CREDENTIALS_REQUIRED', configured: false };
}

function supportsCountry(countries: string[] | undefined, country: string) {
  if (!countries || !country) return true;
  return countries.includes('*') || countries.includes(country);
}

function connectorSupportsProfile(profile: ServiceProfile, connector: Connector, country: string) {
  if (!country) return true;
  if (profile.connectorAccess === 'payroll') return supportsCountry(connector.payrollCountries, country);
  if (profile.connectorAccess === 'accounting-and-payroll') {
    return supportsCountry(connector.accountingCountries, country) && supportsCountry(connector.payrollCountries, country);
  }
  return supportsCountry(connector.accountingCountries, country);
}

export function publicServiceCatalog() {
  return Object.values(SERVICE_PROFILES).map(profile => ({
    ...profile,
    connectors: profile.allowedConnectors.map(id => ({ ...CONNECTORS[id], ...connectorState(id) }))
  }));
}

function getProfile(service: string) {
  const profile = SERVICE_PROFILES[service as ServiceKey];
  if (!profile) {
    const error = new Error('unsupported service');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  return profile;
}

function cleanEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    const error = new Error('valid email is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return email;
}

export async function startServiceDeployment(input: {
  service: string;
  name?: string;
  email?: string;
  country_code?: string;
  organization_id?: string;
  owner_user_id?: string;
}) {
  if (isRealDataMode()) assertRealDataRuntimeReady();
  const profile = getProfile(input.service);
  const name = String(input.name || '').trim();
  if (!name) {
    const error = new Error('name is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const email = cleanEmail(input.email);
  const countryCode = String(input.country_code || '').trim().toUpperCase();
  if (profile.countryRequiredAtRegistration && !getCountry(countryCode)) {
    const error = new Error('supported country is required for this service');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const organizationId = String(input.organization_id || '').trim();
  const ownerUserId = String(input.owner_user_id || '').trim();
  if (isRealDataMode() && (!organizationId || !ownerUserId)) {
    const error = new Error('production service deployment requires organization and owner identity');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const record = {
    deployment_id: id,
    runtime_mode: runtimeMode(),
    data_policy: isRealDataMode() ? 'CONTROLLED_REAL_DATA' : 'SYNTHETIC_TEST_ONLY',
    organization_id: organizationId || null,
    owner_user_id: ownerUserId || null,
    service: profile.key,
    service_title: profile.title,
    billing_scope: profile.billingScope,
    agents: profile.agents,
    full_company_initialization_required: profile.fullCompanyInitializationRequired,
    registrant: { name, email },
    country_code: countryCode || null,
    configuration: {},
    selected_connector: null,
    connector_state: null,
    status: profile.configurationFields.length ? 'REGISTERED_CONFIG_REQUIRED' : 'REGISTERED_CONNECTOR_REQUIRED',
    created_at: now,
    updated_at: now
  };

  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_service_deployments/${id}`]: record,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'SERVICE_DEPLOYMENT_REGISTERED',
      deployment_id: id,
      organization_id: organizationId || null,
      owner_user_id: ownerUserId || null,
      runtime_mode: runtimeMode(),
      service: profile.key,
      agents: profile.agents,
      full_company_initialization_required: profile.fullCompanyInitializationRequired,
      created_at: now
    }
  });
  return record;
}

export async function getServiceDeployment(id: string) {
  const snap = await realtimeDatabase().ref(`finclose_service_deployments/${id}`).once('value');
  if (!snap.exists()) {
    const error = new Error('service deployment not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  return snap.val();
}

export async function saveServiceConfiguration(id: string, input: Record<string, unknown>) {
  const deployment = await getServiceDeployment(id) as Record<string, any>;
  const profile = getProfile(String(deployment.service));
  const configuration: Record<string, string> = {};

  for (const field of profile.configurationFields) {
    const raw = input[field] ?? (field === 'country_code' ? deployment.country_code : '');
    const value = String(raw || '').trim();
    if (!value) {
      const error = new Error(`${field} is required for ${profile.title}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    configuration[field] = field === 'country_code' ? value.toUpperCase() : value;
  }

  if (configuration.country_code && !getCountry(configuration.country_code)) {
    const error = new Error('unsupported country');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const now = Date.now();
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const status = deployment.selected_connector ? 'CONFIGURED_CONNECTOR_SELECTED' : 'CONFIGURED_CONNECTOR_REQUIRED';
  await db.ref().update({
    [`finclose_service_deployments/${id}/configuration`]: configuration,
    [`finclose_service_deployments/${id}/country_code`]: configuration.country_code || deployment.country_code || null,
    [`finclose_service_deployments/${id}/status`]: status,
    [`finclose_service_deployments/${id}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: { event: 'SERVICE_CONFIGURATION_SAVED', deployment_id: id, organization_id: deployment.organization_id || null, service: profile.key, created_at: now }
  });
  return getServiceDeployment(id);
}

export async function selectServiceConnector(id: string, connectorId: string) {
  const deployment = await getServiceDeployment(id) as Record<string, any>;
  const profile = getProfile(String(deployment.service));
  const connector = CONNECTORS[connectorId as ConnectorKey];
  if (!connector || !profile.allowedConnectors.includes(connector.id)) {
    const error = new Error('connector is not allowed for this service');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const country = String(deployment.configuration?.country_code || deployment.country_code || '').toUpperCase();
  if (!connectorSupportsProfile(profile, connector, country)) {
    const error = new Error(`${connector.name} is not enabled for ${profile.title} in ${country}`);
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  const state = connectorState(connector.id);
  const needsConfiguration = profile.configurationFields.length > 0 && !deployment.configuration?.country_code;
  const status = needsConfiguration
    ? 'CONNECTOR_SELECTED_CONFIG_REQUIRED'
    : connector.id === 'manual-upload'
      ? 'READY_FOR_SOURCE'
      : state.configured
        ? 'AWAITING_PROVIDER_AUTHORIZATION'
        : 'CONNECTOR_SETUP_REQUIRED';
  const now = Date.now();
  const db = realtimeDatabase();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_service_deployments/${id}/selected_connector`]: connector.id,
    [`finclose_service_deployments/${id}/connector_state`]: state.state,
    [`finclose_service_deployments/${id}/status`]: status,
    [`finclose_service_deployments/${id}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: { event: 'SERVICE_CONNECTOR_SELECTED', deployment_id: id, organization_id: deployment.organization_id || null, service: profile.key, connector: connector.id, connector_state: state.state, country_code: country || null, created_at: now }
  });
  return { deployment: await getServiceDeployment(id), connector: { ...connector, ...state } };
}

export async function saveServiceSource(id: string, filename: string, buffer: Buffer) {
  const deployment = await getServiceDeployment(id) as Record<string, any>;
  const profile = getProfile(String(deployment.service));
  if (isRealDataMode()) assertRealDataRuntimeReady();
  if (deployment.selected_connector !== 'manual-upload') {
    const error = new Error('direct file upload is only available when Secure file upload is selected');
    (error as Error & { status?: number }).status = 409;
    throw error;
  }
  if (isRealDataMode() && deployment.company_id) {
    const companySnap = await realtimeDatabase().ref(`finclose_companies/${deployment.company_id}`).once('value');
    if (!companySnap.exists()) {
      const error = new Error('linked company was not found');
      (error as Error & { status?: number }).status = 404;
      throw error;
    }
    const company = companySnap.val() as Record<string, any>;
    if (company.data_is_synthetic === true) {
      const error = new Error('real financial data cannot be attached to a company explicitly marked synthetic');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
  }
  const validation = validateFinancialUpload(filename, buffer, 'current_source');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const sourceId = `${id}__${sha256}`;
  const db = realtimeDatabase();
  const existing = await db.ref(`finclose_service_sources/${sourceId}`).once('value');
  if (existing.exists()) return { ...existing.val(), status: 'ALREADY_RECEIVED' };

  const organizationId = String(deployment.organization_id || 'lab').trim() || 'lab';
  const companyId = String(deployment.company_id || 'unlinked').trim() || 'unlinked';
  const securityState = realDataUploadSecurityState();
  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/service-deployments/${id}/${profile.key}/${quarantineStorageSegment()}/${crypto.randomUUID()}/${validation.safe_name}`;
  await storageBucket().file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType: validation.content_type,
      metadata: {
        deploymentId: id,
        organizationId,
        companyId,
        service: profile.key,
        purpose: 'current_source',
        sha256,
        validationStatus: validation.validation_status,
        malwareScanStatus: validation.malware_scan_status,
        securityReviewStatus: securityState.security_review_status
      }
    }
  });
  const now = Date.now();
  const source = {
    source_id: sourceId,
    organization_id: deployment.organization_id || null,
    company_id: deployment.company_id || null,
    deployment_id: id,
    service: profile.key,
    connector: 'manual-upload',
    filename: validation.safe_name,
    bytes: buffer.length,
    sha256,
    content_type: validation.content_type,
    validation_status: validation.validation_status,
    malware_scan_status: validation.malware_scan_status,
    security_review_status: securityState.security_review_status,
    storage_path: storagePath,
    status: securityState.status,
    created_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const updates: Record<string, unknown> = {
    [`finclose_service_sources/${sourceId}`]: source,
    [`finclose_service_deployments/${id}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: securityState.status === 'RECEIVED' ? 'SERVICE_SOURCE_RECEIVED' : 'SERVICE_SOURCE_QUARANTINED',
      deployment_id: id, organization_id: deployment.organization_id || null, company_id: deployment.company_id || null,
      service: profile.key, source_id: sourceId, sha256, security_review_status: securityState.security_review_status, created_at: now
    }
  };
  if (securityState.status === 'RECEIVED') {
    updates[`finclose_service_deployments/${id}/status`] = 'READY_FOR_AGENT';
    updates[`finclose_service_deployments/${id}/latest_source_id`] = sourceId;
  } else {
    updates[`finclose_service_deployments/${id}/status`] = 'SOURCE_QUARANTINED_REVIEW_REQUIRED';
    updates[`finclose_service_deployments/${id}/latest_quarantined_source_id`] = sourceId;
  }
  await db.ref().update(updates);
  return source;
}
