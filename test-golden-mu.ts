import { calculateMuPayroll } from './lib/payroll-engine-mu';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, priorCumulative: number, priorPaye: number, prgfExempt: boolean, expected: any) {
  const r = calculateMuPayroll({
    pay_period_start: '2026-07-01', pay_period_end: '2026-07-31', pay_date: '2026-07-31',
    employees: [{
      employee_id: id, gross_pay: gross, resident_status: 'RESIDENT', pay_period_sequence: 1,
      cumulative_emoluments_before: priorCumulative, paye_withheld_ytd_before: priorPaye,
      annual_edf_reliefs_total: 0, nsf_worker_category: 'OTHER', prgf_private_pension_exempt: prgfExempt
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('PAYE', e.paye, expected.paye) && allOk;
  allOk = check('CSG employee', e.employee_csg, expected.csgEe) && allOk;
  allOk = check('CSG employer', e.employer_csg, expected.csgEr) && allOk;
  allOk = check('NSF employee', e.employee_nsf, expected.nsfEe) && allOk;
  allOk = check('Training Levy employer', e.employer_training_levy, expected.trainingLevy) && allOk;
  allOk = check('PRGF employer', e.employer_prgf, expected.prgf) && allOk;
}

run('MU-60K-P1', 60000, 0, 0, false, { paye: 0, csgEe: 1800, csgEr: 3600, nsfEe: 297.1, trainingLevy: 900, prgf: 2700 });
run('MU-100K-P6', 100000, 500000, 0, false, { paye: 10000, csgEe: 3000, csgEr: 6000, nsfEe: 297.1, trainingLevy: 1500, prgf: 4500 });
run('MU-CSG-50K', 50000, 0, 0, false, { paye: 0, csgEe: 750, csgEr: 1500, nsfEe: 297.1, trainingLevy: 750, prgf: 2250 });
run('MU-CSG-50001', 50001, 0, 0, false, { paye: 0, csgEe: 1500.03, csgEr: 3000.06, nsfEe: 297.1, trainingLevy: 750.02, prgf: 2250.05 });
run('MU-PRGF-EXEMPT', 60000, 0, 0, true, { paye: 0, csgEe: 1800, csgEr: 3600, nsfEe: 297.1, trainingLevy: 900, prgf: 0 });

console.log('');
console.log(allOk ? 'ALL MAURITIUS GOLDEN FIXTURES: PASS' : 'MAURITIUS GOLDEN FIXTURES: SOME FAILED');
console.log('(MU-DIR-100K NOT tested: director/board fee special path not implemented.)');
