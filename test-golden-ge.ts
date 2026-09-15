import { calculateGeorgiaPayroll } from './lib/payroll-engine';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, ytd: number, participant: boolean, expected: any, taxableBenefits = 0, exemptReimb = 0) {
  const r = calculateGeorgiaPayroll({
    pay_period_start: '2026-01-01', pay_period_end: '2026-01-31', pay_date: '2026-01-31',
    employees: [{
      employee_id: id, gross_pay: gross, pension_participant: participant, ytd_taxable_salary_before: ytd,
      taxable_benefits: taxableBenefits, exempt_cash_reimbursements: exemptReimb
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  if (expected.taxable !== undefined) allOk = check('Taxable salary/base', e.taxable_salary, expected.taxable) && allOk;
  allOk = check('PIT (income_tax)', e.income_tax, expected.pit) && allOk;
  allOk = check('Employee pension', e.employee_pension, expected.empPension) && allOk;
  allOk = check('Employer pension', e.employer_pension, expected.erPension) && allOk;
  allOk = check('State pension', e.state_pension, expected.statePension) && allOk;
  allOk = check('Cash net pay', e.net_pay, expected.net) && allOk;
}

run('GE-001', 3000, 0, true, { pit: 600, empPension: 60, erPension: 60, statePension: 60, net: 2340 });
run('GE-002', 3000, 23000, true, { pit: 600, empPension: 60, erPension: 60, statePension: 40, net: 2340 });
run('GE-003', 3000, 59000, true, { pit: 600, empPension: 60, erPension: 60, statePension: 10, net: 2340 });
run('GE-004', 3000, 0, false, { pit: 600, empPension: 0, erPension: 0, statePension: 0, net: 2400 });

console.log('--- GE-B01 (boundary: YTD=24000, current=1000, expect state=10) ---');
{
  const r = calculateGeorgiaPayroll({
    pay_period_start: '2026-01-01', pay_period_end: '2026-01-31', pay_date: '2026-01-31',
    employees: [{ employee_id: 'B1', gross_pay: 1000, pension_participant: true, ytd_taxable_salary_before: 24000 }]
  });
  allOk = check('State pension', r.employees[0].state_pension, 10) && allOk;
}
console.log('--- GE-B02 (boundary: YTD=60000, current=1000, expect state=0) ---');
{
  const r = calculateGeorgiaPayroll({
    pay_period_start: '2026-01-01', pay_period_end: '2026-01-31', pay_date: '2026-01-31',
    employees: [{ employee_id: 'B2', gross_pay: 1000, pension_participant: true, ytd_taxable_salary_before: 60000 }]
  });
  allOk = check('State pension', r.employees[0].state_pension, 0) && allOk;
}

run('GE-005', 3000, 0, true, { taxable: 3600, pit: 720, empPension: 72, erPension: 72, statePension: 72, net: 2208 }, 600, 0);
run('GE-006', 3000, 0, true, { taxable: 3000, pit: 600, empPension: 60, erPension: 60, statePension: 60, net: 2840 }, 0, 500);

console.log('');
console.log(allOk ? 'ALL GEORGIA GOLDEN FIXTURES: PASS' : 'GEORGIA GOLDEN FIXTURES: SOME FAILED');
