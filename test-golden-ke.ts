import { calculateKePayroll } from './lib/payroll-engine-ke';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, payDate: string, expected: any) {
  const r = calculateKePayroll({
    pay_period_start: payDate, pay_period_end: payDate, pay_date: payDate,
    employees: [{ employee_id: id, gross_pay: gross, resident_status: 'RESIDENT' }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('NSSF employee', e.employee_nssf, expected.nssf) && allOk;
  allOk = check('SHIF', e.employee_shif, expected.shif) && allOk;
  allOk = check('AHL employee', e.employee_ahl, expected.ahl) && allOk;
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
}

run('KE-FEB-100K', 100000, '2026-02-28', { nssf: 6000, shif: 2750, ahl: 1500, paye: 19308.35 });
run('KE-FEB-200K', 200000, '2026-02-28', { nssf: 6480, shif: 5500, ahl: 3000, paye: 47889.35 });
run('KE-JAN-100K', 100000, '2026-01-31', { nssf: 4320, shif: 2750, ahl: 1500, paye: 19812.35 });
run('KE-LOW-8K', 8000, '2026-02-28', { nssf: 480, shif: 300, ahl: 120, paye: 0 });
run('KE-HIGH-900K', 900000, '2026-02-28', { nssf: 6480, shif: 24750, ahl: 13500, paye: 259227.85 });

console.log('');
console.log(allOk ? 'ALL KENYA GOLDEN FIXTURES: PASS' : 'KENYA GOLDEN FIXTURES: SOME FAILED');
