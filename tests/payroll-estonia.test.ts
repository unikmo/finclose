import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEePayroll,
  payrollEngineSelfTestEE,
  PAYROLL_RULE_PACK_EE
} from '../lib/payroll-engine-ee';

test('Estonia 2026 payroll pack reproduces the core statutory arithmetic', () => {
  const result = calculateEePayroll({
    pay_period_start: '2026-06-01',
    pay_period_end: '2026-06-30',
    pay_date: '2026-06-30',
    employees: [{
      employee_id: 'EE-CORE',
      gross_pay: 2100,
      basic_exemption_amount: 700,
      pensionable_age_for_tax_year: false,
      funded_pension_rate: 0.02,
      employee_unemployment_insurance_applicable: true,
      minimum_social_tax_base: 886
    }]
  });

  const employee = result.employees[0];
  assert.equal(result.rule_pack_id, 'EE-2026-EMPLOYMENT-V1-DRAFT');
  assert.equal(PAYROLL_RULE_PACK_EE.status, 'DRAFT_NEEDS_LEGAL_REVIEW');
  // Exact EMTA 2026 TSD worked example for EUR 2,100 salary.
  assert.equal(employee.employee_unemployment_insurance, 33.60);
  assert.equal(employee.employer_unemployment_insurance, 16.80);
  assert.equal(employee.funded_pension, 42);
  assert.equal(employee.basic_exemption_applied, 700);
  assert.equal(employee.income_tax_base, 1324.40);
  assert.equal(employee.income_tax, 291.37);
  assert.equal(employee.social_tax_base, 2100);
  assert.equal(employee.employer_social_tax, 693);
  assert.equal(employee.net_pay, 1733.03);
  assert.equal(employee.employer_funded_total, 2809.80);
  assert.equal(result.controls.journal_balanced, true);
});

test('Estonia pack handles 6% II-pillar and explicit low-wage social-tax minimum', () => {
  const result = calculateEePayroll({
    pay_period_start: '2026-09-01',
    pay_period_end: '2026-09-30',
    pay_date: '2026-09-30',
    employees: [
      {
        employee_id: 'EE-P6',
        gross_pay: 3000,
        basic_exemption_amount: 700,
        pensionable_age_for_tax_year: false,
        funded_pension_rate: 0.06,
        employee_unemployment_insurance_applicable: true,
        minimum_social_tax_base: 886
      },
      {
        employee_id: 'EE-MIN',
        gross_pay: 600,
        basic_exemption_amount: 700,
        pensionable_age_for_tax_year: false,
        funded_pension_rate: 0.02,
        employee_unemployment_insurance_applicable: true,
        minimum_social_tax_base: 886
      }
    ]
  });

  assert.equal(result.employees[0].funded_pension, 180);
  assert.equal(result.employees[0].income_tax, 455.84);
  // Exact EMTA 2026 TSD low-wage worked example: exemption is capped at
  // EUR 578.40 after EUR 12 II-pillar and EUR 9.60 employee UI deductions.
  assert.equal(result.employees[1].social_tax_base, 886);
  assert.equal(result.employees[1].employer_social_tax, 292.38);
  assert.equal(result.employees[1].funded_pension, 12);
  assert.equal(result.employees[1].employee_unemployment_insurance, 9.60);
  assert.equal(result.employees[1].employer_unemployment_insurance, 4.80);
  assert.equal(result.employees[1].basic_exemption_applied, 578.40);
  assert.equal(result.employees[1].income_tax, 0);
  assert.equal(result.employees[1].net_pay, 578.40);
  assert.equal(result.controls.journal_balanced, true);
});

test('Estonia pack supports pensionable-age exemption ceiling and no employee UI withholding', () => {
  const result = calculateEePayroll({
    pay_period_start: '2026-03-01',
    pay_period_end: '2026-03-31',
    pay_date: '2026-03-31',
    employees: [{
      employee_id: 'EE-PENSION',
      gross_pay: 1000,
      basic_exemption_amount: 776,
      pensionable_age_for_tax_year: true,
      funded_pension_rate: 0,
      employee_unemployment_insurance_applicable: false,
      minimum_social_tax_base: 0
    }]
  });

  const employee = result.employees[0];
  assert.equal(employee.basic_exemption_applied, 776);
  assert.equal(employee.employee_unemployment_insurance, 0);
  assert.equal(employee.employer_unemployment_insurance, 8);
  assert.equal(employee.income_tax_base, 224);
  assert.equal(employee.income_tax, 49.28);
  assert.equal(employee.net_pay, 950.72);
  assert.equal(result.controls.journal_balanced, true);
});

test('Estonia pack fails closed on stale year and invalid statutory inputs', () => {
  const baseEmployee = {
    employee_id: 'EE-X',
    gross_pay: 2000,
    basic_exemption_amount: 700,
    pensionable_age_for_tax_year: false,
    funded_pension_rate: 0.02 as const,
    employee_unemployment_insurance_applicable: true,
    minimum_social_tax_base: 886
  };

  assert.throws(() => calculateEePayroll({
    pay_period_start: '2026-12-01',
    pay_period_end: '2026-12-31',
    pay_date: '2027-01-05',
    employees: [baseEmployee]
  }), /only payments made in calendar year 2026/);

  assert.throws(() => calculateEePayroll({
    pay_period_start: '2026-06-01',
    pay_period_end: '2026-06-30',
    pay_date: '2026-06-30',
    employees: [{ ...baseEmployee, basic_exemption_amount: 701 }]
  }), /monthly ceiling of EUR 700/);

  assert.throws(() => calculateEePayroll({
    pay_period_start: '2026-06-01',
    pay_period_end: '2026-06-30',
    pay_date: '2026-06-30',
    employees: [{ ...baseEmployee, minimum_social_tax_base: 887 }]
  }), /cannot exceed the 2026 statutory monthly base/);
});

test('Estonia engine self-test remains green', () => {
  assert.equal(payrollEngineSelfTestEE().ok, true);
});
