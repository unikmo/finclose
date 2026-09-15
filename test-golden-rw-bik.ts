import { payrollEngineSelfTestRW } from './lib/payroll-engine-rw';
const r = payrollEngineSelfTestRW();
console.log('RW self-test ok:', r.ok);
console.log('vehicleBik', r.vehicleBik.employees[0].benefit_in_kind, r.vehicleBik.employees[0].paye, r.vehicleBik.controls.journal_balanced);
console.log('bothBik', r.bothBik.employees[0].benefit_in_kind, r.bothBik.employees[0].paye, r.bothBik.controls.journal_balanced);
