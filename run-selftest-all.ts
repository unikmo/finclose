import { payrollEngineSelfTestAll } from './lib/payroll-engine';
const r = payrollEngineSelfTestAll();
console.log('OK:', r.ok, '| georgia:', r.georgia.ok, '| germany:', r.germany.ok, '| us:', r.unitedStates.ok, '| uk:', r.unitedKingdom.ok, '| canada:', r.canada.ok, '| kenya:', r.kenya.ok, '| southAfrica:', r.southAfrica.ok);
