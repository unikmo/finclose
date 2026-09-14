import { calculateUsPayroll } from './lib/payroll-engine-us';

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

const r = calculateUsPayroll({
  pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
  employees: [{
    employee_id: 'E1', gross_pay: 10000, pay_frequency: 'MONTHLY',
    federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
    ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
    state: 'DE', de_filing_status: 'SINGLE_OR_MFS', de_exemptions: 1
  } as any]
});
const e = r.employees[0] as any;
console.log('journal_balanced', r.controls.journal_balanced, 'net_pay', e.net_pay);
// ded=3250; taxable=116750; bracket(>=60000):2943.5+0.066*(116750-60000)=2943.5+3745.5=6689
// credit=1*110=110; annualTax=6689-110=6579; /12=548.25
allOk = check('DE', e.de_income_tax, 548.25) && allOk;
console.log(allOk ? 'ALL DE CHECKS PASS' : 'DE CHECK FAILED');
