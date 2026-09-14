import { calculateUsPayroll } from './lib/payroll-engine-us';

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

// Weekly, 0 exemptions, $600 gross: taxable 600 -> bracket >500.96:
// 8.02 + 2.99%*(600-500.96) = 8.02 + 2.9613... = 10.98 (rounded)
const r1 = calculateUsPayroll({
  pay_period_start: '2026-09-01', pay_period_end: '2026-09-07', pay_date: '2026-09-07',
  employees: [{ employee_id: 'OHW1', gross_pay: 600, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'OH', oh_exemptions: 0 } as any]
});
allOk = check('OH weekly $600/0ex', r1.employees[0].oh_income_tax, 10.98) && allOk;

// Monthly, 1 exemption, $10,000 gross: ded=54.17; taxable=9945.83
// -> bracket >8333.33: 218.99 + 3.4%*(9945.83-8333.33)=218.99+3.4%*1612.5
// = 218.99+54.825=273.815 -> 273.82 (or 273.81 depending on rounding)
const r2 = calculateUsPayroll({
  pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
  employees: [{ employee_id: 'OHM1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'OH', oh_exemptions: 1 } as any]
});
console.log('OH monthly $10000/1ex actual:', r2.employees[0].oh_income_tax);

console.log(allOk ? 'ALL OH v18 CHECKS PASS' : 'OH v18 CHECK FAILED');
