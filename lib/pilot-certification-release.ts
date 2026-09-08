import { realtimeDatabase } from './finclose-backend';
import { getLatestPilotCertification, runPilotCertification, type CertificationGate, type CertificationGateStatus } from './pilot-certification';
import { computePilotCertificationEvidenceHash, type StoredPilotCertificationReport } from './pilot-release-evidence';
import { FINCLOSE_RELEASE_VERSION, PILOT_CERTIFICATION_VERSION, releaseSourceIdentityReady, releaseSourceSha } from './release-version';
import { runtimeMode } from './runtime-mode';

function yes(name: string) {
  return String(process.env[name] || '').trim().toUpperCase() === 'YES';
}

function gate(id: string, title: string, status: CertificationGateStatus, evidence: string, mandatory = true): CertificationGate {
  return { id, title, status, mandatory, evidence };
}

function releaseCompletionGates(): CertificationGate[] {
  const sourceSha = releaseSourceSha();
  return [
    gate(
      'release_source_identity',
      'Exact release source identity recorded',
      releaseSourceIdentityReady() ? 'PASS' : 'BLOCKED',
      releaseSourceIdentityReady()
        ? `Release source SHA ${sourceSha} is bound to this certification.`
        : 'VERCEL_GIT_COMMIT_SHA or FINCLOSE_RELEASE_SOURCE_SHA must contain the exact 40-character Git commit SHA for the release.'
    ),
    gate(
      'auth_email_human_delivery',
      'Human Firebase Auth email delivery verified',
      yes('FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED') ? 'PASS' : 'BLOCKED',
      yes('FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED')
        ? 'FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED=YES'
        : 'Verification and password-reset emails must both pass the controlled real-mailbox delivery record before PILOT activation.'
    ),
    gate(
      'controlled_upload_operator_adoption',
      'Controlled upload operator checklist adopted',
      yes('FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED') ? 'PASS' : 'BLOCKED',
      yes('FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED')
        ? 'FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED=YES'
        : 'The controlled pilot upload operator checklist must be completed and adopted before real financial files are accepted.'
    )
  ];
}

export async function runReleaseBoundPilotCertification() {
  const base = await runPilotCertification() as unknown as StoredPilotCertificationReport & Record<string, any>;
  const sourceSha = releaseSourceSha();
  const gates = [
    ...(Array.isArray(base.gates) ? base.gates : []),
    ...releaseCompletionGates()
  ] as CertificationGate[];
  const mandatoryFailures = gates.filter(item => item.mandatory && item.status !== 'PASS');
  const releaseReady = mandatoryFailures.length === 0;
  const activationAllowed = releaseReady && runtimeMode() === 'LAB' && String(process.env.FINCLOSE_PILOT_RELEASE_GATE || '').trim().toUpperCase() !== 'APPROVED';
  const gateCounts = gates.reduce((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, { PASS: 0, FAIL: 0, BLOCKED: 0, WARN: 0 } as Record<CertificationGateStatus, number>);
  const blockers = mandatoryFailures.map(item => `${item.id}: ${item.evidence}`);
  const report: StoredPilotCertificationReport & Record<string, any> = {
    ...base,
    certification_version: PILOT_CERTIFICATION_VERSION,
    release_version: FINCLOSE_RELEASE_VERSION,
    release_source_sha: sourceSha,
    release_ready: releaseReady,
    activation_allowed: activationAllowed,
    gate_counts: gateCounts,
    blockers,
    gates,
    evidence_hash: ''
  };
  report.evidence_hash = computePilotCertificationEvidenceHash(report);

  const db = realtimeDatabase();
  await db.ref().update({
    [`finclose_pilot_certification_runs/${String(report.run_id)}`]: report,
    finclose_pilot_certification_latest: {
      run_id: report.run_id,
      certification_version: PILOT_CERTIFICATION_VERSION,
      release_version: FINCLOSE_RELEASE_VERSION,
      release_source_sha: sourceSha,
      release_ready: releaseReady,
      activation_allowed: activationAllowed,
      evidence_hash: report.evidence_hash,
      completed_at: report.completed_at
    }
  });
  return report;
}

export async function getLatestReleaseBoundPilotCertification() {
  return getLatestPilotCertification() as Promise<(StoredPilotCertificationReport & Record<string, any>) | null>;
}
