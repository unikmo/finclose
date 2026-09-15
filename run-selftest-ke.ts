import { payrollEngineSelfTestKE } from './lib/payroll-engine-ke';
const r = payrollEngineSelfTestKE();
console.log('OK:', r.ok);
if (!r.ok) {
  console.log('jan:', JSON.stringify(r.jan.employees[0], null, 2));
  console.log('feb:', JSON.stringify(r.feb.employees[0], null, 2));
  console.log('midBand:', JSON.stringify(r.midBand.employees[0], null, 2));
  console.log('shifMin:', JSON.stringify(r.shifMin.employees[0], null, 2));
  console.log('ahl:', JSON.stringify(r.ahl.employees[0], null, 2));
  console.log('nita total:', r.nitaRun.totals.employer_nita);
}
