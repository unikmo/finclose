import { calculateZaPayroll } from './lib/payroll-engine-za';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, age: number, medMembers: number, medDeps: number, expected: any) {
  const r = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: id, gross_pay: gross, employee_age: age,
      medical_scheme_main_member: medMembers > 0, medical_scheme_dependants: medDeps,
      employer_sdl_liable: true
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
  allOk = check('UIF employee', e.employee_uif, expected.uif) && allOk;
  allOk = check('SDL employer', e.employer_sdl, expected.sdl) && allOk;
  allOk = check('Net pay', e.net_pay, expected.net) && allOk;
}

// ZA-REG-20K: gross 20000, age 40, 0 medical scheme members.
run('ZA-REG-20K', 20000, 40, 0, 0, { paye: 2115.0, uif: 177.12, sdl: 200.0, net: 17707.88 });
run('ZA-REG-40K', 40000, 40, 0, 0, { paye: 7684.75, uif: 177.12, sdl: 400.0, net: 32138.13 });
run('ZA-AGE65', 20000, 65, 0, 0, { paye: 1301.25, uif: 177.12, sdl: 200.0, net: 18521.63 });
// ZA-MED2: 2 medical scheme members -- fixture says "medical_scheme_members": 2
// (this engine models a main member + N dependants; interpreting "2 members"
// as main member + 1 dependant, since the fixture's own trace doesn't spell
// out the member/dependant split).
run('ZA-MED2 (main + 1 dependant)', 20000, 40, 1, 1, { paye: 1363.0, uif: 177.12, sdl: 200.0, net: 18459.88 });

// ZA-ETI: qualifying ETI employee, first 12 qualifying months, gross 5000,
// age 25. Fixture does not spell out eti_employment_months/eti_hours_worked
// explicitly, but "first 12 qualifying months" + a regular monthly fixture
// with no part-month note implies employment_months=1 (within 1-12) and a
// full month (160 hours) -- and R5,000 falls in the mid flat band
// (R2,500-R5,499.99 -> R1,500), matching the fixture's "ETI employer PAYE
// credit": 1500.0 exactly, confirming the interpretation.
{
  const r = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'ZA-ETI', gross_pay: 5000, employee_age: 25,
      medical_scheme_main_member: false, employer_sdl_liable: true,
      eti_eligible: true, eti_employment_months: 1, eti_hours_worked: 160
    }]
  });
  const e = r.employees[0];
  console.log('--- ZA-ETI ---');
  allOk = check('PAYE', e.paye, 0.0) && allOk;
  allOk = check('UIF employee', e.employee_uif, 50.0) && allOk;
  allOk = check('SDL employer', e.employer_sdl, 50.0) && allOk;
  allOk = check('ETI employer PAYE credit', e.eti, 1500.0) && allOk;
  allOk = check('Net pay', e.net_pay, 4950.0) && allOk;
}

// --- Boundary tests, per the QA pack's boundary_tests + the implementation
// reference's section 7 QA table. These are not JSON golden fixtures (the
// pack gives prose assertions, not fixture values) -- the expected figures
// below are derived directly from the reference document's own tables
// (Section 3, "ETI calculation currently effective") and from the engine's
// documented UIF cap, so there is no invented ground truth here.

// ZA-BND-UIF: R10,000 vs R17,712 (cap) vs R30,000 monthly UIF remuneration.
// Max per side R177.12.
{
  const mk = (gross: number) => calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'BND', gross_pay: gross, employee_age: 30, medical_scheme_main_member: false, employer_sdl_liable: false }]
  }).employees[0];
  console.log('--- ZA-BND-UIF ---');
  allOk = check('UIF @10000', mk(10000).employee_uif, 100.0) && allOk;
  allOk = check('UIF @17712 (cap)', mk(17712).employee_uif, 177.12) && allOk;
  allOk = check('UIF @30000 (over cap)', mk(30000).employee_uif, 177.12) && allOk;
}

// ZA-BND-SDL: employer_sdl_liable flag gates SDL on/off. The engine does
// NOT itself compute the R500,000 12-month projected-leviable-payroll test
// (documented limitation) -- the caller must supply the flag. This boundary
// test confirms the flag is honoured both ways; the R500k threshold
// computation itself remains a documented gap, not something this test can
// exercise inside the engine.
{
  const mk = (liable: boolean) => calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'BND-SDL', gross_pay: 20000, employee_age: 30, medical_scheme_main_member: false, employer_sdl_liable: liable }]
  }).employees[0];
  console.log('--- ZA-BND-SDL ---');
  allOk = check('SDL when liable', mk(true).employer_sdl, 200.0) && allOk;
  allOk = check('SDL when exempt', mk(false).employer_sdl, 0.0) && allOk;
}

// ZA-BND-ETI: R2,499.99 / 2,500 / 5,499.99 / 5,500 / 7,499.99 / 7,500,
// months 1-12 and months 13-24, full month (160 hours). Values computed
// directly from the reference's own ETI table (Section 3):
//   R0-R2,499.99: 60% (months 1-12) / 30% (months 13-24)
//   R2,500-R5,499.99: flat R1,500 / R750
//   R5,500-R7,499.99: R1,500-75%x(rem-5500) / R750-37.5%x(rem-5500)
//   R7,500+: 0 / 0
{
  const mk = (gross: number, months: number) => calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'BND-ETI', gross_pay: gross, employee_age: 25, medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: months, eti_hours_worked: 160
    }]
  }).employees[0];
  console.log('--- ZA-BND-ETI months 1-12 ---');
  allOk = check('@2499.99 (60%)', mk(2499.99, 1).eti, 1499.99) && allOk;
  allOk = check('@2500 (flat 1500)', mk(2500, 1).eti, 1500.0) && allOk;
  allOk = check('@5499.99 (flat 1500)', mk(5499.99, 1).eti, 1500.0) && allOk;
  allOk = check('@5500 (taper start)', mk(5500, 1).eti, 1500.0) && allOk;
  allOk = check('@7499.99 (taper near-zero)', mk(7499.99, 1).eti, 0.01) && allOk;
  allOk = check('@7500 (ineligible)', mk(7500, 1).eti, 0.0) && allOk;

  console.log('--- ZA-BND-ETI months 13-24 ---');
  allOk = check('@2499.99 (30%)', mk(2499.99, 13).eti, 750.0) && allOk;
  allOk = check('@2500 (flat 750)', mk(2500, 13).eti, 750.0) && allOk;
  allOk = check('@5499.99 (flat 750)', mk(5499.99, 13).eti, 750.0) && allOk;
  allOk = check('@5500 (taper start)', mk(5500, 13).eti, 750.0) && allOk;
  allOk = check('@7499.99 (taper near-zero)', mk(7499.99, 13).eti, 0.0) && allOk;
  allOk = check('@7500 (ineligible)', mk(7500, 13).eti, 0.0) && allOk;

  console.log('--- ZA-BND-ETI qualifying month 12 vs 13 (rate table switch) ---');
  allOk = check('month 12 (full rate, mid band)', mk(4000, 12).eti, 1500.0) && allOk;
  allOk = check('month 13 (half rate, mid band)', mk(4000, 13).eti, 750.0) && allOk;

  console.log('--- ZA-BND-ETI <160 hours gross-up/gross-down ---');
  // 1000 gross paid for 80 of 160 hours -> grossed-up remuneration for band
  // lookup = 1000*(160/80)=2000 (low band, 60%) -> 2000*0.6=1200, then
  // grossed back down to actual hours worked: 1200*(80/160)=600.00.
  const partMonth = calculateZaPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'BND-ETI-PARTHOURS', gross_pay: 1000, employee_age: 19, medical_scheme_main_member: false, employer_sdl_liable: false,
      eti_eligible: true, eti_employment_months: 1, eti_hours_worked: 80
    }]
  }).employees[0];
  allOk = check('80/160 hours, low band gross-up/down', partMonth.eti, 600.0) && allOk;
}

console.log('');
console.log(allOk ? 'ALL SOUTH AFRICA GOLDEN FIXTURES: PASS' : 'SOUTH AFRICA GOLDEN FIXTURES: SOME FAILED');
