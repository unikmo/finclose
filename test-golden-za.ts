import { calculateZaPayroll } from './lib/payroll-engine-za';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, age: number, medMembers: number, medDeps: number, expected: any) {
  const r = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: id, gross_pay: gross, employee_age: age,
      medical_scheme_main_member: medMembers > 0, medical_scheme_dependants: medDeps,
      employer_sdl_liable: true
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
  allOk = check('UIF employee', e.employee_uif, expected.uif) && allOk;
  allOk = check('SDL employer', e.employer_sdl, expected.sdl) && allOk;
}

// ZA-REG-20K: gross 20000, age 40, 0 medical scheme members.
run('ZA-REG-20K', 20000, 40, 0, 0, { paye: 2115.0, uif: 177.12, sdl: 200.0 });
run('ZA-REG-40K', 40000, 40, 0, 0, { paye: 7684.75, uif: 177.12, sdl: 400.0 });
run('ZA-AGE65', 20000, 65, 0, 0, { paye: 1301.25, uif: 177.12, sdl: 200.0 });
// ZA-MED2: 2 medical scheme members -- fixture says "medical_scheme_members": 2
// (this engine models a main member + N dependants; interpreting "2 members"
// as main member + 1 dependant, since the fixture's own trace doesn't spell
// out the member/dependant split).
run('ZA-MED2 (main + 1 dependant)', 20000, 40, 1, 1, { paye: 1363.0, uif: 177.12, sdl: 200.0 });

console.log('');
console.log(allOk ? 'ALL SOUTH AFRICA GOLDEN FIXTURES: PASS' : 'SOUTH AFRICA GOLDEN FIXTURES: SOME FAILED');
console.log('(ZA-ETI fixture NOT tested: ETI is not implemented in this engine.)');
