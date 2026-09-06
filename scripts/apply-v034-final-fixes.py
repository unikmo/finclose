from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'expected text not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

# Duplicate uploads preserve their actual security status; never relabel a quarantined file as received.
for path, node in [
    ('lib/onboarding-history.ts', 'finclose_service_history'),
    ('lib/service-deployments.ts', 'finclose_service_sources'),
]:
    old = f"  if (existing.exists()) return {{ ...existing.val(), status: 'ALREADY_RECEIVED' }};"
    new = "  if (existing.exists()) return { ...existing.val(), duplicate: true };"
    replace_once(path, old, new)

# Deep health must fail closed when a real-data runtime has unresolved release blockers.
path = 'app/api/[...path]/route.ts'
replace_once(path,
"      const errors: string[] = [];\n",
"      const errors: string[] = [];\n      if (readiness.real_data_mode && !readiness.real_data_allowed_by_config) {\n        errors.push(`runtime: ${readiness.blockers.join(', ') || 'real-data release gate is not ready'}`);\n      }\n")
replace_once(path,
"      const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || firestore.ready);\n",
"      const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || firestore.ready);\n      const releaseOk = !readiness.real_data_mode || readiness.real_data_allowed_by_config;\n")
replace_once(path,
"        ok: infrastructureOk && engineOk && errors.length === 0,\n",
"        ok: infrastructureOk && engineOk && releaseOk && errors.length === 0,\n")

print('v0.34 final reliability fixes applied')
