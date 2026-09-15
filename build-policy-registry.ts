import fs from 'node:fs';
import crypto from 'node:crypto';

const rows = JSON.parse(fs.readFileSync('evidence-sources.json', 'utf8')) as Array<{ country: string; authority: string; instrument: string; url: string }>;

function idFor(country: string, url: string) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 10);
  return country.toLowerCase() + '_' + hash;
}

const lines: string[] = [];
lines.push('// Auto-generated from each payroll engine\'s own evidence array by');
lines.push('// build-policy-registry.ts (2026-09-15) -- do not hand-edit rows; add a new');
lines.push('// engine evidence entry and regenerate instead, so this registry can never');
lines.push('// drift from what the engines actually cite. See lib/policy-monitor.ts for');
lines.push('// how this registry is used.');
lines.push('');
lines.push('export type PolicyMonitorSource = {');
lines.push('  id: string;');
lines.push('  country: string;');
lines.push('  authority: string;');
lines.push('  instrument: string;');
lines.push('  url: string;');
lines.push('};');
lines.push('');
lines.push('export const POLICY_MONITOR_SOURCES: PolicyMonitorSource[] = [');
for (const row of rows) {
  const id = idFor(row.country, row.url);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  lines.push('  { id: \'' + id + '\', country: \'' + row.country + '\', authority: \'' + esc(row.authority) + '\', instrument: \'' + esc(row.instrument) + '\', url: \'' + esc(row.url) + '\' },');
}
lines.push('];');
lines.push('');

fs.writeFileSync('lib/policy-monitor-sources.ts', lines.join('\n'));
console.log('Wrote ' + rows.length + ' sources to lib/policy-monitor-sources.ts');
