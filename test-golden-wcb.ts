import { payrollEngineSelfTestCA } from './lib/payroll-engine-ca';
const r = payrollEngineSelfTestCA();
console.log('CA self-test ok:', r.ok);
console.log('wcb employer_wcb', r.wcb.employees[0].employer_wcb, 'ytd_after', r.wcb.employees[0].ytd_wcb_assessable_earnings_after, 'balanced', r.wcb.controls.journal_balanced);
