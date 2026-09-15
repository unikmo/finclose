import { payrollEngineSelfTestMU } from './lib/payroll-engine-mu';
const r = payrollEngineSelfTestMU();
console.log('OK:', r.ok);
if (!r.ok) {
  console.log('b500000:', r.b500000.employees[0].paye);
  console.log('b500001:', r.b500001.employees[0].paye);
  console.log('b12m:', r.b12m.employees[0].paye);
  console.log('period1:', r.period1.employees[0].paye);
  console.log('period2:', r.period2.employees[0].paye);
  console.log('csgLow:', JSON.stringify(r.csgLow.employees[0]));
  console.log('csgHigh:', JSON.stringify(r.csgHigh.employees[0]));
  console.log('prgfStandard:', r.prgfStandard.employees[0].employer_prgf);
  console.log('prgfExempt:', r.prgfExempt.employees[0].employer_prgf);
}
