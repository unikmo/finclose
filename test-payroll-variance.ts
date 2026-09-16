// Pure-logic verification of payroll run-over-run variance -- no
// Firebase/network needed, since computePayrollVariance takes two
// already-prepared run records and is pure by design.
import { computePayrollVariance, VARIANCE_THRESHOLDS, type PayrollRunRecord } from './lib/payroll-variance';

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ': actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)));
  return ok;
}

let allOk = true;

function run(id: string, payDate: string, createdAt: number, employees: Array<{ employee_id: string; name?: string; gross_pay: number; net_pay: number }>): PayrollRunRecord {
  return {
    payroll_run_id: id,
    deployment_id: 'dep1',
    pay_date: payDate,
    created_at: createdAt,
    currency: 'USD',
    employees,
    totals: {
      gross_pay: employees.reduce((s, e) => s + e.gross_pay, 0),
      net_pay: employees.reduce((s, e) => s + e.net_pay, 0)
    },
    controls: { employee_count: employees.length }
  };
}

// 1. No prior run at all -> honest "no baseline", not a fabricated comparison.
const firstRun = run('r1', '2026-01-31', 1, [{ employee_id: 'E1', gross_pay: 5000, net_pay: 3900 }]);
const noBaseline = computePayrollVariance(firstRun, null);
allOk = check('no prior run -> has_baseline false', noBaseline.has_baseline, false) && allOk;
allOk = check('no prior run -> aggregate null', noBaseline.aggregate, null) && allOk;
allOk = check('no prior run -> needs_review false', noBaseline.summary.needs_review, false) && allOk;

// 2. New hire and termination.
const prevRun = run('r1', '2026-01-31', 1, [
  { employee_id: 'E1', gross_pay: 5000, net_pay: 3900 },
  { employee_id: 'E2', gross_pay: 4000, net_pay: 3200 }
]);
const currRun = run('r2', '2026-02-28', 2, [
  { employee_id: 'E1', gross_pay: 5000, net_pay: 3900 },
  { employee_id: 'E3', gross_pay: 4500, net_pay: 3600 }
]);
const v = computePayrollVariance(currRun, prevRun);
allOk = check('has_baseline true', v.has_baseline, true) && allOk;
allOk = check('new hires count', v.summary.new_hires, 1) && allOk;
allOk = check('terminated count', v.summary.terminated, 1) && allOk;
const e3 = v.employees.find(e => e.employee_id === 'E3')!;
allOk = check('E3 flagged NEW_HIRE', e3.flag_reasons, ['NEW_HIRE']) && allOk;
const e2 = v.employees.find(e => e.employee_id === 'E2')!;
allOk = check('E2 flagged TERMINATED', e2.flag_reasons, ['TERMINATED']) && allOk;
const e1Unchanged = v.employees.find(e => e.employee_id === 'E1')!;
allOk = check('E1 unchanged, not flagged', e1Unchanged.flagged, false) && allOk;
allOk = check('headcount delta', v.aggregate!.headcount, { current: 2, previous: 2, delta: 0 }) && allOk;

// 3. Material raise (both pct and $ thresholds crossed) -> flagged.
const raisePrev = run('r1', '2026-01-31', 1, [{ employee_id: 'E1', gross_pay: 5000, net_pay: 3900 }]);
const raiseCurr = run('r2', '2026-02-28', 2, [{ employee_id: 'E1', gross_pay: 5500, net_pay: 4250 }]); // +10%, +$500
const raiseVariance = computePayrollVariance(raiseCurr, raisePrev);
const raisedEmployee = raiseVariance.employees[0];
allOk = check('material raise flagged GROSS_PAY_CHANGE', raisedEmployee.flag_reasons, ['GROSS_PAY_CHANGE']) && allOk;
allOk = check('gross delta amount', raisedEmployee.gross_pay_delta_amount, 500) && allOk;

// 4. Tiny percentage move on a small salary, under the $ floor -> NOT flagged.
const tinyPrev = run('r1', '2026-01-31', 1, [{ employee_id: 'E1', gross_pay: 100, net_pay: 90 }]);
const tinyCurr = run('r2', '2026-02-28', 2, [{ employee_id: 'E1', gross_pay: 110, net_pay: 99 }]); // +10% but only $10
const tinyVariance = computePayrollVariance(tinyCurr, tinyPrev);
allOk = check('10% but $10 move stays under $ floor -> not flagged', tinyVariance.employees[0].flagged, false) && allOk;

// 5. Large dollar move on a huge salary, under the pct floor -> NOT flagged.
const bigPrev = run('r1', '2026-01-31', 1, [{ employee_id: 'E1', gross_pay: 100000, net_pay: 70000 }]);
const bigCurr = run('r2', '2026-02-28', 2, [{ employee_id: 'E1', gross_pay: 100200, net_pay: 70150 }]); // +$200 but only 0.2%
const bigVariance = computePayrollVariance(bigCurr, bigPrev);
allOk = check('$200 but 0.2% move stays under pct floor -> not flagged', bigVariance.employees[0].flagged, false) && allOk;

// 6. Net pay moves materially with gross pay unchanged (e.g. a benefit
// deduction or withholding table change) -> flagged for a different reason.
const netOnlyPrev = run('r1', '2026-01-31', 1, [{ employee_id: 'E1', gross_pay: 5000, net_pay: 3900 }]);
const netOnlyCurr = run('r2', '2026-02-28', 2, [{ employee_id: 'E1', gross_pay: 5000, net_pay: 3600 }]); // gross flat, net -$300 (-7.7%)
const netOnlyVariance = computePayrollVariance(netOnlyCurr, netOnlyPrev);
allOk = check('net-only material move flagged', netOnlyVariance.employees[0].flag_reasons, ['NET_PAY_CHANGE_WITHOUT_GROSS_CHANGE']) && allOk;

// 7. Aggregate needs_review when the total gross swing crosses the
// company-level threshold, even if no single employee individually flags.
const aggPrevEmployees = Array.from({ length: 10 }, (_, i) => ({ employee_id: `E${i}`, gross_pay: 5000, net_pay: 3900 }));
const aggCurrEmployees = aggPrevEmployees.map(e => ({ ...e, gross_pay: e.gross_pay * 1.06, net_pay: e.net_pay * 1.06 })); // uniform +6% raise across the board
const aggPrev = run('r1', '2026-01-31', 1, aggPrevEmployees);
const aggCurr = run('r2', '2026-02-28', 2, aggCurrEmployees);
const aggVariance = computePayrollVariance(aggCurr, aggPrev);
allOk = check('aggregate 6% gross swing exceeds 5% threshold -> needs_review', aggVariance.summary.needs_review, true) && allOk;
allOk = check('aggregate delta_pct is 0.06', aggVariance.aggregate!.gross_pay.delta_pct, 0.06) && allOk;

// 8. Thresholds are exposed for the API/UI to render, not hidden magic numbers.
allOk = check('thresholds exposed', VARIANCE_THRESHOLDS, { employee_material_pct: 0.03, employee_material_amount: 25, aggregate_material_pct: 0.05 }) && allOk;

console.log('');
console.log(allOk ? 'ALL PAYROLL-VARIANCE PURE-LOGIC TESTS: PASS' : 'PAYROLL-VARIANCE PURE-LOGIC TESTS: SOME FAILED');
if (!allOk) process.exit(1);
