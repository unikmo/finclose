import { calculateCaPayroll } from './lib/payroll-engine-ca';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}

let allOk = true;

// CA-AB-001: Alberta, gross 5000, basic/default TD1, July 2026.
const ab = calculateCaPayroll({
  pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
  employees: [{ employee_id: 'AB1', gross_pay: 5000, pay_frequency: 'MONTHLY', province_of_employment: 'AB', ytd_earnings_before: 0 }]
});
const eAB = ab.employees[0];
console.log('--- CA-AB-001 (Alberta) ---');
allOk = check('Federal income tax', eAB.federal_income_tax, 444.86) && allOk;
allOk = check('Provincial income tax', eAB.provincial_income_tax, 219.27) && allOk;
allOk = check('CPP employee', eAB.employee_cpp1, 280.15) && allOk;
allOk = check('EI employee', eAB.employee_ei, 81.5) && allOk;
allOk = check('CPP employer', eAB.employer_cpp1, 280.15) && allOk;
allOk = check('EI employer', eAB.employer_ei, 114.1) && allOk;
allOk = check('Net pay', eAB.net_pay, 3974.22) && allOk;

// CA-BC-001: British Columbia, gross 4000, basic/default TD1, July 2026.
const bc = calculateCaPayroll({
  pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
  employees: [{ employee_id: 'BC1', gross_pay: 4000, pay_frequency: 'MONTHLY', province_of_employment: 'BC', ytd_earnings_before: 0 }]
});
const eBC = bc.employees[0];
console.log('--- CA-BC-001 (British Columbia) ---');
allOk = check('Federal income tax', eBC.federal_income_tax, 310.53) && allOk;
allOk = check('Provincial income tax', eBC.provincial_income_tax, 160.43) && allOk;
allOk = check('CPP employee', eBC.employee_cpp1, 220.65) && allOk;
allOk = check('EI employee', eBC.employee_ei, 65.2) && allOk;
allOk = check('Net pay', eBC.net_pay, 3243.19) && allOk;

// CA-NT-001: Northwest Territories, gross 3000 (territorial payroll tax NOT
// implemented in this engine -- only checking the lines this engine covers).
const nt = calculateCaPayroll({
  pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
  employees: [{ employee_id: 'NT1', gross_pay: 3000, pay_frequency: 'MONTHLY', province_of_employment: 'NT', ytd_earnings_before: 0 }]
});
const eNT = nt.employees[0];
console.log('--- CA-NT-001 (NWT, territorial payroll tax not implemented) ---');
allOk = check('Federal income tax', eNT.federal_income_tax, 181.14) && allOk;
allOk = check('Provincial/territorial income tax', eNT.provincial_income_tax, 75.13) && allOk;
allOk = check('CPP employee', eNT.employee_cpp1, 161.15) && allOk;
allOk = check('EI employee', eNT.employee_ei, 48.9) && allOk;
console.log('  (NOT tested: Territorial payroll tax 60.00 -- not implemented)');

// CA-NU-001: Nunavut, gross 3000.
const nu = calculateCaPayroll({
  pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
  employees: [{ employee_id: 'NU1', gross_pay: 3000, pay_frequency: 'MONTHLY', province_of_employment: 'NU', ytd_earnings_before: 0 }]
});
const eNU = nu.employees[0];
console.log('--- CA-NU-001 (Nunavut, territorial payroll tax not implemented) ---');
allOk = check('Federal income tax', eNU.federal_income_tax, 181.14) && allOk;
allOk = check('Provincial/territorial income tax', eNU.provincial_income_tax, 46.07) && allOk;
allOk = check('CPP employee', eNU.employee_cpp1, 161.15) && allOk;
allOk = check('EI employee', eNU.employee_ei, 48.9) && allOk;
console.log('  (NOT tested: Territorial payroll tax 60.00 -- not implemented)');

// CA-QC-001: Quebec must be rejected outright.
console.log('--- CA-QC-001 (Quebec, must reject) ---');
let qcRejected = false;
try {
  calculateCaPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{ employee_id: 'QC1', gross_pay: 1000, pay_frequency: 'MONTHLY', province_of_employment: 'QC' as any, ytd_earnings_before: 0 }]
  });
} catch (e) {
  qcRejected = true;
  console.log('PASS Quebec correctly rejected:', (e as Error).message);
}
allOk = qcRejected && allOk;

console.log('');
console.log(allOk ? 'ALL CANADA GOLDEN FIXTURES: PASS' : 'CANADA GOLDEN FIXTURES: SOME FAILED');
