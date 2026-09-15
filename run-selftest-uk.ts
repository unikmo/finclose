import { payrollEngineSelfTestUK } from './lib/payroll-engine-uk';
const r = payrollEngineSelfTestUK();
console.log('OK:', r.ok);
if (!r.ok) {
  console.log('e1:', JSON.stringify(r.r1.employees[0], null, 2));
  console.log('e2:', JSON.stringify(r.r2.employees[0], null, 2));
}
