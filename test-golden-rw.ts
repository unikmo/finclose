import { calculateRwPayroll } from './lib/payroll-engine-rw';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.5;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, firstEmployer: boolean, ramaMember: boolean, expected: any) {
  const r = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: id, gross_pay: gross, employee_type: 'REGULAR', first_employer: firstEmployer,
      rama_member: ramaMember, rama_basic_salary: ramaMember ? gross : undefined
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
  allOk = check('Pension employee', e.employee_pension, expected.pension) && allOk;
  allOk = check('Maternity employee', e.employee_maternity, expected.maternity) && allOk;
  if (expected.rama !== undefined) allOk = check('RAMA employee', e.employee_rama, expected.rama) && allOk;
  allOk = check('OH employer', e.employer_oh, expected.oh) && allOk;
}

run('RW-FIRST-300K', 300000, true, false, { paye: 54000, pension: 18000, maternity: 900, oh: 6000 });
run('RW-SECOND-300K', 300000, false, false, { paye: 90000, pension: 18000, maternity: 900, oh: 6000 });
run('RW-RAMA-400K', 400000, true, true, { paye: 84000, pension: 24000, maternity: 1200, rama: 30000, oh: 8000 });
run('RW-LOW-60K', 60000, true, false, { paye: 0, pension: 3600, maternity: 180, oh: 1200 });
run('RW-310K', 310000, true, false, { paye: 57000, pension: 18600, maternity: 930, oh: 6200 });

console.log('');
console.log(allOk ? 'ALL RWANDA GOLDEN FIXTURES: PASS' : 'RWANDA GOLDEN FIXTURES: SOME FAILED');
