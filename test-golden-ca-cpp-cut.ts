import { payrollEngineSelfTestCA } from './lib/payroll-engine-ca';
const r = payrollEngineSelfTestCA();
console.log('CA self-test ok:', r.ok);
console.log('2027 CPP1', r.cppCut2027.employees[0].employee_cpp1, r.cppCut2027.controls.journal_balanced);
console.log('2026 CPP1 (pre-cut)', r.cppPreCut2026.employees[0].employee_cpp1, r.cppPreCut2026.controls.journal_balanced);
