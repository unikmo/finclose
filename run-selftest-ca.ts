import { payrollEngineSelfTestCA } from './lib/payroll-engine-ca';
const r = payrollEngineSelfTestCA();
console.log('OK:', r.ok);
console.log('AB:', JSON.stringify(r.ab.employees[0], null, 2));
console.log('BC:', JSON.stringify(r.bc.employees[0], null, 2));
