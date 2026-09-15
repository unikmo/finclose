import { payrollEngineSelfTestCM } from './lib/payroll-engine-cm';
const r = payrollEngineSelfTestCM();
console.log('OK:', r.ok);
if (!r.ok) {
  console.log('r1:', JSON.stringify(r.r1.employees[0], null, 2));
  console.log('belowThreshold:', r.belowThreshold.employees[0].irpp);
  console.log('cfc99999:', r.cfc99999.employees[0].employee_cfc);
  console.log('cfc100001:', r.cfc100001.employees[0].employee_cfc);
  console.log('exempt:', JSON.stringify(r.exempt.employees[0], null, 2));
}
