import { payrollEngineSelfTestDE } from './lib/payroll-engine-de';
const r = payrollEngineSelfTestDE();
console.log('DE self-test ok:', r.ok);
