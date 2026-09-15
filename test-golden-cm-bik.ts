import { payrollEngineSelfTestCM } from './lib/payroll-engine-cm';
const r = payrollEngineSelfTestCM();
console.log('CM self-test ok:', r.ok);
console.log(r.housingBik.employees[0]);
