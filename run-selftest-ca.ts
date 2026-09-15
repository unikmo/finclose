import { payrollEngineSelfTestCA } from './lib/payroll-engine-ca';
const r = payrollEngineSelfTestCA();
console.log('OK:', r.ok);
console.log(JSON.stringify(r.r1.employees[0], null, 2));
