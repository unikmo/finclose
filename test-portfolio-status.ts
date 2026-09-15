// Pure-logic verification of the portfolio traffic-light rules -- no
// Firebase/network needed, since deriveCloseStatus takes an
// already-computed close record and is pure by design.
import { deriveCloseStatus, portfolioSummaryCounts, type PortfolioRow } from './lib/portfolio-status';

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
  return ok;
}

let allOk = true;

allOk = check('no close record at all -> NOT_STARTED', deriveCloseStatus(null), { status: 'NOT_STARTED', reasons: [] }) && allOk;

allOk = check(
  'clean pass, no exceptions -> GREEN',
  deriveCloseStatus({ exceptions: [], control_status: 'PASS', close_status: 'PREPARED_NOT_CLOSED' }),
  { status: 'GREEN', reasons: [] }
) && allOk;

allOk = check(
  'unreconciled bank items only -> YELLOW',
  deriveCloseStatus({ exceptions: ['BANK_RECONCILIATION_UNMATCHED_BANK_ITEMS'], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'YELLOW', reasons: ['BANK_RECONCILIATION_UNMATCHED_BANK_ITEMS'] }
) && allOk;

allOk = check(
  'unbalanced payroll journal -> RED (brief: "required payroll input missing" tier)',
  deriveCloseStatus({ exceptions: ['PAYROLL_JOURNAL_NOT_BALANCED'], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'RED', reasons: ['PAYROLL_JOURNAL_NOT_BALANCED'] }
) && allOk;

allOk = check(
  'bank feed / control not provided -> RED',
  deriveCloseStatus({ exceptions: ['BANK_CLOSING_BALANCE_CONTROL_NOT_PROVIDED'], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'RED', reasons: ['BANK_CLOSING_BALANCE_CONTROL_NOT_PROVIDED'] }
) && allOk;

allOk = check(
  'mix of RED and YELLOW codes -> RED wins, only RED reasons surfaced first',
  deriveCloseStatus({ exceptions: ['BANK_RECONCILIATION_AMBIGUOUS_ITEMS', 'BANK_CLOSING_BALANCE_DIFFERENCE'], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'RED', reasons: ['BANK_CLOSING_BALANCE_DIFFERENCE'] }
) && allOk;

allOk = check(
  'unknown/future exception code -> YELLOW, never silently GREEN',
  deriveCloseStatus({ exceptions: ['SOME_NEW_CHECK_NOT_YET_CLASSIFIED'], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'YELLOW', reasons: ['SOME_NEW_CHECK_NOT_YET_CLASSIFIED'] }
) && allOk;

allOk = check(
  'inconsistent record: no exceptions but control_status not PASS -> YELLOW, not trusted blindly',
  deriveCloseStatus({ exceptions: [], control_status: 'EXCEPTIONS_OPEN' }),
  { status: 'YELLOW', reasons: ['CONTROL_STATUS_NOT_PASS_WITH_NO_EXCEPTIONS'] }
) && allOk;

// portfolioSummaryCounts aggregation sanity
const sampleRows: PortfolioRow[] = [
  { company_id: 'a', organization_id: 'o1', legal_name: 'A', country_code: 'US', service_scope: 'PAYROLL_ONLY', status: 'GREEN', reasons: [] },
  { company_id: 'b', organization_id: 'o2', legal_name: 'B', country_code: 'GB', service_scope: 'BOOKKEEPING_ONLY', status: 'YELLOW', reasons: ['X'] },
  { company_id: 'c', organization_id: 'o3', legal_name: 'C', country_code: 'CA', service_scope: 'BOOKKEEPING_AND_PAYROLL', status: 'RED', reasons: ['Y'] },
  { company_id: 'd', organization_id: 'o4', legal_name: 'D', country_code: 'DE', service_scope: 'BOOKKEEPING_ONLY', status: 'NOT_STARTED', reasons: [] }
];
const summary = portfolioSummaryCounts(sampleRows);
allOk = check('summary counts', summary, {
  total: 4, green: 1, yellow: 1, red: 1, not_started: 1,
  needs_attention_company_ids: ['b', 'c']
}) && allOk;

console.log('');
console.log(allOk ? 'ALL PORTFOLIO-STATUS PURE-LOGIC TESTS: PASS' : 'PORTFOLIO-STATUS PURE-LOGIC TESTS: SOME FAILED');
if (!allOk) process.exit(1);
