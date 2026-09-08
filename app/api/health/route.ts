import { NextRequest, NextResponse } from 'next/server';
import { realtimeDatabase, storageBucket } from '../../../lib/finclose-backend';
import { inspectFirebaseServiceAccountEnvironment } from '../../../lib/firebase-environment';
import { ensureFirebaseWebClientConfig } from '../../../lib/firebase-web-config-discovery';
import { getPilotReleaseEvidenceStatus } from '../../../lib/pilot-release-gate';
import { FINCLOSE_RELEASE_VERSION } from '../../../lib/release-version';
import { runtimeReadiness } from '../../../lib/runtime-mode';
import { ledgerHealth } from '../../../lib/production-ledger';
import { FINANCIAL_UPLOAD_SECURITY } from '../../../lib/file-security';
import { payrollEngineSelfTest } from '../../../lib/payroll-engine';
import { bookkeepingEngineSelfTest } from '../../../lib/bookkeeping-engine';
import { financeCycleSelfTest } from '../../../lib/finance-cycle-engine';
import { closeGovernanceSelfTest } from '../../../lib/close-governance-engine';
import { getLatestPilotCertification } from '../../../lib/pilot-certification';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const firebaseWebConfigDiscovery = await ensureFirebaseWebClientConfig();
  const readiness = runtimeReadiness();
  const credentialEnvironment = inspectFirebaseServiceAccountEnvironment();
  const configured = credentialEnvironment.status === 'PRESENT' && Boolean(process.env.FIREBASE_STORAGE_BUCKET);
  const deep = req.nextUrl.searchParams.get('deep') === '1';
  if (!deep || !configured) {
    return NextResponse.json({
      version: FINCLOSE_RELEASE_VERSION,
      hosting: 'vercel',
      database: 'firebase-realtime-database',
      storage: 'firebase-storage',
      runtime: readiness,
      firebase_admin_credential_environment: credentialEnvironment.status,
      firebase_web_config_discovery: firebaseWebConfigDiscovery,
      configured,
      configuration_error: credentialEnvironment.status === 'PRESENT' ? null : credentialEnvironment.error_code || null
    });
  }

  const reachable = { database: false, storage: false, firestore: false };
  const errors: string[] = [];
  if (readiness.real_data_mode && !readiness.real_data_allowed_by_config) {
    errors.push(`runtime: ${readiness.blockers.join(', ') || 'real-data release gate is not ready'}`);
  }
  try {
    await realtimeDatabase().ref('finclose_health').limitToFirst(1).once('value');
    reachable.database = true;
  } catch (e) { errors.push(`database: ${(e as Error).message}`); }
  try {
    await storageBucket().getMetadata();
    reachable.storage = true;
  } catch (e) { errors.push(`storage: ${(e as Error).message}`); }
  const firestore = await ledgerHealth();
  reachable.firestore = firestore.ready;
  if (readiness.real_data_mode && !firestore.ready) errors.push(`firestore-ledger: ${firestore.error || 'ledger not ready'}`);

  const releaseEvidence = await getPilotReleaseEvidenceStatus();
  if (readiness.real_data_mode && !releaseEvidence.ready) {
    errors.push(`release-certification: ${releaseEvidence.code}`);
  }

  const payroll = payrollEngineSelfTest();
  const bookkeeping = bookkeepingEngineSelfTest();
  const financeCycle = financeCycleSelfTest();
  const closeGovernance = closeGovernanceSelfTest();
  if (!payroll.ok) errors.push('payroll-engine: deterministic regression check failed');
  if (!bookkeeping.ok) errors.push('bookkeeping-engine: deterministic regression check failed');
  if (!financeCycle.ok) errors.push('finance-cycle: deterministic regression check failed');
  if (!closeGovernance.ok) errors.push('close-governance: deterministic regression check failed');

  const certification = await getLatestPilotCertification().catch(() => null);
  const engineOk = payroll.ok && bookkeeping.ok && financeCycle.ok && closeGovernance.ok;
  const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || firestore.ready);
  const releaseOk = !readiness.real_data_mode || (readiness.real_data_allowed_by_config && releaseEvidence.ready);

  return NextResponse.json({
    version: FINCLOSE_RELEASE_VERSION,
    hosting: 'vercel',
    database: 'firebase-realtime-database-control-plane',
    authoritative_ledger: 'firebase-firestore',
    storage: 'firebase-storage',
    runtime: readiness,
    firebase_admin_credential_environment: credentialEnvironment.status,
    firebase_web_config_discovery: firebaseWebConfigDiscovery,
    configured,
    reachable,
    firestore,
    real_data_release_evidence: releaseEvidence,
    pilot_certification: certification ? {
      certification_version: certification.certification_version,
      release_version: certification.release_version,
      completed_at: certification.completed_at,
      release_ready: certification.release_ready,
      activation_allowed: certification.activation_allowed,
      evidence_hash: certification.evidence_hash
    } : null,
    upload_security: FINANCIAL_UPLOAD_SECURITY,
    engines: {
      payroll_ge_basic: payroll.ok,
      bookkeeping_core: bookkeeping.ok,
      finance_cycle: financeCycle.ok,
      monthly_close_controls: financeCycle.ok,
      source_completeness: closeGovernance.ok,
      balance_sheet_reconciliation: closeGovernance.ok,
      close_approval_and_period_lock: closeGovernance.ok
    },
    ok: infrastructureOk && engineOk && releaseOk && errors.length === 0,
    errors
  });
}
