import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseApp, realtimeDatabase, storageBucket } from './finclose-backend';
import { inspectFirebaseServiceAccountEnvironment } from './firebase-environment';
import { waitForSessionRevocation } from './firebase-revocation-verification';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION } from './release-version';
import { firebaseClientConfig, runtimeMode, uploadQuarantineMode } from './runtime-mode';
import { requireOrganizationRole, type OrganizationRole } from './tenancy';
import { payrollEngineSelfTestAll } from './payroll-engine';
import { bookkeepingEngineSelfTest } from './bookkeeping-engine';
import { financeCycleSelfTest } from './finance-cycle-engine';
import { closeGovernanceSelfTest } from './close-governance-engine';
import { ledgerHealth } from './production-ledger';
import { canonicalJSONStringify } from './pilot-release-evidence';

export type CertificationGateStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'WARN';
export type CertificationGate = {
  id: string;
  title: string;
  status: CertificationGateStatus;
  mandatory: boolean;
  evidence: string;
  detail?: Record<string, unknown>;
};

export type PilotCertificationReport = {
  certification_version: typeof PILOT_CERTIFICATION_VERSION;
  release_version: typeof FINCLOSE_RELEASE_VERSION;
  run_id: string;
  runtime_mode: string;
  started_at: number;
  completed_at: number;
  release_ready: boolean;
  activation_allowed: boolean;
  gate_counts: Record<CertificationGateStatus, number>;
  blockers: string[];
  gates: CertificationGate[];
  evidence_hash: string;
};

function yes(name: string) {
  return String(process.env[name] || '').trim().toUpperCase() === 'YES';
}

function gate(id: string, title: string, status: CertificationGateStatus, evidence: string, mandatory = true, detail?: Record<string, unknown>): CertificationGate {
  return { id, title, status, mandatory, evidence, ...(detail ? { detail } : {}) };
}

function projectId() {
  return inspectFirebaseServiceAccountEnvironment().project_id || '';
}

function databaseUrl() {
  return String(process.env.FIREBASE_DATABASE_URL || 'https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/').replace(/\/$/, '');
}

async function infrastructureGate(runId: string) {
  const db = realtimeDatabase();
  const firestore = getFirestore(firebaseApp());
  const bucket = storageBucket();
  const marker = crypto.randomUUID();
  const rtdbPath = `finclose_cert_infrastructure/${runId}`;
  const fsRef = firestore.collection('finclose_cert_infrastructure').doc(runId);
  const storagePath = `finclose-certification/${runId}/infrastructure.txt`;
  try {
    await db.ref(rtdbPath).set({ marker, created_at: Date.now() });
    const rt = await db.ref(rtdbPath).once('value');
    if (String(rt.val()?.marker || '') !== marker) throw new Error('RTDB round-trip marker mismatch');

    await fsRef.set({ marker, created_at: Date.now() });
    const fs = await fsRef.get();
    if (String(fs.data()?.marker || '') !== marker) throw new Error('Firestore round-trip marker mismatch');

    await bucket.file(storagePath).save(Buffer.from(marker), { resumable: false, contentType: 'text/plain' });
    const [stored] = await bucket.file(storagePath).download();
    if (stored.toString('utf8') !== marker) throw new Error('Storage round-trip marker mismatch');

    return gate('firebase_infrastructure_roundtrip', 'Firebase RTDB / Firestore / Storage round-trip', 'PASS', 'Disposable synthetic writes were created, read back and removed on the live Firebase services.', true, { rtdb: true, firestore: true, storage: true });
  } catch (error) {
    return gate('firebase_infrastructure_roundtrip', 'Firebase RTDB / Firestore / Storage round-trip', 'FAIL', (error as Error).message);
  } finally {
    await Promise.allSettled([
      db.ref(rtdbPath).remove(),
      fsRef.delete(),
      bucket.file(storagePath).delete({ ignoreNotFound: true })
    ]);
  }
}

async function publicRulesGate(runId: string) {
  const pid = projectId();
  const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  if (!pid || !bucketName) return gate('firebase_public_rules', 'Firebase deny-by-default public access', 'BLOCKED', 'Firebase project ID or Storage bucket is missing.');

  const marker = crypto.randomUUID();
  const db = realtimeDatabase();
  const firestore = getFirestore(firebaseApp());
  const fsRef = firestore.collection('finclose_cert_public_rules').doc(runId);
  const rtPath = `finclose_cert_public_rules/${runId}`;
  const storagePath = `finclose-certification/${runId}/public-rules.txt`;
  try {
    await db.ref(rtPath).set({ marker });
    await fsRef.set({ marker });
    await storageBucket().file(storagePath).save(Buffer.from(marker), { resumable: false, contentType: 'text/plain' });

    const [rt, fs, storage] = await Promise.all([
      fetch(`${databaseUrl()}/${rtPath}.json`, { cache: 'no-store' }),
      fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(pid)}/databases/(default)/documents/finclose_cert_public_rules/${encodeURIComponent(runId)}`, { cache: 'no-store' }),
      fetch(`https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${storagePath.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' })
    ]);

    const denied = (status: number) => [401, 403, 404].includes(status);
    const detail = { realtime_database_status: rt.status, firestore_status: fs.status, storage_status: storage.status };
    if (!denied(rt.status) || !denied(fs.status) || !denied(storage.status)) {
      return gate('firebase_public_rules', 'Firebase deny-by-default public access', 'FAIL', 'At least one disposable certification object was anonymously readable.', true, detail);
    }
    return gate('firebase_public_rules', 'Firebase deny-by-default public access', 'PASS', 'Anonymous requests could not read disposable RTDB, Firestore or Storage certification records.', true, detail);
  } catch (error) {
    return gate('firebase_public_rules', 'Firebase deny-by-default public access', 'FAIL', (error as Error).message);
  } finally {
    await Promise.allSettled([
      db.ref(rtPath).remove(),
      fsRef.delete(),
      storageBucket().file(storagePath).delete({ ignoreNotFound: true })
    ]);
  }
}

async function authGate(runId: string) {
  const client = firebaseClientConfig();
  const credentialEnvironment = inspectFirebaseServiceAccountEnvironment();
  if (credentialEnvironment.status !== 'PRESENT') {
    return gate(
      'firebase_auth_end_to_end',
      'Firebase Authentication end-to-end',
      'BLOCKED',
      credentialEnvironment.error_code || 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.',
      true,
      { credential_environment: credentialEnvironment.status }
    );
  }
  if (!client.apiKey || !client.authDomain || !client.projectId) {
    return gate('firebase_auth_end_to_end', 'Firebase Authentication end-to-end', 'BLOCKED', 'Firebase web/client Auth configuration is incomplete. Configure FIREBASE_WEB_API_KEY, FIREBASE_WEB_PROJECT_ID and FIREBASE_AUTH_DOMAIN before certification can test password sign-in, OOB flows and session revocation.', true, { client_configured: false });
  }

  const auth = getAuth(firebaseApp());
  const email = `finclose-cert-${runId}@finclose.invalid`;
  const password = `Fc!${crypto.randomBytes(18).toString('base64url')}`;
  let uid = '';
  try {
    const created = await auth.createUser({ email, password, emailVerified: false, disabled: false });
    uid = created.uid;
    const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(client.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store'
    });
    const signed = await signIn.json().catch(() => ({})) as Record<string, any>;
    if (!signIn.ok || !signed.idToken) throw new Error(`Firebase password sign-in failed: ${String(signed?.error?.message || signIn.status)}`);

    const decoded = await auth.verifyIdToken(String(signed.idToken), true);
    if (decoded.uid !== uid || decoded.email_verified === true) throw new Error('unverified Firebase identity state is inconsistent');

    const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(client.apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: signed.idToken }), cache: 'no-store'
    });
    if (!verify.ok) throw new Error(`Firebase verification OOB request failed with ${verify.status}`);

    const reset = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(client.apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }), cache: 'no-store'
    });
    if (!reset.ok) throw new Error(`Firebase password-reset OOB request failed with ${reset.status}`);

    const session = await auth.createSessionCookie(String(signed.idToken), { expiresIn: 60 * 60 * 1000 });
    const sessionBefore = await auth.verifySessionCookie(session, true);
    if (sessionBefore.uid !== uid) throw new Error('Firebase session cookie identity mismatch');

    const authTimeMs = Number(sessionBefore.auth_time || 0) * 1000;
    const boundaryWaitMs = Math.max(0, authTimeMs + 1_001 - Date.now());
    if (boundaryWaitMs > 0) await new Promise(resolve => setTimeout(resolve, boundaryWaitMs));

    await auth.revokeRefreshTokens(uid);
    const revocation = await waitForSessionRevocation(
      () => auth.verifySessionCookie(session, true),
      { maxAttempts: 6, delayMs: 250 }
    );
    if (!revocation.revoked) throw new Error('revoked Firebase session remained valid after bounded propagation retries');

    return gate('firebase_auth_end_to_end', 'Firebase Authentication end-to-end', 'PASS', 'Synthetic account creation, password sign-in, verification/reset OOB requests, session-cookie verification and revocation all succeeded against the live Firebase project.', true, { client_configured: true, email_password_provider: true, revocation_enforced: true, revocation_attempts: revocation.attempts });
  } catch (error) {
    return gate('firebase_auth_end_to_end', 'Firebase Authentication end-to-end', 'FAIL', (error as Error).message);
  } finally {
    if (uid) await auth.deleteUser(uid).catch(() => undefined);
  }
}

async function tenancyGate(runId: string) {
  const db = realtimeDatabase();
  const orgA = `cert_org_a_${runId}`;
  const orgB = `cert_org_b_${runId}`;
  const roles: OrganizationRole[] = ['VIEWER', 'ACCOUNTANT', 'APPROVER', 'ADMIN', 'OWNER'];
  const users = Object.fromEntries(roles.map(role => [role, `cert_user_${role.toLowerCase()}_${runId}`])) as Record<OrganizationRole, string>;
  const levels: Record<OrganizationRole, number> = { VIEWER: 10, ACCOUNTANT: 30, APPROVER: 40, ADMIN: 50, OWNER: 60 };
  const now = Date.now();
  try {
    const updates: Record<string, unknown> = {};
    for (const role of roles) updates[`finclose_organization_memberships/${orgA}/${users[role]}`] = { organization_id: orgA, user_id: users[role], role, status: 'ACTIVE', created_at: now, updated_at: now };
    updates[`finclose_organization_memberships/${orgB}/cert_intruder_${runId}`] = { organization_id: orgB, user_id: `cert_intruder_${runId}`, role: 'OWNER', status: 'ACTIVE', created_at: now, updated_at: now };
    await db.ref().update(updates);

    for (const actual of roles) {
      const user = { user_id: users[actual], name: actual, email: `${actual.toLowerCase()}@finclose.invalid`, email_verified: true, auth_mode: 'FIREBASE_AUTH_SESSION' as const };
      for (const minimum of roles) {
        let allowed = true;
        try { await requireOrganizationRole(orgA, user, minimum); } catch { allowed = false; }
        if (allowed !== (levels[actual] >= levels[minimum])) throw new Error(`role hierarchy mismatch: ${actual} -> ${minimum}`);
      }
    }

    const intruder = { user_id: `cert_intruder_${runId}`, name: 'Intruder', email: 'intruder@finclose.invalid', email_verified: true, auth_mode: 'FIREBASE_AUTH_SESSION' as const };
    let denied = false;
    try { await requireOrganizationRole(orgA, intruder, 'VIEWER'); } catch { denied = true; }
    if (!denied) throw new Error('cross-tenant user was not denied');

    return gate('tenant_role_isolation', 'Tenant isolation and role hierarchy', 'PASS', 'Live RTDB membership checks enforced cross-tenant denial and VIEWER/ACCOUNTANT/APPROVER/ADMIN/OWNER hierarchy on disposable identities.');
  } catch (error) {
    return gate('tenant_role_isolation', 'Tenant isolation and role hierarchy', 'FAIL', (error as Error).message);
  } finally {
    await Promise.allSettled([
      db.ref(`finclose_organization_memberships/${orgA}`).remove(),
      db.ref(`finclose_organization_memberships/${orgB}`).remove()
    ]);
  }
}

async function firestoreConcurrencyGate(runId: string) {
  const firestore = getFirestore(firebaseApp());
  const idemRef = firestore.collection('finclose_cert_idempotency').doc(runId);
  const lockRef = firestore.collection('finclose_cert_lock_state').doc(runId);
  const marker = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(marker).digest('hex');
  try {
    const attempts = Array.from({ length: 6 }, async () => firestore.runTransaction(async transaction => {
      const existing = await transaction.get(idemRef);
      if (existing.exists) {
        if (String(existing.data()?.payload_hash || '') !== hash) throw new Error('idempotency conflict');
        return 'REUSED';
      }
      transaction.create(idemRef, { payload_hash: hash, marker, created_at: Date.now() });
      return 'CREATED';
    }));
    const idem = await Promise.all(attempts);
    if (idem.filter(v => v === 'CREATED').length !== 1) throw new Error('deterministic idempotency did not result in exactly one create');

    const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd;
    async function lock(closeId: string, start: string, end: string) {
      return firestore.runTransaction(async transaction => {
        const state = await transaction.get(lockRef);
        const locks = Array.isArray(state.data()?.active_locks) ? state.data()!.active_locks as Record<string, any>[] : [];
        const overlap = locks.find(item => String(item.status || 'LOCKED') === 'LOCKED' && rangesOverlap(start, end, String(item.period_start || ''), String(item.period_end || '')));
        if (overlap) throw new Error(`overlap:${String(overlap.close_id || '')}`);
        const next = { close_id: closeId, period_start: start, period_end: end, status: 'LOCKED', created_at: Date.now() };
        transaction.set(lockRef, { active_locks: [...locks, next], updated_at: Date.now() });
        return closeId;
      });
    }
    const concurrent = await Promise.allSettled([
      lock(`cert_close_a_${runId}`, '2026-08-01', '2026-08-31'),
      lock(`cert_close_b_${runId}`, '2026-08-15', '2026-09-15')
    ]);
    const success = concurrent.filter(x => x.status === 'fulfilled').length;
    const rejected = concurrent.filter(x => x.status === 'rejected').length;
    if (success !== 1 || rejected !== 1) throw new Error(`overlapping lock race expected 1 success/1 rejection, got ${success}/${rejected}`);

    return gate('firestore_idempotency_and_lock_concurrency', 'Firestore idempotency and period-lock concurrency', 'PASS', 'Live Firestore transactions produced one deterministic create under concurrent retries and allowed only one of two overlapping close locks.', true, { idempotency_parallel_attempts: 6, overlapping_locks_successful: 1, overlapping_locks_rejected: 1 });
  } catch (error) {
    return gate('firestore_idempotency_and_lock_concurrency', 'Firestore idempotency and period-lock concurrency', 'FAIL', (error as Error).message);
  } finally {
    await Promise.allSettled([idemRef.delete(), lockRef.delete()]);
  }
}

async function uploadReviewConcurrencyGate(runId: string) {
  const db = realtimeDatabase();
  const ref = db.ref(`finclose_cert_upload_review_claims/${runId}`);
  const now = Date.now();
  async function claim(decision: 'CLEAN' | 'REJECTED', requestId: string) {
    let conflict = false;
    const result = await ref.transaction(current => {
      const claim = (current || null) as Record<string, any> | null;
      if (!claim) return { decision, effects_status: 'PENDING', effect_lease_id: requestId, effect_leased_at: now, claimed_at: now };
      if (String(claim.decision || '') !== decision) { conflict = true; return; }
      return claim;
    });
    return { committed: result.committed, conflict, value: result.snapshot.val() as Record<string, any> | null };
  }
  try {
    const [clean, rejected] = await Promise.all([
      claim('CLEAN', crypto.randomUUID()),
      claim('REJECTED', crypto.randomUUID())
    ]);
    const persisted = (await ref.once('value')).val() as Record<string, any>;
    if (!persisted || !['CLEAN', 'REJECTED'].includes(String(persisted.decision || ''))) throw new Error('no immutable upload-review decision was persisted');
    const winners = [clean, rejected].filter(x => x.committed && String(x.value?.decision || '') === String(persisted.decision || '')).length;
    if (winners !== 1) throw new Error(`expected exactly one review-decision winner, got ${winners}`);
    return gate('upload_review_concurrency', 'Upload-review decision concurrency', 'PASS', 'Concurrent CLEAN/REJECTED synthetic review claims produced one immutable persisted decision in live RTDB.', true, { persisted_decision: persisted.decision });
  } catch (error) {
    return gate('upload_review_concurrency', 'Upload-review decision concurrency', 'FAIL', (error as Error).message);
  } finally {
    await ref.remove().catch(() => undefined);
  }
}

function engineGate() {
  const payroll = payrollEngineSelfTestAll();
  const bookkeeping = bookkeepingEngineSelfTest();
  const finance = financeCycleSelfTest();
  const close = closeGovernanceSelfTest();
  const ok = payroll.ok && bookkeeping.ok && finance.ok && close.ok;
  return gate('deterministic_financial_engines', 'Deterministic payroll/bookkeeping/close regression suite', ok ? 'PASS' : 'FAIL', ok ? 'All deterministic engine self-tests passed.' : 'One or more deterministic financial engine self-tests failed.', true, { payroll_georgia: payroll.georgia.ok, payroll_germany_draft: payroll.germany.ok, bookkeeping: bookkeeping.ok, finance_cycle: finance.ok, close_governance: close.ok });
}

function manualGates() {
  return [
    gate('backup_pitr_policy', 'Firebase backup / PITR policy approved', yes('FINCLOSE_BACKUP_PITR_VERIFIED') ? 'PASS' : 'BLOCKED', yes('FINCLOSE_BACKUP_PITR_VERIFIED') ? 'FINCLOSE_BACKUP_PITR_VERIFIED=YES' : 'Manual Firebase backup/PITR policy evidence is still required.'),
    gate('independent_security_review', 'Independent security review approved', yes('FINCLOSE_SECURITY_REVIEW_APPROVED') ? 'PASS' : 'BLOCKED', yes('FINCLOSE_SECURITY_REVIEW_APPROVED') ? 'FINCLOSE_SECURITY_REVIEW_APPROVED=YES' : 'Independent security review has not been explicitly approved.'),
    gate('accounting_control_qa', 'Accounting-control QA approved', yes('FINCLOSE_ACCOUNTING_QA_APPROVED') ? 'PASS' : 'BLOCKED', yes('FINCLOSE_ACCOUNTING_QA_APPROVED') ? 'FINCLOSE_ACCOUNTING_QA_APPROVED=YES' : 'Accounting-control QA has not been explicitly approved.'),
    gate('controlled_upload_procedure', 'Controlled pilot upload-review procedure approved', yes('FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED') ? 'PASS' : 'BLOCKED', yes('FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED') ? 'FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED=YES' : 'A documented trusted-source manual review procedure is required before MANUAL_REVIEW can be used.'),
    gate('pilot_upload_mode', 'Pilot upload quarantine mode', uploadQuarantineMode() === 'MANUAL_REVIEW' ? 'PASS' : 'BLOCKED', uploadQuarantineMode() === 'MANUAL_REVIEW' ? 'FINCLOSE_UPLOAD_QUARANTINE_MODE=MANUAL_REVIEW' : `Current mode is ${uploadQuarantineMode()}; controlled PILOT requires MANUAL_REVIEW unless a verified SCANNER is available.`),
    gate('production_release_stays_blocked', 'Production release remains separately blocked', String(process.env.FINCLOSE_PRODUCTION_RELEASE_GATE || '').trim().toUpperCase() !== 'APPROVED' ? 'PASS' : 'FAIL', 'PRODUCTION must not be approved during controlled PILOT certification.')
  ];
}

export async function runPilotCertification(): Promise<PilotCertificationReport> {
  const startedAt = Date.now();
  const runId = `${new Date(startedAt).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomBytes(5).toString('hex')}`;
  const gates: CertificationGate[] = [];

  gates.push(gate('runtime_pre_activation', 'Pre-activation runtime remains LAB', runtimeMode() === 'LAB' ? 'PASS' : 'FAIL', `Current runtime is ${runtimeMode()}; certification must execute before real-data activation.`));
  gates.push(gate('pilot_release_latch_not_preapproved', 'Pilot release latch is not pre-approved', String(process.env.FINCLOSE_PILOT_RELEASE_GATE || '').trim().toUpperCase() !== 'APPROVED' ? 'PASS' : 'FAIL', 'The pilot latch must remain blocked until this certification and manual release checks pass.'));

  const ledger = await ledgerHealth();
  gates.push(gate('firestore_ledger_health', 'Authoritative Firestore ledger health', ledger.ready ? 'PASS' : 'FAIL', ledger.ready ? 'Firestore ledger schema is reachable and ready.' : `Firestore ledger is not ready: ${String((ledger as any).error || 'unknown')}`, true, ledger as unknown as Record<string, unknown>));

  gates.push(await infrastructureGate(runId));
  gates.push(await publicRulesGate(runId));
  gates.push(await authGate(runId));
  gates.push(await tenancyGate(runId));
  gates.push(await firestoreConcurrencyGate(runId));
  gates.push(await uploadReviewConcurrencyGate(runId));
  gates.push(engineGate());
  gates.push(...manualGates());

  const mandatoryFailures = gates.filter(g => g.mandatory && g.status !== 'PASS');
  const releaseReady = mandatoryFailures.length === 0;
  const activationAllowed = releaseReady && runtimeMode() === 'LAB' && String(process.env.FINCLOSE_PILOT_RELEASE_GATE || '').trim().toUpperCase() !== 'APPROVED';
  const completedAt = Date.now();
  const gateCounts = gates.reduce((acc, item) => { acc[item.status] += 1; return acc; }, { PASS: 0, FAIL: 0, BLOCKED: 0, WARN: 0 } as Record<CertificationGateStatus, number>);
  const blockers = mandatoryFailures.map(g => `${g.id}: ${g.evidence}`);
  // Canonical (recursively key-sorted) serialization so the digest survives a
  // Firebase RTDB write/read round-trip, which does not preserve key order.
  const evidenceHash = crypto.createHash('sha256').update(canonicalJSONStringify({
    certification_version: PILOT_CERTIFICATION_VERSION,
    release_version: FINCLOSE_RELEASE_VERSION,
    run_id: runId,
    gates: gates.map(({ id, status, mandatory, evidence, detail }) => ({ id, status, mandatory, evidence, detail }))
  })).digest('hex');
  const report: PilotCertificationReport = {
    certification_version: PILOT_CERTIFICATION_VERSION,
    release_version: FINCLOSE_RELEASE_VERSION,
    run_id: runId,
    runtime_mode: runtimeMode(),
    started_at: startedAt,
    completed_at: completedAt,
    release_ready: releaseReady,
    activation_allowed: activationAllowed,
    gate_counts: gateCounts,
    blockers,
    gates,
    evidence_hash: evidenceHash
  };

  const db = realtimeDatabase();
  await db.ref().update({
    [`finclose_pilot_certification_runs/${runId}`]: report,
    [`finclose_pilot_certification_latest`]: {
      run_id: runId,
      certification_version: PILOT_CERTIFICATION_VERSION,
      release_version: FINCLOSE_RELEASE_VERSION,
      release_ready: releaseReady,
      activation_allowed: activationAllowed,
      evidence_hash: evidenceHash,
      completed_at: completedAt
    }
  });
  return report;
}

export async function getLatestPilotCertification() {
  const db = realtimeDatabase();
  const latest = await db.ref('finclose_pilot_certification_latest').once('value');
  if (!latest.exists()) return null;
  const runId = String(latest.val()?.run_id || '');
  if (!runId) return null;
  const report = await db.ref(`finclose_pilot_certification_runs/${runId}`).once('value');
  return report.exists() ? report.val() as PilotCertificationReport : null;
}
