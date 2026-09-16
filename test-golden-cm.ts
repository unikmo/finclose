import { calculateCmPayroll } from './lib/payroll-engine-cm';

// XAF has zero smallest-currency-unit decimals (whole FCFA only) per the
// golden fixture pack's own acceptance criteria
// (controlled_numeric_tolerance_smallest_units: 0). Use a tight tolerance
// so a reintroduced fractional-FCFA bug (previously masked by a 0.5
// tolerance in this file) would be caught again.
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.001;
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
  allOk = check('CNPS PVID employer', e.employer_cnps_pension, expected.pvid) && allOk;
  allOk = check('IRPP', e.irpp, expected.irpp) && allOk;
  allOk = check('CAC', e.cac, expected.cac) && allOk;
  allOk = check('CFC employee', e.employee_cfc, expected.cfc) && allOk;
  allOk = check('CFC employer', e.employer_cfc, expected.cfcEr) && allOk;
  allOk = check('FNE employer', e.employer_fne, expected.fne) && allOk;
  allOk = check('TDL', e.tdl, expected.tdl) && allOk;
  allOk = check('CRTV', e.crtv, expected.crtv) && allOk;
  allOk = check('Family allowances employer', e.employer_cnps_family_allowance, expected.family) && allOk;
  allOk = check('Occupational risk employer', e.employer_cnps_occupational_risk, expected.risk) && allOk;
  allOk = check('Net pay', e.net_pay, expected.net) && allOk;
}

run('CM-REG-100K', 100000, 'A', { pvid: 4200, irpp: 2413, cac: 241, cfc: 1000, cfcEr: 1500, fne: 1000, tdl: 500, crtv: 750, family: 7000, risk: 1750, net: 90896 });
run('CM-CAP-800K', 800000, 'C', { pvid: 31500, irpp: 95392, cac: 9539, cfc: 8000, cfcEr: 12000, fne: 8000, tdl: 2500, crtv: 9750, family: 52500, risk: 40000, net: 643319 });
run('CM-LOW-61999', 61999, 'A', { pvid: 2604, irpp: 0, cac: 0, cfc: 610, cfcEr: 915, fne: 610, tdl: 0, crtv: 750, family: 4340, risk: 1085, net: 58035 });
run('CM-HIGH-1500K', 1500000, 'A', { pvid: 31500, irpp: 284392, cac: 28439, cfc: 15000, cfcEr: 22500, fne: 15000, tdl: 2500, crtv: 13000, family: 52500, risk: 26250, net: 1125169 });

console.log('');
console.log('--- Boundary tests ---');

// MU-BND-CNPS / CM-BND-CNPS: PVID and family-allowance branches cap their
// base at FCFA750,000/month; occupational risk does NOT use that cap.
{
  const r = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'CM-BND-CNPS', gross_pay: 2000000, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false }]
  });
  const e = r.employees[0];
  allOk = check('CM-BND-CNPS PVID employee capped at 750,000 base (31,500)', e.employee_cnps_pension, 31500) && allOk;
  allOk = check('CM-BND-CNPS family allowance capped at 750,000 base (52,500)', e.employer_cnps_family_allowance, 52500) && allOk;
  allOk = check('CM-BND-CNPS occupational risk UNCAPPED, full 2,000,000 base (35,000)', e.employer_cnps_occupational_risk, 35000) && allOk;
}

// CM-BND-CFC: salary-distribution base rounds DOWN to the lower FCFA1,000
// before applying 1% (employee) / 1.5% (employer) / 1% (FNE) rates.
{
  const under = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'CM-BND-CFC-99999', gross_pay: 99999, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: 99999 }]
  });
  allOk = check('CM-BND-CFC 99,999 rounds down to 99,000 base -> employee 990', under.employees[0].employee_cfc, 990) && allOk;
  allOk = check('CM-BND-CFC 99,999 -> employer 1,485', under.employees[0].employer_cfc, 1485) && allOk;
  allOk = check('CM-BND-CFC 99,999 -> FNE 990', under.employees[0].employer_fne, 990) && allOk;
  const exact = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'CM-BND-CFC-100000', gross_pay: 100000, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: 100000 }]
  });
  allOk = check('CM-BND-CFC exactly 100,000 -> employee 1,000 (no rounding needed)', exact.employees[0].employee_cfc, 1000) && allOk;
  const over = calculateCmPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'CM-BND-CFC-100001', gross_pay: 100001, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: 100001 }]
  });
  allOk = check('CM-BND-CFC 100,001 rounds down to 100,000 base -> employee 1,000', over.employees[0].employee_cfc, 1000) && allOk;
}

// CM-BND-TABLES: test every TDL and CRTV step boundary on both sides.
{
  const tdlBoundaries = [62000, 62001, 75000, 75001, 100000, 100001, 125000, 125001, 150000, 150001, 200000, 200001, 250000, 250001, 300000, 300001, 500000, 500001];
  const tdlExpected: Record<number, number> = {
    62000: 250, 62001: 250, 75000: 250, 75001: 500, 100000: 500, 100001: 750,
    125000: 750, 125001: 1000, 150000: 1000, 150001: 1250, 200000: 1250, 200001: 1500,
    250000: 1500, 250001: 2000, 300000: 2000, 300001: 2250, 500000: 2250, 500001: 2500
  };
  for (const basic of tdlBoundaries) {
    const r = calculateCmPayroll({
      pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
      employees: [{ employee_id: `CM-BND-TDL-${basic}`, gross_pay: basic, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false, basic_salary: basic }]
    });
    allOk = check(`CM-BND-TABLES TDL @ basic_salary=${basic}`, r.employees[0].tdl, tdlExpected[basic]) && allOk;
  }

  const crtvBoundaries = [50000, 50001, 100000, 100001, 200000, 200001, 300000, 300001, 400000, 400001, 500000, 500001, 600000, 600001, 700000, 700001, 800000, 800001, 900000, 900001, 1000000, 1000001];
  const crtvExpected: Record<number, number> = {
    50000: 0, 50001: 750, 100000: 750, 100001: 1950, 200000: 1950, 200001: 3250,
    300000: 3250, 300001: 4550, 400000: 4550, 400001: 5850, 500000: 5850, 500001: 7150,
    600000: 7150, 600001: 8450, 700000: 8450, 700001: 9750, 800000: 9750, 800001: 11050,
    900000: 11050, 900001: 12350, 1000000: 12350, 1000001: 13000
  };
  for (const gross of crtvBoundaries) {
    const r = calculateCmPayroll({
      pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
      employees: [{ employee_id: `CM-BND-CRTV-${gross}`, gross_pay: gross, sector_regime: 'GENERAL_OR_DOMESTIC', cnps_risk_group: 'A', employer_cfc_fne_exempt: false, crtv_exempt: false }]
    });
    allOk = check(`CM-BND-TABLES CRTV @ gross=${gross}`, r.employees[0].crtv, crtvExpected[gross]) && allOk;
  }
}

// CM-BND-DGI: release gate, not a numeric assertion — confirmed by reading
// the engine source. The rule pack's rates (CNPS PVID 4.2%/750,000 cap,
// etc.) match the CURRENT operative parameters this golden pack cites, NOT
// the DGI's own stale indicative table (2.8%/300,000), which the engine's
// evidence/limitations text already explicitly calls out and rejects. No
// code change needed here; documented for completeness.
console.log('INFO CM-BND-DGI: engine confirmed to use current 4.2%/750,000 CNPS parameters, not the stale DGI 2.8%/300,000 indicative table (see rule pack evidence[] and limitations[]).');

console.log('');
console.log(allOk ? 'ALL CAMEROON GOLDEN FIXTURES + BOUNDARY TESTS: PASS' : 'CAMEROON GOLDEN FIXTURES: SOME FAILED');
