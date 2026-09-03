import crypto from 'node:crypto';
import { realtimeDatabase, storageBucket } from './finclose-backend';
import { getServiceDeployment } from './service-deployments';

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'history.bin';
}

function contentType(name: string) {
  if (/\.xlsx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.xls$/i.test(name)) return 'application/vnd.ms-excel';
  if (/\.csv$/i.test(name)) return 'text/csv';
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  return 'application/octet-stream';
}

export async function linkDeploymentCompany(deploymentId: string, companyId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  const db = realtimeDatabase();
  const companySnap = await db.ref(`finclose_companies/${companyId}`).once('value');
  if (!companySnap.exists()) throw httpError('initialized company not found', 404);

  const company = companySnap.val() as Record<string, any>;
  const deploymentCountry = String(deployment.country_code || '').toUpperCase();
  const companyCountry = String(company.country_code || '').toUpperCase();
  if (deploymentCountry && companyCountry && deploymentCountry !== companyCountry) {
    throw httpError(`selected company is ${companyCountry}, but this service registration is ${deploymentCountry}`, 409);
  }

  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  const configuration = {
    ...(deployment.configuration || {}),
    legal_name: String(company.legal_name || ''),
    country_code: companyCountry
  };

  await db.ref().update({
    [`finclose_service_deployments/${deploymentId}/company_id`]: companyId,
    [`finclose_service_deployments/${deploymentId}/company_name`]: String(company.legal_name || ''),
    [`finclose_service_deployments/${deploymentId}/country_code`]: companyCountry || deployment.country_code || null,
    [`finclose_service_deployments/${deploymentId}/configuration`]: configuration,
    [`finclose_service_deployments/${deploymentId}/initialization_status`]: 'INITIALIZED_COMPANY_LINKED',
    [`finclose_service_deployments/${deploymentId}/status`]: 'INITIALIZED_HISTORY_REQUIRED',
    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'SERVICE_INITIALIZED_COMPANY_LINKED',
      deployment_id: deploymentId,
      company_id: companyId,
      service: deployment.service,
      country_code: companyCountry || null,
      created_at: now
    }
  });

  return {
    deployment: await getServiceDeployment(deploymentId),
    company: {
      company_id: companyId,
      legal_name: company.legal_name,
      country_code: company.country_code,
      country_name: company.country_name,
      company_stage: company.company_stage,
      service_scope: company.service_scope,
      status: company.status
    }
  };
}

export async function saveHistoricalContext(deploymentId: string, filename: string, buffer: Buffer) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  if (deployment.service !== 'balance-books' && !deployment.company_id) {
    throw httpError('complete company initialization or link an initialized company before uploading history', 409);
  }
  if (!filename || !buffer.length) throw httpError('historical file is required', 400);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const historyId = `${deploymentId}__history__${sha256}`;
  const db = realtimeDatabase();
  const existing = await db.ref(`finclose_service_history/${historyId}`).once('value');
  if (existing.exists()) return { ...existing.val(), status: 'ALREADY_RECEIVED' };

  const path = `finclose/service-deployments/${deploymentId}/historical-context/${crypto.randomUUID()}/${safeFilename(filename)}`;
  await storageBucket().file(path).save(buffer, {
    resumable: false,
    metadata: {
      contentType: contentType(filename),
      metadata: {
        deploymentId,
        service: String(deployment.service || ''),
        purpose: 'historical_context',
        sha256
      }
    }
  });

  const now = Date.now();
  const previousCount = Number(deployment.history_count || 0);
  const record = {
    history_id: historyId,
    deployment_id: deploymentId,
    company_id: deployment.company_id || null,
    service: deployment.service,
    purpose: 'historical_context',
    filename,
    bytes: buffer.length,
    sha256,
    storage_path: path,
    status: 'RECEIVED',
    created_at: now
  };
  const auditKey = db.ref('finclose_audit_events').push().key!;

  await db.ref().update({
    [`finclose_service_history/${historyId}`]: record,
    [`finclose_service_deployments/${deploymentId}/history_status`]: 'RECEIVED',
    [`finclose_service_deployments/${deploymentId}/history_count`]: previousCount + 1,
    [`finclose_service_deployments/${deploymentId}/latest_history_id`]: historyId,
    [`finclose_service_deployments/${deploymentId}/status`]: 'HISTORY_RECEIVED_CONNECTOR_READY',
    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'SERVICE_HISTORICAL_CONTEXT_RECEIVED',
      deployment_id: deploymentId,
      company_id: deployment.company_id || null,
      service: deployment.service,
      history_id: historyId,
      sha256,
      created_at: now
    }
  });

  return record;
}

export async function skipHistoricalContext(deploymentId: string) {
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  if (deployment.service === 'balance-books') {
    throw httpError('historical context cannot be skipped for balance-books', 409);
  }
  if (!deployment.company_id) {
    throw httpError('link an initialized company first', 409);
  }

  const db = realtimeDatabase();
  const companySnap = await db.ref(`finclose_companies/${deployment.company_id}`).once('value');
  if (!companySnap.exists()) throw httpError('initialized company not found', 404);
  const company = companySnap.val() as Record<string, any>;
  if (String(company.company_stage || '').toUpperCase() !== 'NEW') {
    throw httpError('historical context may only be skipped for a company initialized as NEW', 409);
  }

  const now = Date.now();
  const auditKey = db.ref('finclose_audit_events').push().key!;
  await db.ref().update({
    [`finclose_service_deployments/${deploymentId}/history_status`]: 'NOT_APPLICABLE_NEW_COMPANY',
    [`finclose_service_deployments/${deploymentId}/status`]: 'HISTORY_NOT_APPLICABLE_CONNECTOR_READY',
    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,
    [`finclose_audit_events/${auditKey}`]: {
      event: 'SERVICE_HISTORICAL_CONTEXT_NOT_APPLICABLE',
      deployment_id: deploymentId,
      company_id: deployment.company_id,
      service: deployment.service,
      created_at: now
    }
  });
  return getServiceDeployment(deploymentId);
}
