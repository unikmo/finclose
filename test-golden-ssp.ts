import { payrollEngineSelfTestUK } from './lib/payroll-engine-uk';
const r = payrollEngineSelfTestUK();
console.log('UK self-test ok:', r.ok);
console.log('e3 ssp', r.r3.employees[0].ssp, 'gross', r.r3.employees[0].gross_pay, 'net', r.r3.employees[0].net_pay, 'balanced', r.r3.controls.journal_balanced);
