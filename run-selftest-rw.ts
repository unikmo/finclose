import { payrollEngineSelfTestRW } from './lib/payroll-engine-rw';
const r = payrollEngineSelfTestRW();
console.log('OK:', r.ok);
if (!r.ok) {
  console.log('first:', JSON.stringify(r.firstEmployer.employees[0], null, 2));
  console.log('second:', JSON.stringify(r.secondEmployer.employees[0], null, 2));
  console.log('pensionMaternity:', JSON.stringify(r.pensionMaternity.employees[0], null, 2));
  console.log('rama:', JSON.stringify(r.rama.employees[0], null, 2));
}
