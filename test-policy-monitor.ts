// Pure-logic verification of the policy monitor's signal-scanning and
// HTML-stripping helpers -- no Firebase or network access needed.
import { scanSignals, stripHtml, sourceCount } from './lib/policy-monitor';
import { POLICY_MONITOR_SOURCES } from './lib/policy-monitor-sources';

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
  return ok;
}

let allOk = true;

allOk = check(
  'stripHtml removes tags and collapses whitespace',
  stripHtml('<div>  <p>Hello   <b>world</b></p>\n\n<script>evil()</script></div>'),
  'Hello world'
) && allOk;

const plainText = 'The standard rate remains unchanged for this tax year.';
allOk = check('scanSignals: no signals on plain unchanged text', scanSignals(plainText, 2026).signals, []) && allOk;

const effectiveText = 'New withholding tables are effective January 1, 2027.';
allOk = check('scanSignals: detects effective-date language', scanSignals(effectiveText, 2026).signals.includes('effective-date language'), true) && allOk;

const proposedText = 'The proposed rate change is under review by the finance committee.';
allOk = check('scanSignals: detects proposed/consultation language', scanSignals(proposedText, 2026).signals.includes('proposed/consultation language'), true) && allOk;

const budgetText = 'Details were announced in Budget 2027 and the Finance Act 2027.';
allOk = check('scanSignals: detects budget/finance-act language', scanSignals(budgetText, 2026).signals.includes('budget/finance-act language'), true) && allOk;

const forwardYearText = 'The rate applies from 2026, with a further change planned for 2028.';
const forwardResult = scanSignals(forwardYearText, 2026);
allOk = check('scanSignals: flags 2028 as a forward year (asOfYear 2026)', forwardResult.forward_years_mentioned, ['2028']) && allOk;
allOk = check('scanSignals: does NOT flag 2026 itself as forward', forwardResult.forward_years_mentioned.includes('2026'), false) && allOk;

// Registry sanity: every source must be a real https URL, have a unique
// id, and be tagged to one of the countries this codebase actually has a
// payroll engine for.
const validCountries = new Set(['US', 'DE', 'GB', 'CA', 'KE', 'ZA', 'RW', 'MU', 'CM', 'GE']);
const ids = new Set<string>();
let registryOk = true;
for (const source of POLICY_MONITOR_SOURCES) {
  if (!/^https:\/\//.test(source.url)) { console.log('FAIL non-https url: ' + source.url); registryOk = false; }
  if (ids.has(source.id)) { console.log('FAIL duplicate id: ' + source.id); registryOk = false; }
  ids.add(source.id);
  if (!validCountries.has(source.country)) { console.log('FAIL unknown country: ' + source.country); registryOk = false; }
}
allOk = check('registry: all ' + sourceCount() + ' sources are well-formed (https, unique id, known country)', registryOk, true) && allOk;
allOk = check('registry: has at least one source per built engine', validCountries.size <= new Set(POLICY_MONITOR_SOURCES.map(s => s.country)).size, true) && allOk;

console.log('');
console.log(allOk ? 'ALL POLICY-MONITOR PURE-LOGIC TESTS: PASS' : 'POLICY-MONITOR PURE-LOGIC TESTS: SOME FAILED');
if (!allOk) process.exit(1);
