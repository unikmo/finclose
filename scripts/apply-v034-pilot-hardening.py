from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

# Managed identity: the explicit release gate controls account/session activation too.
path = 'lib/managed-auth.ts'
replace_once(path,
"import { firebaseClientConfig, isRealDataMode } from './runtime-mode';",
"import { assertRealDataRuntimeReady, firebaseClientConfig, isRealDataMode } from './runtime-mode';")
for marker in [
    "export async function requestPasswordReset(input: Record<string, unknown>) {\n  if (!isRealDataMode()) throw httpError('managed password reset is only enabled in PILOT or PRODUCTION mode', 409);",
    "export async function resendVerification(input: Record<string, unknown>) {\n  if (!isRealDataMode()) throw httpError('managed verification is only enabled in PILOT or PRODUCTION mode', 409);",
    "export async function createFirebaseSessionResponse(idToken: string) {\n  if (!isRealDataMode()) throw httpError('Firebase session exchange is only enabled in PILOT or PRODUCTION mode', 409);",
    "export async function registerManagedAccount(input: Record<string, unknown>) {\n  if (!isRealDataMode()) throw httpError('managed registration is only enabled in PILOT or PRODUCTION mode', 409);",
    "export async function loginManagedAccount(input: Record<string, unknown>) {\n  if (!isRealDataMode()) throw httpError('managed login is only enabled in PILOT or PRODUCTION mode', 409);"
]:
    replace_once(path, marker, marker + "\n  assertRealDataRuntimeReady();")

# Customer onboarding: verified managed identity is the real-data account gate; quarantined history cannot unlock the connector.
path = 'app/start/[service]/ServiceOnboarding.tsx'
replace_once(path,
"type User = { user_id: string; name: string; email: string };",
"type User = { user_id: string; name: string; email: string; email_verified?: boolean; auth_mode?: string };")
replace_once(path,
"  const [password, setPassword] = useState('');\n",
"  const [password, setPassword] = useState('');\n  const [verificationPassword, setVerificationPassword] = useState('');\n")
replace_once(path,
"  const companyInitializationRequired = serviceKey !== 'balance-books';\n  const companyComplete = Boolean(user && (!companyInitializationRequired || deployment?.company_id));\n  const historyComplete = Boolean(deployment && (deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY' || historyResults.length));\n",
"  const companyInitializationRequired = serviceKey !== 'balance-books';\n  const managedRealDataAccount = Boolean(user?.auth_mode === 'FIREBASE_AUTH_SESSION');\n  const accountComplete = Boolean(user && (!managedRealDataAccount || user.email_verified === true));\n  const companyComplete = Boolean(accountComplete && (!companyInitializationRequired || deployment?.company_id));\n  const historyComplete = Boolean(deployment && (deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY'));\n")
replace_once(path,
"  const currentPhase = !user ? 0 : companyInitializationRequired && !companyComplete ? 1 : !historyComplete ? (companyInitializationRequired ? 2 : 1) : (companyInitializationRequired ? 3 : 2);",
"  const currentPhase = !accountComplete ? 0 : companyInitializationRequired && !companyComplete ? 1 : !historyComplete ? (companyInitializationRequired ? 2 : 1) : (companyInitializationRequired ? 3 : 2);")
replace_once(path,
"    if (!user || !profile || deployment || restoring) return;",
"    if (!accountComplete || !user || !profile || deployment || restoring) return;")
replace_once(path,
"      setUser(result.user);\n      setPassword('');\n      setNote(authMode === 'register' ? 'Account created. Continue with the company setup this service requires.' : 'Signed in. Continue where you left off.');",
"      setUser(result.user);\n      setPassword('');\n      if (result.verification_required) {\n        setNote('Check your email and verify the address. Real financial-data access stays locked until verification is complete and you sign in again.');\n      } else {\n        setNote(authMode === 'register' ? 'Account created. Continue with the company setup this service requires.' : 'Signed in. Continue where you left off.');\n      }")
insert_after = "  async function submitAccount() {\n"
# Insert helper functions before signOut, preserving submitAccount itself.
needle = "  async function signOut() {\n"
helpers = "  async function requestPasswordReset() {\n    if (!email) return;\n    setBusy(true);\n    try {\n      const result = await api('/account/password-reset', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ email })\n      });\n      setNote(result.message || 'If an account exists for that email, password reset instructions will be sent.');\n    } catch (error: any) {\n      setNote(`Error: ${error.message}`);\n    } finally { setBusy(false); }\n  }\n\n  async function resendVerification() {\n    if (!user?.email || !verificationPassword) return;\n    setBusy(true);\n    try {\n      await api('/account/verification', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ email: user.email, password: verificationPassword })\n      });\n      setVerificationPassword('');\n      setNote('Verification email sent. After verifying, sign out and sign in again so FinClose receives the verified Firebase identity.');\n    } catch (error: any) {\n      setNote(`Error: ${error.message}`);\n    } finally { setBusy(false); }\n  }\n\n"
replace_once(path, needle, helpers + needle)
replace_once(path,
"    if (!profile || !user) return null;",
"    if (!profile || !user || !accountComplete) return null;")
replace_once(path,
"      setNote(`${received.length} prior file${received.length === 1 ? '' : 's'} received. Current-system connection is now available.`);",
"      const quarantined = received.some(item => item.status === 'QUARANTINED');\n      setNote(quarantined\n        ? `${received.length} prior file${received.length === 1 ? '' : 's'} stored in security quarantine. Current-system connection remains locked until an authorized review clears the history.`\n        : `${received.length} prior file${received.length === 1 ? '' : 's'} received. Current-system connection is now available.`);")
replace_once(path,
"      setNote(`${result.status}: current source received. SHA ${String(result.sha256).slice(0, 12)}…`);",
"      setNote(result.status === 'QUARANTINED'\n        ? `Current source stored in security quarantine. FinClose will not process it until an authorized review clears it. SHA ${String(result.sha256).slice(0, 12)}…`\n        : `${result.status}: current source received. SHA ${String(result.sha256).slice(0, 12)}…`);")
replace_once(path,
"  const heroText = !user\n    ? 'Start with your FinClose account. After that, we ask only for the company information this service actually needs.'\n",
"  const heroText = !user\n    ? 'Start with your FinClose account. After that, we ask only for the company information this service actually needs.'\n    : !accountComplete\n      ? 'Verify your Firebase email address before FinClose unlocks company or real financial-data access.'\n")
replace_once(path,
"          <button className=\"service-primary\" onClick={submitAccount} disabled={busy || !email || !password || (authMode === 'register' && !name)}>{authMode === 'register' ? 'Create account & continue' : 'Sign in & continue'}</button>\n        </div>\n      </section>}\n\n      {user && companyInitializationRequired",
"          <button className=\"service-primary\" onClick={submitAccount} disabled={busy || !email || !password || (authMode === 'register' && !name)}>{authMode === 'register' ? 'Create account & continue' : 'Sign in & continue'}</button>\n          {authMode === 'login' && <button className=\"service-secondary\" onClick={requestPasswordReset} disabled={busy || !email}>Forgot password?</button>}\n        </div>\n      </section>}\n\n      {user && managedRealDataAccount && !user.email_verified && <section className=\"focus-panel auth-panel\">\n        <div className=\"focus-kicker\">STEP 1</div>\n        <h2>Verify your email</h2>\n        <p className=\"focus-lead\">Firebase Authentication has created your account, but FinClose will not allow real financial-data operations until the email address is verified.</p>\n        <div className=\"setup-block account-form\">\n          <div className=\"completed-line\"><span>✓</span> Account created · {user.email}</div>\n          <label><span>Password</span><input type=\"password\" value={verificationPassword} onChange={e => setVerificationPassword(e.target.value)} autoComplete=\"current-password\" /></label>\n          <button className=\"service-primary\" onClick={resendVerification} disabled={busy || !verificationPassword}>Resend verification email</button>\n          <div className=\"field-hint\">After verifying the email, sign out and sign in again to refresh the verified Firebase session.</div>\n          <button className=\"service-secondary\" onClick={signOut} disabled={busy}>Sign out</button>\n        </div>\n      </section>}\n\n      {accountComplete && user && companyInitializationRequired")
replace_once(path,
"      {user && companyComplete && !historyComplete && deployment && <section className=\"focus-panel\">",
"      {accountComplete && user && companyComplete && !historyComplete && deployment && <section className=\"focus-panel\">")
# Any final system-connection section that starts with user should also require accountComplete.
text = Path(path).read_text()
text = text.replace("      {user && historyComplete && deployment && <section", "      {accountComplete && user && historyComplete && deployment && <section")
Path(path).write_text(text)

# Session lookup must not provision tenant state for an unverified managed identity.
path = 'app/api/[...path]/route.ts'
replace_once(path,
"      if (user && isRealDataMode()) await ensurePersonalOrganization(user);",
"      if (user && isRealDataMode() && user.email_verified) await ensurePersonalOrganization(user);")
Path(path).write_text(Path(path).read_text().replace("version: '0.33.0'", "version: '0.34.0'"))

# Version metadata.
path = 'package.json'
Path(path).write_text(Path(path).read_text().replace('"version": "0.33.0"', '"version": "0.34.0"', 1))
path = 'package-lock.json'
Path(path).write_text(Path(path).read_text().replace('"version": "0.33.0"', '"version": "0.34.0"', 2))

print('v0.34 pilot hardening patch applied')
