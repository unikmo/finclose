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
      rama_member: ramaMember, rama_basic_salary: ramaMember ? gross : undefined,
      cbhi_applicable: false // golden fixture pack sets CBHI_applicable=false on all fixtures
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
  allOk = check('Pension employee', e.employee_pension, expected.pension) && allOk;
  allOk = check('Pension employer', e.employer_pension, expected.pension) && allOk;
  allOk = check('Maternity employee', e.employee_maternity, expected.maternity) && allOk;
  allOk = check('Maternity employer', e.employer_maternity, expected.maternity) && allOk;
  if (expected.rama !== undefined) {
    allOk = check('RAMA employee', e.employee_rama, expected.rama) && allOk;
    allOk = check('RAMA employer', e.employer_rama, expected.rama) && allOk;
  }
  allOk = check('OH employer', e.employer_oh, expected.oh) && allOk;
  allOk = check('Net pay', e.net_pay, expected.net) && allOk;
}

// RW-FIRST-300K: gross 300,000, PAYE 54,000, pension 18,000, maternity 900, OH 6,000, net 227,100
run('RW-FIRST-300K', 300000, true, false, { paye: 54000, pension: 18000, maternity: 900, oh: 6000, net: 227100 });
// RW-SECOND-300K: non-first employer flat 30% PAYE = 90,000, net 191,100
run('RW-SECOND-300K', 300000, false, false, { paye: 90000, pension: 18000, maternity: 900, oh: 6000, net: 191100 });
// RW-RAMA-400K: RAMA member, PAYE 84,000, pension 24,000, maternity 1,200, RAMA 30,000, OH 8,000, net 260,800
run('RW-RAMA-400K', 400000, true, true, { paye: 84000, pension: 24000, maternity: 1200, rama: 30000, oh: 8000, net: 260800 });
// RW-LOW-60K: PAYE zero-band boundary, PAYE 0, net 56,220
run('RW-LOW-60K', 60000, true, false, { paye: 0, pension: 3600, maternity: 180, oh: 1200, net: 56220 });
// RW-310K: RRA published PAYE example level, PAYE 57,000, net 233,470
run('RW-310K', 310000, true, false, { paye: 57000, pension: 18600, maternity: 930, oh: 6200, net: 233470 });

console.log('');
console.log('--- Boundary tests ---');

// RW-BND-100001: at RWF100,001 first-employer taxable pay, PAYE before rounding
// is RWF4,000.20 (bracket [100000, 4000, 0.20]: 4000 + 0.20*(100001-100000) =
// 4000.20); RRA rounds monthly PAYE UP to whole RWF, so expected PAYE = 4,001.
{
  const r = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'RW-BND-100001', gross_pay: 100001, employee_type: 'REGULAR', first_employer: true, rama_member: false }]
  });
  allOk = check('RW-BND-100001 PAYE (round up)', r.employees[0].paye, 4001) && allOk;
}

// RW-BND-SECOND: non-first employer withholds at flat 30%, independent of the
// first-employer progressive bands, at multiple gross levels.
{
  for (const gross of [60000, 100001, 400000]) {
    const r = calculateRwPayroll({
      pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
      employees: [{ employee_id: `RW-BND-SECOND-${gross}`, gross_pay: gross, employee_type: 'REGULAR', first_employer: false, rama_member: false }]
    });
    allOk = check(`RW-BND-SECOND flat 30% @ ${gross}`, r.employees[0].paye, Math.ceil(gross * 0.30)) && allOk;
  }
}

// RW-BND-PENSION: 2026 pension stays 6%/6%; scheduled 2027+ increases must
// NOT be active even for a pay_date in 2027.
{
  const r2027 = calculateRwPayroll({
    pay_period_start: '2027-01-01', pay_period_end: '2027-01-31', pay_date: '2027-01-31',
    employees: [{ employee_id: 'RW-BND-PENSION-2027', gross_pay: 500000, employee_type: 'REGULAR', first_employer: true, rama_member: false }]
  });
  allOk = check('RW-BND-PENSION employee rate stays 6% in 2027 (not yet activated)', r2027.employees[0].employee_pension, 30000) && allOk;
  allOk = check('RW-BND-PENSION employer rate stays 6% in 2027 (not yet activated)', r2027.employees[0].employer_pension, 30000) && allOk;
}

// RW-BND-CBHI: CBHI_applicable=false (the fixture default) must produce
// zero CBHI and leave net pay unaffected; this is exactly the bug fixed in
// v3 of the rule pack (previously CBHI was always deducted).
{
  const r = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'RW-BND-CBHI-off', gross_pay: 300000, employee_type: 'REGULAR', first_employer: true, rama_member: false, cbhi_applicable: false }]
  });
  allOk = check('RW-BND-CBHI employee_cbhi is 0 when not applicable', r.employees[0].employee_cbhi, 0) && allOk;
  allOk = check('RW-BND-CBHI net pay unaffected when not applicable', r.employees[0].net_pay, 227100) && allOk;

  // Sanity check the opposite: when explicitly opted in, CBHI is still
  // computed (non-zero) — confirms the flag actually gates the calculation
  // rather than disabling it entirely.
  const rOn = calculateRwPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'RW-BND-CBHI-on', gross_pay: 300000, employee_type: 'REGULAR', first_employer: true, rama_member: false, cbhi_applicable: true }]
  });
  allOk = check('RW-BND-CBHI employee_cbhi is non-zero when opted in', rOn.employees[0].employee_cbhi > 0 ? 1 : 0, 1) && allOk;
}

console.log('');
console.log(allOk ? 'ALL RWANDA GOLDEN FIXTURES + BOUNDARY TESTS: PASS' : 'RWANDA GOLDEN FIXTURES: SOME FAILED');
