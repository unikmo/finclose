from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# Current source uploads: real-data files stay quarantined until ADMIN review.
path = 'lib/service-deployments.ts'
replace_once(path,
"import { assertRealDataRuntimeReady, isRealDataMode, runtimeMode } from './runtime-mode';\n",
"import { assertRealDataRuntimeReady, isRealDataMode, runtimeMode } from './runtime-mode';\nimport { quarantineStorageSegment, realDataUploadSecurityState } from './upload-quarantine';\n")
replace_once(path,
"  const organizationId = String(deployment.organization_id || 'lab').trim() || 'lab';\n  const companyId = String(deployment.company_id || 'unlinked').trim() || 'unlinked';\n  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/service-deployments/${id}/${profile.key}/${crypto.randomUUID()}/${validation.safe_name}`;\n",
"  const organizationId = String(deployment.organization_id || 'lab').trim() || 'lab';\n  const companyId = String(deployment.company_id || 'unlinked').trim() || 'unlinked';\n  const securityState = realDataUploadSecurityState();\n  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/service-deployments/${id}/${profile.key}/${quarantineStorageSegment()}/${crypto.randomUUID()}/${validation.safe_name}`;\n")
replace_once(path,
"        malwareScanStatus: validation.malware_scan_status\n",
"        malwareScanStatus: validation.malware_scan_status,\n        securityReviewStatus: securityState.security_review_status\n")
replace_once(path,
"    malware_scan_status: validation.malware_scan_status,\n    storage_path: storagePath,\n    status: 'RECEIVED',\n",
"    malware_scan_status: validation.malware_scan_status,\n    security_review_status: securityState.security_review_status,\n    storage_path: storagePath,\n    status: securityState.status,\n")
replace_once(path,
"  const auditKey = db.ref('finclose_audit_events').push().key!;\n  await db.ref().update({\n    [`finclose_service_sources/${sourceId}`]: source,\n    [`finclose_service_deployments/${id}/status`]: 'READY_FOR_AGENT',\n    [`finclose_service_deployments/${id}/latest_source_id`]: sourceId,\n    [`finclose_service_deployments/${id}/updated_at`]: now,\n    [`finclose_audit_events/${auditKey}`]: { event: 'SERVICE_SOURCE_RECEIVED', deployment_id: id, organization_id: deployment.organization_id || null, company_id: deployment.company_id || null, service: profile.key, source_id: sourceId, sha256, created_at: now }\n  });\n  return source;\n",
"  const auditKey = db.ref('finclose_audit_events').push().key!;\n  const updates: Record<string, unknown> = {\n    [`finclose_service_sources/${sourceId}`]: source,\n    [`finclose_service_deployments/${id}/updated_at`]: now,\n    [`finclose_audit_events/${auditKey}`]: {\n      event: securityState.status === 'RECEIVED' ? 'SERVICE_SOURCE_RECEIVED' : 'SERVICE_SOURCE_QUARANTINED',\n      deployment_id: id, organization_id: deployment.organization_id || null, company_id: deployment.company_id || null,\n      service: profile.key, source_id: sourceId, sha256, security_review_status: securityState.security_review_status, created_at: now\n    }\n  };\n  if (securityState.status === 'RECEIVED') {\n    updates[`finclose_service_deployments/${id}/status`] = 'READY_FOR_AGENT';\n    updates[`finclose_service_deployments/${id}/latest_source_id`] = sourceId;\n  } else {\n    updates[`finclose_service_deployments/${id}/status`] = 'SOURCE_QUARANTINED_REVIEW_REQUIRED';\n    updates[`finclose_service_deployments/${id}/latest_quarantined_source_id`] = sourceId;\n  }\n  await db.ref().update(updates);\n  return source;\n")

# Historical context follows the same controlled quarantine rule.
path = 'lib/onboarding-history.ts'
replace_once(path,
"import { assertRealDataRuntimeReady, isRealDataMode } from './runtime-mode';\n",
"import { assertRealDataRuntimeReady, isRealDataMode } from './runtime-mode';\nimport { quarantineStorageSegment, realDataUploadSecurityState } from './upload-quarantine';\n")
replace_once(path,
"  const organizationId = String(deployment.organization_id || 'lab').trim() || 'lab';\n  const companyId = String(deployment.company_id || 'unlinked').trim() || 'unlinked';\n  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/service-deployments/${deploymentId}/historical-context/${crypto.randomUUID()}/${validation.safe_name}`;\n",
"  const organizationId = String(deployment.organization_id || 'lab').trim() || 'lab';\n  const companyId = String(deployment.company_id || 'unlinked').trim() || 'unlinked';\n  const securityState = realDataUploadSecurityState();\n  const storagePath = `finclose/organizations/${organizationId}/companies/${companyId}/service-deployments/${deploymentId}/historical-context/${quarantineStorageSegment()}/${crypto.randomUUID()}/${validation.safe_name}`;\n")
replace_once(path,
"        malwareScanStatus: validation.malware_scan_status\n",
"        malwareScanStatus: validation.malware_scan_status,\n        securityReviewStatus: securityState.security_review_status\n")
replace_once(path,
"    validation_status: validation.validation_status,\n    malware_scan_status: validation.malware_scan_status,\n    bytes: buffer.length,\n",
"    validation_status: validation.validation_status,\n    malware_scan_status: validation.malware_scan_status,\n    security_review_status: securityState.security_review_status,\n    bytes: buffer.length,\n")
replace_once(path,
"    storage_path: storagePath,\n    status: 'RECEIVED',\n",
"    storage_path: storagePath,\n    status: securityState.status,\n")
replace_once(path,
"  const auditKey = db.ref('finclose_audit_events').push().key!;\n\n  await db.ref().update({\n    [`finclose_service_history/${historyId}`]: record,\n    [`finclose_service_deployments/${deploymentId}/history_status`]: 'RECEIVED',\n    [`finclose_service_deployments/${deploymentId}/history_count`]: previousCount + 1,\n    [`finclose_service_deployments/${deploymentId}/latest_history_id`]: historyId,\n    [`finclose_service_deployments/${deploymentId}/status`]: 'HISTORY_RECEIVED_CONNECTOR_READY',\n    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,\n    [`finclose_audit_events/${auditKey}`]: {\n      event: 'SERVICE_HISTORICAL_CONTEXT_RECEIVED',\n      organization_id: deployment.organization_id || null,\n      deployment_id: deploymentId,\n      company_id: deployment.company_id || null,\n      service: deployment.service,\n      history_id: historyId,\n      sha256,\n      created_at: now\n    }\n  });\n\n  return record;\n",
"  const auditKey = db.ref('finclose_audit_events').push().key!;\n  const updates: Record<string, unknown> = {\n    [`finclose_service_history/${historyId}`]: record,\n    [`finclose_service_deployments/${deploymentId}/updated_at`]: now,\n    [`finclose_audit_events/${auditKey}`]: {\n      event: securityState.status === 'RECEIVED' ? 'SERVICE_HISTORICAL_CONTEXT_RECEIVED' : 'SERVICE_HISTORICAL_CONTEXT_QUARANTINED',\n      organization_id: deployment.organization_id || null,\n      deployment_id: deploymentId,\n      company_id: deployment.company_id || null,\n      service: deployment.service,\n      history_id: historyId,\n      sha256,\n      security_review_status: securityState.security_review_status,\n      created_at: now\n    }\n  };\n  if (securityState.status === 'RECEIVED') {\n    updates[`finclose_service_deployments/${deploymentId}/history_status`] = 'RECEIVED';\n    updates[`finclose_service_deployments/${deploymentId}/history_count`] = previousCount + 1;\n    updates[`finclose_service_deployments/${deploymentId}/latest_history_id`] = historyId;\n    updates[`finclose_service_deployments/${deploymentId}/status`] = 'HISTORY_RECEIVED_CONNECTOR_READY';\n  } else {\n    updates[`finclose_service_deployments/${deploymentId}/history_status`] = 'QUARANTINED_REVIEW_REQUIRED';\n    updates[`finclose_service_deployments/${deploymentId}/latest_quarantined_history_id`] = historyId;\n    updates[`finclose_service_deployments/${deploymentId}/status`] = 'HISTORY_QUARANTINED_REVIEW_REQUIRED';\n  }\n  await db.ref().update(updates);\n\n  return record;\n")

print('v0.34 upload quarantine patch applied')
