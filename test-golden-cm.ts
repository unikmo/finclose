import { calculateCmPayroll } from './lib/payroll-engine-cm';

function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.5;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}
let allOk = true;

function run(id: string, gross: number, riskGroup: 'A' | 'B' | 'C', expected: any) {
  const r = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: id, gross_pay: gross, sector_regime: 'GENERAL_OR_DOMESTIC',
      cnps_risk_group: riskGroup, employer_cfc_fne_exempt: false, crtv_exempt: false
    }]
  });
  const e = r.employees[0];
  console.log(`--- ${id} ---`);
  allOk = check('CNPS PVID employee', e.employee_cnps_pension, expected.pvid) && allOk;
  allOk = check('IRPP', e.irpp, expected.irpp) && allOk;
  allOk = check('CAC', e.cac, expected.cac) && allOk;
  allOk = check('CFC employee', e.employee_cfc, expected.cfc) && allOk;
  allOk = check('TDL', e.tdl, expected.tdl) && allOk;
  allOk = check('CRTV', e.crtv, expected.crtv) && allOk;
  allOk = check('Family allowances employer', e.employer_cnps_family_allowance, expected.family) && allOk;
  allOk = check('Occupational risk employer', e.employer_cnps_occupational_risk, expected.risk) && allOk;
}

run('CM-REG-100K', 100000, 'A', { pvid: 4200, irpp: 2413, cac: 241, cfc: 1000, tdl: 500, crtv: 750, family: 7000, risk: 1750 });
run('CM-CAP-800K', 800000, 'C', { pvid: 31500, irpp: 95392, cac: 9539, cfc: 8000, tdl: 2500, crtv: 9750, family: 52500, risk: 40000 });
run('CM-LOW-61999', 61999, 'A', { pvid: 2604, irpp: 0, cac: 0, cfc: 610, tdl: 0, crtv: 750, family: 4340, risk: 1085 });
run('CM-HIGH-1500K', 1500000, 'A', { pvid: 31500, irpp: 284392, cac: 28439, cfc: 15000, tdl: 2500, crtv: 13000, family: 52500, risk: 26250 });

console.log('');
console.log(allOk ? 'ALL CAMEROON GOLDEN FIXTURES: PASS' : 'CAMEROON GOLDEN FIXTURES: SOME FAILED');
