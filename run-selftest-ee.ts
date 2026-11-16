import { payrollEngineSelfTestEE } from './lib/payroll-engine-ee';

const r = payrollEngineSelfTestEE();
console.log('OK:', r.ok, '| estonia:', r.ok);
if (!r.ok) process.exitCode = 1;
