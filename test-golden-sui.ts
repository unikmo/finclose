import { payrollEngineSelfTestUS } from './lib/payroll-engine-us';

const r = payrollEngineSelfTestUS();
console.log('overall ok:', r.ok);
const s = r.suiCase.employees;
console.log('SUI-001 employer_sui:', s[0].employer_sui, 'ytd_sui_wages_after:', s[0].ytd_sui_wages_after);
console.log('SUI-002 employer_sui:', s[1].employer_sui, 'ytd_sui_wages_after:', s[1].ytd_sui_wages_after);
console.log('totals.sui:', r.suiCase.totals.sui);
console.log('journal_balanced:', r.suiCase.controls.journal_balanced);
