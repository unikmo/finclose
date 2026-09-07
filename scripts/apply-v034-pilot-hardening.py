from pathlib import Path
import json

ROOT = Path('.')

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Route wiring: managed auth recovery/verification + internal upload-review queue.
route = 'app/api/[...path]/route.ts'
replace_once(route,
"import { authenticateRequest, createFirebaseSessionResponse, currentManagedUser, loginManagedAccount, logoutManagedResponse, registerManagedAccount, type RequestIdentity } from '../../../lib/managed-auth';",
"import { authenticateRequest, createFirebaseSessionResponse, currentManagedUser, loginManagedAccount, logoutManagedResponse, registerManagedAccount, requestPasswordReset, requirePlatformRole, resendVerification, type RequestIdentity } from '../../../lib/managed-auth';")
replace_once(route,
"import { FINANCIAL_UPLOAD_SECURITY } from '../../../lib/file-security';",
"import { FINANCIAL_UPLOAD_SECURITY } from '../../../lib/file-security';\nimport { downloadServiceUploadForReview, listQuarantinedUploads, reviewServiceUpload, type UploadArtifactKind } from '../../../lib/upload-quarantine';")
replace_once(route,
"function historyReady(deployment: Record<string, any>) {\n  return deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY';\n}\n",
"function historyReady(deployment: Record<string, any>) {\n  return deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY';\n}\n\nfunction uploadReviewKind(value: string): UploadArtifactKind {\n  if (value === 'history' || value === 'source') return value;\n  const error = new Error('upload review kind must be history or source');\n  (error as Error & { status?: number }).status = 400;\n  throw error;\n}\n")
account_session_block = """    if (p.join('/') === 'account/session') {\n      const user = await currentManagedUser(req);\n      if (user && isRealDataMode() && user.email_verified) await ensurePersonalOrganization(user);\n      return NextResponse.json({ authenticated: Boolean(user), user, auth_mode: user?.auth_mode || (isRealDataMode() ? 'FIREBASE_AUTH_SESSION' : 'LAB_ACCOUNT_SESSION') });\n    }\n\n"""
review_get = """    if (p.join('/') === 'upload-review/queue') {\n      const reviewAuth = await authenticateRequest(req);\n      if (reviewAuth.kind !== 'customer') return NextResponse.json({ detail: 'managed reviewer sign-in is required' }, { status: 403 });\n      requirePlatformRole(reviewAuth.user, 'SECURITY_REVIEWER');\n      return NextResponse.json(await listQuarantinedUploads(100));\n    }\n\n    if (p.length === 5 && p[0] === 'upload-review' && p[4] === 'download') {\n      const reviewAuth = await authenticateRequest(req);\n      if (reviewAuth.kind !== 'customer') return NextResponse.json({ detail: 'managed reviewer sign-in is required' }, { status: 403 });\n      requirePlatformRole(reviewAuth.user, 'SECURITY_REVIEWER');\n      const reviewed = await downloadServiceUploadForReview({ deployment_id: p[1], kind: uploadReviewKind(p[2]), artifact_id: p[3] });\n      const safeFilename = reviewed.artifact.filename.replace(/[^A-Za-z0-9._-]/g, '_');\n      return new NextResponse(new Uint8Array(reviewed.buffer), {\n        headers: {\n          'content-type': reviewed.artifact.content_type,\n          'content-disposition': `attachment; filename=\"${safeFilename}\"`,\n          'x-finclose-sha256': reviewed.artifact.sha256,\n          'cache-control': 'no-store'\n        }\n      });\n    }\n\n"""
replace_once(route, account_session_block, account_session_block + review_get)
replace_once(route,
"""    if (p.join('/') === 'account/firebase-session') {\n      const body = await req.json();\n      return createFirebaseSessionResponse(String(body.id_token || ''));\n    }\n""",
"""    if (p.join('/') === 'account/firebase-session') {\n      const body = await req.json();\n      return createFirebaseSessionResponse(String(body.id_token || ''));\n    }\n    if (p.join('/') === 'account/password-reset') return requestPasswordReset(await req.json());\n    if (p.join('/') === 'account/verification') return resendVerification(await req.json());\n""")
replace_once(route,
"""    if (p.join('/') === 'account/logout') return logoutManagedResponse(req);\n\n    const auth = await authenticateRequest(req);\n""",
"""    if (p.join('/') === 'account/logout') return logoutManagedResponse(req);\n\n    if (p.length === 5 && p[0] === 'upload-review' && p[4] === 'decision') {\n      const reviewAuth = await authenticateRequest(req);\n      if (reviewAuth.kind !== 'customer') return NextResponse.json({ detail: 'managed reviewer sign-in is required' }, { status: 403 });\n      requirePlatformRole(reviewAuth.user, 'SECURITY_REVIEWER');\n      const body = await req.json();\n      return NextResponse.json(await reviewServiceUpload({\n        deployment_id: p[1],\n        kind: uploadReviewKind(p[2]),\n        artifact_id: p[3],\n        actor_user_id: reviewAuth.user.user_id,\n        decision: String(body.decision || '').toUpperCase() as 'CLEAN' | 'REJECTED',\n        note: body.note ? String(body.note) : undefined\n      }));\n    }\n\n    const auth = await authenticateRequest(req);\n""")

# Managed identity: platform roles for internal security review, never organization roles.
auth = 'lib/managed-auth.ts'
replace_once(auth,
"const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;\n\nexport type ManagedUser = {",
"const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;\n\nexport type PlatformRole = 'SECURITY_REVIEWER' | 'PLATFORM_ADMIN';\nconst PLATFORM_ROLES = new Set<PlatformRole>(['SECURITY_REVIEWER', 'PLATFORM_ADMIN']);\n\nexport type ManagedUser = {")
replace_once(auth,
"  auth_mode: 'FIREBASE_AUTH_SESSION' | 'LAB_ACCOUNT_SESSION';\n};",
"  auth_mode: 'FIREBASE_AUTH_SESSION' | 'LAB_ACCOUNT_SESSION';\n  platform_roles: PlatformRole[];\n};")
replace_once(auth,
"function managedUserFromClaims(claims: Record<string, unknown>): ManagedUser {",
"function platformRolesFromClaims(claims: Record<string, unknown>): PlatformRole[] {\n  const raw = claims.finclose_platform_roles;\n  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];\n  return values\n    .map(value => String(value || '').trim().toUpperCase())\n    .filter((value): value is PlatformRole => PLATFORM_ROLES.has(value as PlatformRole));\n}\n\nfunction managedUserFromClaims(claims: Record<string, unknown>): ManagedUser {")
replace_once(auth,
"    email_verified: claims.email_verified === true,\n    auth_mode: 'FIREBASE_AUTH_SESSION'\n  };",
"    email_verified: claims.email_verified === true,\n    auth_mode: 'FIREBASE_AUTH_SESSION',\n    platform_roles: platformRolesFromClaims(claims)\n  };")
replace_once(auth,
"    return { ...user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION' };",
"    return { ...user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION', platform_roles: [] };")
replace_once(auth,
"      user: { ...legacy.user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION' }",
"      user: { ...legacy.user, email_verified: false, auth_mode: 'LAB_ACCOUNT_SESSION', platform_roles: [] }")
replace_once(auth,
"export async function logoutManagedResponse(req: NextRequest) {",
"export function requirePlatformRole(user: ManagedUser, required: PlatformRole) {\n  if (user.auth_mode !== 'FIREBASE_AUTH_SESSION') throw httpError('managed Firebase identity is required for platform operations', 403);\n  if (user.platform_roles.includes('PLATFORM_ADMIN') || user.platform_roles.includes(required)) return;\n  throw httpError(`platform role ${required} is required`, 403);\n}\n\nexport async function logoutManagedResponse(req: NextRequest) {")

# Remove the service-deployments <-> upload-quarantine circular import and add a review queue.
quarantine = 'lib/upload-quarantine.ts'
replace_once(quarantine,
"import { getServiceDeployment } from './service-deployments';\n",
"")
replace_once(quarantine,
"async function loadArtifact(deploymentId: string, kind: UploadArtifactKind, artifactId: string) {\n  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;",
"async function loadDeployment(deploymentId: string) {\n  const snap = await realtimeDatabase().ref(`finclose_service_deployments/${deploymentId}`).once('value');\n  if (!snap.exists()) throw httpError('service deployment not found', 404);\n  return snap.val() as Record<string, any>;\n}\n\nasync function loadArtifact(deploymentId: string, kind: UploadArtifactKind, artifactId: string) {\n  const deployment = await loadDeployment(deploymentId);")
insert_before = "export async function downloadServiceUploadForReview(input: {"
queue_fn = """export async function listQuarantinedUploads(limit = 100) {\n  if (!isRealDataMode()) throw httpError('upload security review is only used in PILOT or PRODUCTION mode', 409);\n  assertRealDataRuntimeReady();\n  if (uploadQuarantineMode() !== 'MANUAL_REVIEW') {\n    throw httpError('manual review queue is disabled unless MANUAL_REVIEW quarantine mode is active', 409);\n  }\n  const db = realtimeDatabase();\n  const [historySnap, sourceSnap] = await Promise.all([\n    db.ref('finclose_service_history').once('value'),\n    db.ref('finclose_service_sources').once('value')\n  ]);\n  const rows: Record<string, unknown>[] = [];\n  const collect = (kind: UploadArtifactKind, values: Record<string, Record<string, any>>) => {\n    for (const artifact of Object.values(values || {})) {\n      if (String(artifact.status || '') !== 'QUARANTINED') continue;\n      rows.push({\n        kind,\n        artifact_id: kind === 'history' ? artifact.history_id : artifact.source_id,\n        organization_id: artifact.organization_id || null,\n        company_id: artifact.company_id || null,\n        deployment_id: artifact.deployment_id,\n        filename: artifact.filename,\n        content_type: artifact.content_type,\n        bytes: Number(artifact.bytes || 0),\n        sha256: artifact.sha256,\n        security_review_status: artifact.security_review_status,\n        created_at: Number(artifact.created_at || 0)\n      });\n    }\n  };\n  collect('history', (historySnap.val() || {}) as Record<string, Record<string, any>>);\n  collect('source', (sourceSnap.val() || {}) as Record<string, Record<string, any>>);\n  return rows.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, Math.max(1, Math.min(limit, 250)));\n}\n\n"""
replace_once(quarantine, insert_before, queue_fn + insert_before)

# Version metadata.
for filename in ['package.json', 'package-lock.json']:
    p = ROOT / filename
    data = json.loads(p.read_text())
    data['version'] = '0.34.0'
    if filename == 'package-lock.json' and isinstance(data.get('packages'), dict) and '' in data['packages']:
        data['packages']['']['version'] = '0.34.0'
    p.write_text(json.dumps(data, indent=2) + '\n')

# Canonical truth: record the v0.34 security hardening without claiming live Firebase activation.
ctr = ROOT / 'CANONICAL_TRUTH.md'
text = ctr.read_text()
text = text.replace('Version: 16', 'Version: 17', 1)
old = "| Production authentication | v0.33 implements Firebase Authentication with server-side HTTP-only session cookies, token revocation checks and organization/role authorization for PILOT/PRODUCTION. Actual Firebase Email/Password enablement and live release verification remain required before the mode is switched from LAB | User architecture decision + implementation | ACTIVE / CONFIGURATION REQUIRED | Preferred-candidate-only Firebase Auth |"
new = "| Production authentication | v0.34 uses Firebase Authentication with server-side HTTP-only session cookies, token revocation checks, mandatory verified-email access for real-data operations, Firebase password-reset/verification flows and application-level authentication throttling. Actual Firebase Email/Password enablement and live release verification remain required before PILOT activation | User architecture decision + implementation | ACTIVE / CONFIGURATION REQUIRED | v0.33 managed-auth foundation |"
if old not in text:
    raise SystemExit('production authentication CTR row not found')
text = text.replace(old, new, 1)
old = "| Secure file upload connector | Private Firebase Storage paths, SHA-256 fingerprints, file allowlist, size limit and content-signature checks are implemented. Dedicated malware scanning/quarantine remains a release gate before unrestricted production volume | Implementation + security gate | ACTIVE / PILOT FOUNDATION | Synthetic-only upload path |"
new = "| Secure file upload connector | v0.34 stores real-data uploads in tenant-scoped Firebase Storage quarantine first. Files remain unavailable to the finance workflow until a separate Firebase-authenticated platform SECURITY_REVIEWER clears them; rejection is immutable and audited. Automated malware scanning is still required for unrestricted PRODUCTION | Implementation + security gate | ACTIVE / CONTROLLED PILOT FOUNDATION | v0.33 validation-only upload hardening |"
if old not in text:
    raise SystemExit('secure upload CTR row not found')
anchor = "| Legacy technical workflow | `/lab` is retained as a direct/internal initialization/testing route but is not linked from the customer homepage | Implementation + UX boundary | ACTIVE | Public homepage Lab entry |"
extra = "| Platform security reviewer | Firebase custom claim `finclose_platform_roles` separates internal `SECURITY_REVIEWER` / `PLATFORM_ADMIN` authority from customer organization roles. Customers cannot clear their own quarantined financial files merely because they are organization owners/admins | v0.34 security architecture | ACTIVE / SOURCE IMPLEMENTED, LIVE CLAIM ASSIGNMENT REQUIRED | Customer-role-based upload clearance |\n| Authentication recovery UX | Customer onboarding includes Forgot password and verified-email recovery paths backed by Firebase OOB email flows. Unverified managed accounts cannot create/use real-data deployments | v0.34 implementation | ACTIVE / LIVE FIREBASE QA REQUIRED | Missing recovery/verification UX |\n"
if anchor not in text:
    raise SystemExit('CTR legacy anchor not found')
text = text.replace(anchor, extra + anchor, 1)
ctr.write_text(text)

# Pilot gate: distinguish source-complete controls from live verification.
gate = ROOT / 'docs/FIREBASE_PILOT_RELEASE_GATE.md'
g = gate.read_text()
g = g.replace('- Account registration/login/session revocation tested.\n- Email verification and password recovery flow completed before unrestricted production.', '- Firebase-managed account registration/login/session revocation tested live.\n- v0.34 email verification and password recovery source paths are implemented; verify delivery, completion and session refresh against the actual Firebase Auth tenant before PILOT.', 1)
g = g.replace('- Quarantine/malware handling approved for the pilot risk level.\n- No real financial file is accepted while the release gate is incomplete.', '- `MANUAL_REVIEW` pilot quarantine is exercised with a Firebase custom-claim `SECURITY_REVIEWER`; customer organization roles cannot self-clear uploads.\n- Review queue, quarantined-file download, CLEAN/REJECTED immutability and audit evidence are verified live.\n- Automated scanner remains mandatory before unrestricted PRODUCTION.\n- No real financial file is accepted while the release gate is incomplete.', 1)
gate.write_text(g)

print('v0.34 pilot hardening patch applied')
