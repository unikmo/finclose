import { payrollEngineSelfTestZA } from './lib/payroll-engine-za';
const r = payrollEngineSelfTestZA();
console.log('ZA self-test ok:', r.ok);
console.log('e4 eti', r.r4.employees[0].eti, 'balanced', r.r4.controls.journal_balanced);
console.log('e5 eti', r.r5.employees[0].eti, 'balanced', r.r5.controls.journal_balanced);
console.log('e6 eti', r.r6.employees[0].eti, 'balanced', r.r6.controls.journal_balanced);
console.log('e7 eti', r.r7.employees[0].eti, 'balanced', r.r7.controls.journal_balanced);
