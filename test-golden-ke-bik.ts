import { payrollEngineSelfTestKE } from './lib/payroll-engine-ke';
const r = payrollEngineSelfTestKE();
console.log('KE self-test ok:', r.ok);
console.log('housingArmsLength', r.housingArmsLength.employees[0].housing_benefit, r.housingArmsLength.employees[0].paye, r.housingArmsLength.controls.journal_balanced);
console.log('housingOwned', r.housingOwned.employees[0].housing_benefit, r.housingOwned.controls.journal_balanced);
console.log('carOwned', r.carOwned.employees[0].car_benefit, r.carOwned.controls.journal_balanced);
console.log('carLeased', r.carLeased.employees[0].car_benefit, r.carLeased.controls.journal_balanced);
