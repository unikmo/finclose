// Golden fixture conformance test for lib/payroll-engine-uk.ts, driven by
// the user-supplied UK_2026_27_Payroll_QA_Golden_Pack
// (UK_2026_27_Payroll_Golden_Fixtures.json, verified 2026-09-14).
//
// Every employee_line + employer_line + net figure is asserted separately,
// to the penny, per the pack's own acceptance rule ("assert every employee
// and employer line separately", "controlled monetary lines use zero
// smallest-currency-unit tolerance"). "DYNAMIC" lines (pension amounts not
// pinned by the fixture) are intentionally not asserted.
//
// NOTE: this file exercises the payslip-level golden fixtures only. Per
// the pack's own "Acceptance" section and boundary_tests[].UK-BND-HMRC,
// HMRC's official 2026/27 payroll test data is "an additional mandatory
// conformance suite" that must ALSO be run before this rule pack could be
// considered for VERIFIED_BASIC_RULES — that official HMRC test pack is
// NOT available in this repo and is NOT covered by this file.

import { calculateUkPayroll, type UkPayrollRunInput, type UkEmployeeInput } from './lib/payroll-engine-uk';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}

let allOk = true;

function runFixture(id: string, name: string, employee: UkEmployeeInput, expected: {
  paye?: number;
  employeeNi?: number;
  employerNi?: number;
  studentLoan?: number;
  pgl?: number;
  gross: number;
  net: number;
}) {
  console.log(`--- ${id}: ${name} ---`);
  const input: UkPayrollRunInput = {
    pay_period_start: '2026-05-01',
    pay_period_end: '2026-05-31',
    pay_date: '2026-05-31',
    employees: [employee]
  };
  let r;
  try {
    r = calculateUkPayroll(input);
  } catch (e) {
    console.log(`FAIL ${id}: threw ${(e as Error).message}`);
    allOk = false;
    return;
  }
  const e = r.employees[0];
  if (expected.paye !== undefined) allOk = check(`${id} PAYE income tax`, e.paye_income_tax, expected.paye) && allOk;
  if (expected.employeeNi !== undefined) allOk = check(`${id} Employee Class 1 NIC`, e.employee_ni, expected.employeeNi) && allOk;
  if (expected.employerNi !== undefined) allOk = check(`${id} Employer Class 1 NIC`, e.employer_ni, expected.employerNi) && allOk;
  if (expected.studentLoan !== undefined) allOk = check(`${id} Student Loan`, e.student_loan_deduction, expected.studentLoan) && allOk;
  if (expected.pgl !== undefined) allOk = check(`${id} Postgraduate Loan`, e.postgraduate_loan_deduction, expected.pgl) && allOk;
  allOk = check(`${id} gross`, e.gross_pay, expected.gross) && allOk;
  allOk = check(`${id} net`, e.net_pay, expected.net) && allOk;
}

// UK-ENG-001: England 0T M1 + NI A + Plan 5 + PGL, monthly gross 3000.
runFixture('UK-ENG-001', 'England 0T M1 + NI A + Plan 5 + PGL', {
  employee_id: 'UK-ENG-001',
  gross_pay: 3000,
  pay_frequency: 'MONTHLY',
  tax_code: '0T M1',
  ni_category: 'A',
  student_loan_plan: 'PLAN_5',
  postgraduate_loan: true,
  pension_enrolled: false
}, {
  paye: 600.0,
  employeeNi: 156.16,
  employerNi: 387.45,
  studentLoan: 82,
  pgl: 75,
  gross: 3000.0,
  net: 2086.84
});

// UK-NI-M-001: Under-21 NI category M employer relief, monthly gross 3000.
runFixture('UK-NI-M-001', 'Under-21 NI category M employer relief', {
  employee_id: 'UK-NI-M-001',
  gross_pay: 3000,
  pay_frequency: 'MONTHLY',
  tax_code: '0T M1',
  ni_category: 'M',
  postgraduate_loan: false,
  pension_enrolled: false
}, {
  paye: 600.0,
  employeeNi: 156.16,
  employerNi: 0.0,
  gross: 3000.0,
  net: 2243.84
});

// UK-SCOT-001: Scotland S0T M1 low-pay starter band, monthly gross 300.
runFixture('UK-SCOT-001', 'Scotland S0T M1 low-pay starter band', {
  employee_id: 'UK-SCOT-001',
  gross_pay: 300,
  pay_frequency: 'MONTHLY',
  tax_code: 'S0T M1',
  ni_category: 'A',
  postgraduate_loan: false,
  pension_enrolled: false
}, {
  paye: 57.0,
  employeeNi: 0.0,
  employerNi: 0.0,
  gross: 300.0,
  net: 243.0
});

// UK-SSP-001: 2026 SSP low-AWE first-day rule, weekly, AWE=100, 5 qualifying
// days sick. Expected SSP (gross/net here, since there's no contractual pay)
// = lower of GBP123.25 and 80% x GBP100 = GBP80.00; PAYE 0; employee NIC 0.
// The fixture's "average_weekly_earnings" and "qualifying_days_sick" map to
// this engine's ssp_average_weekly_earnings / ssp_qualifying_days_paid.
// The fixture does not separately state qualifying_days_per_week; 5
// qualifying days sick out of a standard 5-day working week (the ordinary
// case, and consistent with the fixture's own "80% x GBP100 = GBP80" full-
// week trace, which requires daysPaid == daysPerWeek to land on a round
// number) is used here.
console.log('--- UK-SSP-001: 2026 SSP low-AWE first-day rule ---');
{
  const r = calculateUkPayroll({
    pay_period_start: '2026-05-11',
    pay_period_end: '2026-05-17',
    pay_date: '2026-05-15',
    employees: [{
      employee_id: 'UK-SSP-001',
      gross_pay: 0,
      pay_frequency: 'WEEKLY',
      tax_code: '1257L',
      ni_category: 'A',
      postgraduate_loan: false,
      pension_enrolled: false,
      ssp_qualifying_days_paid: 5,
      ssp_qualifying_days_per_week: 5,
      ssp_average_weekly_earnings: 100
    }]
  });
  const e = r.employees[0];
  allOk = check('UK-SSP-001 Statutory Sick Pay (earning)', e.ssp, 80.0) && allOk;
  allOk = check('UK-SSP-001 PAYE income tax', e.paye_income_tax, 0.0) && allOk;
  allOk = check('UK-SSP-001 Employee NIC', e.employee_ni, 0.0) && allOk;
  allOk = check('UK-SSP-001 gross', e.gross_pay, 80.0) && allOk;
  allOk = check('UK-SSP-001 net', e.net_pay, 80.0) && allOk;
}

// --- Boundary tests ---

// UK-BND-NI-UEL: at monthly gross above GBP4,189, category A employee NIC
// changes from 8% to 2% on the excess; employer NIC remains 15% over ST.
console.log('--- UK-BND-NI-UEL ---');
{
  const gross = 4689; // 500 above UEL
  const r = calculateUkPayroll({
    pay_period_start: '2026-05-01', pay_period_end: '2026-05-31', pay_date: '2026-05-31',
    employees: [{
      employee_id: 'BND-UEL', gross_pay: gross, pay_frequency: 'MONTHLY', tax_code: '1257L',
      ni_category: 'A', postgraduate_loan: false, pension_enrolled: false
    }]
  });
  const e = r.employees[0];
  // toUel = 4189-1048=3141 @8% = 251.28; aboveUel = 4689-4189=500 @2% = 10.00
  const expectedEmployeeNi = 251.28 + 10.00;
  const expectedEmployerNi = (gross - 417) * 0.15;
  allOk = check('UK-BND-NI-UEL Employee NIC', e.employee_ni, expectedEmployeeNi) && allOk;
  allOk = check('UK-BND-NI-UEL Employer NIC', e.employer_ni, Math.round(expectedEmployerNi * 100) / 100) && allOk;
}

// UK-BND-SL5: Plan 5 deductions, round down to whole pounds.
console.log('--- UK-BND-SL5 ---');
{
  const r = calculateUkPayroll({
    pay_period_start: '2026-05-01', pay_period_end: '2026-05-31', pay_date: '2026-05-31',
    employees: [{
      employee_id: 'BND-SL5', gross_pay: 2100, pay_frequency: 'MONTHLY', tax_code: '1257L',
      ni_category: 'A', student_loan_plan: 'PLAN_5', postgraduate_loan: false, pension_enrolled: false
    }]
  });
  const e = r.employees[0];
  // (2100 - 2083.33) * 9% = 1.5003 -> floor to 1
  allOk = check('UK-BND-SL5 Plan 5 deduction rounds down', e.student_loan_deduction, 1) && allOk;
}

// UK-BND-KCODE: K-code tax must respect HMRC's 50% cap. Not implemented —
// engine correctly REJECTS K codes rather than silently mis-taxing them.
console.log('--- UK-BND-KCODE (K codes rejected, not implemented) ---');
{
  try {
    calculateUkPayroll({
      pay_period_start: '2026-05-01', pay_period_end: '2026-05-31', pay_date: '2026-05-31',
      employees: [{
        // @ts-expect-error K codes are intentionally not a member of UkTaxCode
        employee_id: 'BND-K', gross_pay: 2000, pay_frequency: 'MONTHLY', tax_code: 'K475',
        ni_category: 'A', postgraduate_loan: false, pension_enrolled: false
      }]
    });
    console.log('FAIL UK-BND-KCODE: expected a rejection error for an unsupported K code, got a result instead');
    allOk = false;
  } catch (err) {
    console.log(`PASS UK-BND-KCODE: K code correctly rejected (${(err as Error).message})`);
  }
}

// UK-BND-HMRC: release gate reminder only — not executable from this repo.
console.log('--- UK-BND-HMRC: reminder only ---');
console.log('NOTE: HMRC official PAYE/NIC/Student Loan 2026/27 test vectors are a MANDATORY additional release gate per the golden pack; they are not available in this repo and are NOT exercised by this test file.');

console.log('');
console.log(allOk ? 'ALL UK GOLDEN FIXTURES: PASS' : 'UK GOLDEN FIXTURES: SOME FAILED');
if (!allOk) process.exitCode = 1;
