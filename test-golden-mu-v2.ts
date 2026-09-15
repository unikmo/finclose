import { payrollEngineSelfTestMU } from './lib/payroll-engine-mu';
const r = payrollEngineSelfTestMU();
console.log('MU self-test ok:', r.ok);
console.log('director default', r.directorDefault.employees[0].paye);
console.log('director elected', r.directorElected.employees[0].paye);
console.log('lowEmoluments paye', r.lowEmoluments.employees[0].paye, 'ytdAfter', r.lowEmoluments.employees[0].paye_withheld_ytd_after);
