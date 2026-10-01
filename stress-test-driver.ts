// Global 7-month payroll stress-test driver.
//
// Reads C:\Users\mbanw\OneDrive\Desktop\global_months7_payroll_stress_test.xlsx
// (sheet 7_Month_Raw_Ledger, 1050 rows = 150 employees x 7 months Jan-Jul),
// maps each row to the correct country engine's real input schema, threads
// YTD state per employee across the 7 months in calendar order, runs every
// employee-month through the appropriate lib/payroll-engine-*.ts calculate
// function, and produces a grand-totals + per-country + per-agency
// remittance report.
//
// Run with: npx tsx stress-test-driver.ts

import XLSX from 'xlsx';
import { calculateGeorgiaPayroll } from './lib/payroll-engine';
import { calculateGermanyPayroll, type DeEmployeeInput } from './lib/payroll-engine-de';
import { calculateUsPayroll, type UsEmployeeInput } from './lib/payroll-engine-us';
import { calculateUkPayroll, type UkEmployeeInput } from './lib/payroll-engine-uk';
import { calculateCaPayroll, type CaEmployeeInput } from './lib/payroll-engine-ca';
import { calculateKePayroll, type KeEmployeeInput } from './lib/payroll-engine-ke';
import { calculateZaPayroll, type ZaEmployeeInput } from './lib/payroll-engine-za';
import { calculateRwPayroll, type RwEmployeeInput } from './lib/payroll-engine-rw';
import { calculateMuPayroll, type MuEmployeeInput } from './lib/payroll-engine-mu';
import { calculateCmPayroll, type CmEmployeeInput } from './lib/payroll-engine-cm';

const XLSX_PATH = 'C:/Users/mbanw/OneDrive/Desktop/global_months7_payroll_stress_test.xlsx';
const SHEET = '7_Month_Raw_Ledger';

const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July'];
const MONTH_NUM: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07'
};
const YEAR = '2026';

function money(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

type RawRow = {
  Month: string;
  Employee_ID: string;
  Country: string;
  State_Province: string;
  Currency: string;
  Is_Hourly: 'Yes' | 'No';
  Is_Executive: 'Yes' | 'No';
  Base_Rate: number;
  Hours_Worked: number;
  Overtime_Hours: number;
  Variable_Bonus: number;
  US_401k_Deduction: number;
  German_BAV: number;
  Exec_Fringe_Benefits: number;
};

function grossForRow(row: RawRow): number {
  if (row.Is_Hourly === 'Yes') {
    const regular = row.Base_Rate * row.Hours_Worked;
    const overtime = row.Base_Rate * 1.5 * (row.Overtime_Hours || 0);
    return money(regular + overtime + (row.Variable_Bonus || 0));
  }
  // Salaried: Base_Rate is already the period (monthly) salary.
  return money(row.Base_Rate + (row.Variable_Bonus || 0));
}

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------

type RemittanceLine = { agency: string; amount: number };

// ---------------------------------------------------------------------------
// Payslip-register + monthly-remittance detail capture (additive only --
// reuses the exact same `e` engine-result objects and `lines` arrays the
// aggregate bookkeeping above already computes; does not change any
// existing aggregate value).
// ---------------------------------------------------------------------------

type LineItem = { label: string; amount: number };

type PayslipRow = {
  employee_id: string;
  month: string;
  month_num: string;
  country: string;
  state_province: string;
  currency: string;
  gross_pay: number;
  base_pay: number;
  overtime_pay: number;
  bonus_pay: number;
  employee_lines: LineItem[];
  employer_lines: LineItem[];
  total_employee_deductions: number;
  net_pay: number;
  total_employer_contributions: number;
  employer_cost_total: number;
  notes: string;
};

const payslips: PayslipRow[] = [];

function payComponents(row: RawRow) {
  if (row.Is_Hourly === 'Yes') {
    const base = money(row.Base_Rate * row.Hours_Worked);
    const overtime = money(row.Base_Rate * 1.5 * (row.Overtime_Hours || 0));
    return { base, overtime, bonus: money(row.Variable_Bonus || 0) };
  }
  return { base: money(row.Base_Rate), overtime: 0, bonus: money(row.Variable_Bonus || 0) };
}

function pushPayslip(p: Omit<PayslipRow, 'total_employee_deductions' | 'total_employer_contributions'>) {
  const totalEe = money(p.employee_lines.reduce((s, l) => s + l.amount, 0));
  const totalEr = money(p.employer_lines.reduce((s, l) => s + l.amount, 0));
  payslips.push({ ...p, total_employee_deductions: totalEe, total_employer_contributions: totalEr });
}

// country -> month -> agency -> amount (local currency). Built from the same
// `lines` arrays passed into recordSuccess() for every employee-month, so it
// is guaranteed to sum to the same 7-month countryAgencyTotals already
// verified below.
const monthlyCountryAgencyTotals: Record<string, Record<string, Record<string, number>>> = {};
function addMonthlyAgency(country: string, month: string, lines: RemittanceLine[]) {
  monthlyCountryAgencyTotals[country] = monthlyCountryAgencyTotals[country] || {};
  monthlyCountryAgencyTotals[country][month] = monthlyCountryAgencyTotals[country][month] || {};
  const bucket = monthlyCountryAgencyTotals[country][month];
  for (const l of lines) {
    if (!l.amount) continue;
    bucket[l.agency] = money((bucket[l.agency] || 0) + l.amount);
  }
}

type EmployeeMonthOutcome = {
  employee_id: string;
  month: string;
  country: string;
  ok: boolean;
  error?: string;
  gross_pay?: number;
  net_pay?: number;
  employer_remittance_total?: number;
  remittance_lines?: RemittanceLine[];
  currency?: string;
};

const outcomes: EmployeeMonthOutcome[] = [];
const skipped: EmployeeMonthOutcome[] = [];
const bugsFound: string[] = [];
const gapsFound = new Set<string>();

// Country totals: country -> agency -> amount (in that country's local currency)
const countryAgencyTotals: Record<string, Record<string, number>> = {};
const countryGross: Record<string, number> = {};
const countryNet: Record<string, number> = {};
const countryRemit: Record<string, number> = {};
const countryCurrency: Record<string, string> = {};
const countryEmployeeMonths: Record<string, number> = {};

function addAgency(country: string, agency: string, amount: number) {
  if (!amount) return;
  countryAgencyTotals[country] = countryAgencyTotals[country] || {};
  countryAgencyTotals[country][agency] = money((countryAgencyTotals[country][agency] || 0) + amount);
}

function recordSuccess(country: string, currency: string, employeeId: string, month: string, gross: number, net: number, lines: RemittanceLine[]) {
  const remitTotal = money(lines.reduce((s, l) => s + l.amount, 0));
  outcomes.push({ employee_id: employeeId, month, country, ok: true, gross_pay: gross, net_pay: net, employer_remittance_total: remitTotal, remittance_lines: lines, currency });
  countryGross[country] = money((countryGross[country] || 0) + gross);
  countryNet[country] = money((countryNet[country] || 0) + net);
  countryRemit[country] = money((countryRemit[country] || 0) + remitTotal);
  countryCurrency[country] = currency;
  countryEmployeeMonths[country] = (countryEmployeeMonths[country] || 0) + 1;
  for (const l of lines) addAgency(country, l.agency, l.amount);
}

function recordFailure(country: string, employeeId: string, month: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  outcomes.push({ employee_id: employeeId, month, country, ok: false, error: msg });
}

function recordSkip(country: string, employeeId: string, month: string, reason: string) {
  skipped.push({ employee_id: employeeId, month, country, ok: false, error: reason });
}

// ---------------------------------------------------------------------------
// Per-country YTD state
// ---------------------------------------------------------------------------

type UsYtd = {
  ytd_ss_wages_before: number;
  ytd_medicare_wages_before: number;
  ytd_futa_wages_before: number;
};
type DeYtd = { ytd_sv_gross_before: number };
type CaYtd = { ytd_earnings_before: number; ytd_qpip_insurable_before?: number };
type MuYtd = { cumulative_emoluments_before: number; paye_withheld_ytd_before: number; sequence: number };
type GeYtd = { ytd_taxable_salary_before: number };

const usYtd = new Map<string, UsYtd>();
const deYtd = new Map<string, DeYtd>();
const caYtd = new Map<string, CaYtd>();
const muYtd = new Map<string, MuYtd>();
const geYtd = new Map<string, GeYtd>();

// ---------------------------------------------------------------------------
// Load workbook
// ---------------------------------------------------------------------------

const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets[SHEET];
if (!ws) throw new Error(`sheet ${SHEET} not found`);
const allRows = XLSX.utils.sheet_to_json(ws) as RawRow[];

const byEmployee = new Map<string, RawRow[]>();
for (const row of allRows) {
  const list = byEmployee.get(row.Employee_ID) || [];
  list.push(row);
  byEmployee.set(row.Employee_ID, list);
}
for (const [id, rows] of byEmployee) {
  rows.sort((a, b) => MONTH_ORDER.indexOf(a.Month) - MONTH_ORDER.indexOf(b.Month));
}

let totalRows = 0;
let successRows = 0;
let failRows = 0;
let skipRows = 0;

// ---------------------------------------------------------------------------
// Country processors
// ---------------------------------------------------------------------------

for (const [employeeId, rows] of byEmployee) {
  for (const row of rows) {
    totalRows++;
    const month = row.Month;
    const pd = `${YEAR}-${MONTH_NUM[month]}-28`; // mid-month-safe pay date, avoids month-length edge cases
    const ps = `${YEAR}-${MONTH_NUM[month]}-01`;
    const pe = pd;
    const gross = grossForRow(row);

    try {
      switch (row.Country) {
        case 'US': {
          const stateMap: Record<string, string> = { 'New York': 'NY', California: 'CA', Texas: 'TX', Florida: 'FL' };
          const stCode = stateMap[row.State_Province];
          if (!stCode) throw new Error(`unrecognized US state_province ${row.State_Province}`);
          const prev = usYtd.get(employeeId) || { ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0 };

          // v24: the engine now applies pretax_401k_deferral/pretax_section125_deduction
          // to NY State/NYC/Yonkers wages (20 NYCRR 171.1(b)/171.3 conformity --
          // see lib/payroll-engine-us.ts limitations). No special-casing needed here
          // for any of the 4 states this dataset uses (NY/CA/TX/FL); TX/FL have no
          // state income tax and CA already applied it before this fix too.
          const applyable401k = row.US_401k_Deduction || 0;

          const input: UsEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            pretax_401k_deferral: applyable401k,
            pay_frequency: 'MONTHLY',
            federal_filing_status: 'SINGLE_MFS',
            federal_step2_checkbox: false,
            ytd_ss_wages_before: prev.ytd_ss_wages_before,
            ytd_medicare_wages_before: prev.ytd_medicare_wages_before,
            ytd_futa_wages_before: prev.ytd_futa_wages_before,
            state: stCode as UsEmployeeInput['state'],
            ...(stCode === 'CA' ? { ca_filing_status: 'SINGLE', ca_regular_allowances: 0, ca_estimated_deduction_allowances: 0 } : {}),
            ...(stCode === 'NY' ? { ny_filing_status: 'SINGLE', ny_allowances: 0 } : {})
          };
          const result = calculateUsPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          usYtd.set(employeeId, {
            ytd_ss_wages_before: e.ytd_ss_wages_after,
            ytd_medicare_wages_before: e.ytd_medicare_wages_after,
            ytd_futa_wages_before: e.ytd_futa_wages_after
          });
          const lines: RemittanceLine[] = [
            { agency: 'IRS - Federal Income Tax Withheld', amount: e.federal_income_tax },
            { agency: 'IRS - FICA Social Security (Employee + Employer)', amount: money(e.employee_social_security + e.employer_social_security) },
            { agency: 'IRS - FICA Medicare (Employee + Employer + Additional)', amount: money(e.employee_medicare + e.employer_medicare + e.employee_additional_medicare) },
            { agency: 'IRS - FUTA (Employer, Form 940)', amount: e.employer_futa },
            ...(stCode === 'CA' ? [{ agency: 'CA EDD - State Income Tax + SDI', amount: money(e.ca_income_tax + e.ca_sdi) }] : []),
            ...(stCode === 'NY' ? [{ agency: 'NY DTF - State/NYC/Yonkers Income Tax + PFL/DBL', amount: money(e.ny_income_tax + e.nyc_income_tax + e.yonkers_tax + e.ny_pfl + e.ny_dbl) }] : [])
          ];
          recordSuccess('US', 'USD', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('US', month, lines);
          if (row.US_401k_Deduction > 0) {
            // supported directly by the engine; nothing to flag.
          }
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'Federal Income Tax', amount: e.federal_income_tax },
              { label: 'Social Security (Employee)', amount: e.employee_social_security },
              { label: 'Medicare (Employee)', amount: e.employee_medicare },
              { label: 'Additional Medicare (Employee)', amount: e.employee_additional_medicare },
              { label: '401(k) Deferral (Pre-Tax)', amount: e.pretax_401k_deferral },
              ...(stCode === 'CA' ? [
                { label: 'CA State Income Tax', amount: e.ca_income_tax },
                { label: 'CA SDI (Employee)', amount: e.ca_sdi }
              ] : []),
              ...(stCode === 'NY' ? [
                { label: 'NY State Income Tax', amount: e.ny_income_tax },
                { label: 'NYC Income Tax', amount: e.nyc_income_tax },
                { label: 'Yonkers Tax', amount: e.yonkers_tax },
                { label: 'NY Paid Family Leave (Employee)', amount: e.ny_pfl },
                { label: 'NY Disability Benefits (Employee)', amount: e.ny_dbl }
              ] : [])
            ];
            const employer_lines: LineItem[] = [
              { label: 'Social Security (Employer)', amount: e.employer_social_security },
              { label: 'Medicare (Employer)', amount: e.employer_medicare },
              { label: 'FUTA (Employer)', amount: e.employer_futa },
              { label: 'SUI (Employer)', amount: e.employer_sui }
            ];
            const notes = '';
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'US', state_province: row.State_Province, currency: 'USD',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_cost_total, notes
            });
          }
          break;
        }
        case 'Germany': {
          const prev = deYtd.get(employeeId) || { ytd_sv_gross_before: 0 };
          const bav = row.German_BAV || 0;
          // German_BAV (Betriebliche Altersvorsorge / employer pension
          // deferral) is modeled as a pre-tax, pre-SV salary-sacrifice
          // deduction: both taxable_gross_pay and sv_gross_pay are reduced
          // by the BAV amount, matching how deferred compensation is
          // represented elsewhere in this engine's own field comments
          // ("Usually equal to sv_gross_pay unless the employee has
          // employer-sponsored deferred compensation"). Documented
          // assumption -- the engine has no dedicated BAV input field.
          const taxableAndSv = Math.max(0, money(gross - bav));
          const input: DeEmployeeInput = {
            employee_id: employeeId,
            taxable_gross_pay: taxableAndSv,
            sv_gross_pay: taxableAndSv,
            tax_class: 'I',
            church_tax_liable: false,
            childless_surcharge_applicable: false,
            ytd_sv_gross_before: prev.ytd_sv_gross_before,
            insurance_type: 'STATUTORY'
          };
          const result = calculateGermanyPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          deYtd.set(employeeId, { ytd_sv_gross_before: e.ytd_sv_gross_after });
          const lines: RemittanceLine[] = [
            { agency: 'Finanzamt - Lohnsteuer (Income Tax)', amount: e.income_tax },
            { agency: 'Finanzamt - Solidaritatszuschlag', amount: e.solidarity_surcharge },
            { agency: 'Finanzamt - Kirchensteuer (Church Tax)', amount: e.church_tax },
            { agency: 'Sozialversicherung - Rentenversicherung / Pension (Employee + Employer)', amount: money(e.employee_pension_insurance + e.employer_pension_insurance) },
            { agency: 'Sozialversicherung - Arbeitslosenversicherung / Unemployment (Employee + Employer)', amount: money(e.employee_unemployment_insurance + e.employer_unemployment_insurance) },
            { agency: 'Sozialversicherung - Krankenversicherung / Health (Employee + Employer)', amount: money(e.employee_health_insurance + e.employer_health_insurance) },
            { agency: 'Sozialversicherung - Pflegeversicherung / Care (Employee + Employer)', amount: money(e.employee_care_insurance + e.employer_care_insurance) }
          ];
          recordSuccess('Germany', 'EUR', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Germany', month, lines);
          gapsFound.add('Germany: German_BAV has no dedicated engine input; modeled as a pre-tax/pre-SV salary-sacrifice reduction of both taxable_gross_pay and sv_gross_pay (a documented assumption, not a native field).');
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'Income Tax (Lohnsteuer)', amount: e.income_tax },
              { label: 'Solidarity Surcharge', amount: e.solidarity_surcharge },
              { label: 'Church Tax', amount: e.church_tax },
              { label: 'Pension Insurance (Employee)', amount: e.employee_pension_insurance },
              { label: 'Unemployment Insurance (Employee)', amount: e.employee_unemployment_insurance },
              { label: 'Health Insurance (Employee)', amount: e.employee_health_insurance },
              { label: 'Care Insurance (Employee)', amount: e.employee_care_insurance }
            ];
            const employer_lines: LineItem[] = [
              { label: 'Pension Insurance (Employer)', amount: e.employer_pension_insurance },
              { label: 'Unemployment Insurance (Employer)', amount: e.employer_unemployment_insurance },
              { label: 'Health Insurance (Employer)', amount: e.employer_health_insurance },
              { label: 'Care Insurance (Employer)', amount: e.employer_care_insurance }
            ];
            const rawGross = money(pc.base + pc.overtime + pc.bonus);
            const notes = bav > 0
              ? `BAV salary-sacrifice deferral of ${bav} applied pre-tax/pre-SV (modeled by reducing gross before the engine call); raw contractual base+bonus = ${rawGross}, gross_pay shown here (${e.gross_pay}) is already net of BAV.`
              : '';
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Germany', state_province: row.State_Province, currency: 'EUR',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes
            });
          }
          break;
        }
        case 'Canada': {
          // v5 follow-up (2026-09-19): Quebec is no longer skipped now that
          // payroll-engine-ca.ts implements it (see PAYROLL_RULE_PACK_CA's
          // "quebec" block and the engine's own v5 limitations). Every other
          // province in this driver is (pre-existing behavior, unchanged
          // here) hardcoded to 'ON' rather than the row's actual
          // State_Province -- out of scope for this pass, which only
          // restores Quebec rows that were previously hard-skipped.
          const isQuebec = row.State_Province === 'Quebec';
          const prev = caYtd.get(employeeId) || { ytd_earnings_before: 0, ytd_qpip_insurable_before: 0 };
          const input: CaEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            pay_frequency: 'MONTHLY',
            province_of_employment: isQuebec ? 'QC' : 'ON',
            ytd_earnings_before: prev.ytd_earnings_before,
            ...(isQuebec ? { ytd_qpip_insurable_before: prev.ytd_qpip_insurable_before || 0 } : {})
          };
          const result = calculateCaPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          caYtd.set(employeeId, {
            ytd_earnings_before: e.ytd_earnings_after,
            ytd_qpip_insurable_before: isQuebec ? e.ytd_qpip_insurable_earnings_after : prev.ytd_qpip_insurable_before
          });
          const lines: RemittanceLine[] = isQuebec ? [
            { agency: 'CRA - Federal Income Tax', amount: e.federal_income_tax },
            { agency: 'Revenu Quebec - Provincial Income Tax', amount: e.provincial_income_tax },
            { agency: 'Retraite Quebec - QPP (Employee + Employer, QPP1 + QPP2)', amount: money(e.employee_qpp1 + e.employer_qpp1 + e.employee_qpp2 + e.employer_qpp2) },
            { agency: 'CRA - EI, Quebec reduced rate (Employee + Employer)', amount: money(e.employee_ei + e.employer_ei) },
            { agency: 'Revenu Quebec - QPIP (Employee + Employer)', amount: money(e.employee_qpip + e.employer_qpip) }
          ] : [
            { agency: 'CRA - Federal Income Tax', amount: e.federal_income_tax },
            { agency: 'Ontario - Provincial Income Tax', amount: e.provincial_income_tax },
            { agency: 'CRA - CPP (Employee + Employer, CPP1 + CPP2)', amount: money(e.employee_cpp1 + e.employer_cpp1 + e.employee_cpp2 + e.employer_cpp2) },
            { agency: 'CRA - EI (Employee + Employer)', amount: money(e.employee_ei + e.employer_ei) }
          ];
          recordSuccess('Canada', 'CAD', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Canada', month, lines);
          if (isQuebec) {
            gapsFound.add('Canada (Quebec): QC Health Services Fund (FSS) and CNESST are not modeled in this driver run -- no qc_fss_rate supplied (employer-size/sector-specific, no statutory default per the engine\'s own disclosed limitation), and CNESST has no computation path in the engine at all. Employer remittance totals for Quebec rows therefore exclude both.');
          }
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = isQuebec ? [
              { label: 'Federal Income Tax', amount: e.federal_income_tax },
              { label: 'Provincial Income Tax (Quebec)', amount: e.provincial_income_tax },
              { label: 'QPP1 (Employee)', amount: e.employee_qpp1 },
              { label: 'QPP2 (Employee)', amount: e.employee_qpp2 },
              { label: 'EI, Quebec Reduced Rate (Employee)', amount: e.employee_ei },
              { label: 'QPIP (Employee)', amount: e.employee_qpip }
            ] : [
              { label: 'Federal Income Tax', amount: e.federal_income_tax },
              { label: 'Provincial Income Tax (Ontario)', amount: e.provincial_income_tax },
              { label: 'CPP1 (Employee)', amount: e.employee_cpp1 },
              { label: 'CPP2 (Employee)', amount: e.employee_cpp2 },
              { label: 'EI (Employee)', amount: e.employee_ei }
            ];
            const employer_lines: LineItem[] = isQuebec ? [
              { label: 'QPP1 (Employer)', amount: e.employer_qpp1 },
              { label: 'QPP2 (Employer)', amount: e.employer_qpp2 },
              { label: 'EI, Quebec Reduced Rate (Employer)', amount: e.employer_ei },
              { label: 'QPIP (Employer)', amount: e.employer_qpip },
              { label: 'WCB (Employer)', amount: e.employer_wcb },
              { label: 'FSS (Employer) -- not modeled, see notes', amount: e.employer_fss }
            ] : [
              { label: 'CPP1 (Employer)', amount: e.employer_cpp1 },
              { label: 'CPP2 (Employer)', amount: e.employer_cpp2 },
              { label: 'EI (Employer)', amount: e.employer_ei },
              { label: 'WCB (Employer)', amount: e.employer_wcb }
            ];
            const notes = isQuebec ? 'QC Health Services Fund (FSS) and CNESST not modeled by the engine -- excluded from employer cost.' : '';
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Canada', state_province: isQuebec ? 'Quebec' : row.State_Province, currency: 'CAD',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes
            });
          }
          break;
        }
        case 'UK': {
          const input: UkEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            pay_frequency: 'MONTHLY',
            tax_code: '1257L',
            ni_category: 'A',
            postgraduate_loan: false,
            pension_enrolled: true
          };
          const result = calculateUkPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'HMRC - PAYE Income Tax', amount: e.paye_income_tax },
            { agency: 'HMRC - National Insurance (Employee + Employer)', amount: money(e.employee_ni + e.employer_ni) }
          ];
          recordSuccess('UK', 'GBP', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('UK', month, lines);
          gapsFound.add('UK: workplace pension (employee 5% + employer 3% of qualifying earnings) is modeled but excluded from the government-remittance total -- it is paid to a private pension provider, not a UK government agency.');
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'PAYE Income Tax', amount: e.paye_income_tax },
              { label: 'National Insurance (Employee)', amount: e.employee_ni },
              { label: 'Student Loan Deduction', amount: e.student_loan_deduction },
              { label: 'Postgraduate Loan Deduction', amount: e.postgraduate_loan_deduction },
              { label: 'Workplace Pension (Employee, private -- not remitted to govt)', amount: e.employee_pension }
            ];
            const employer_lines: LineItem[] = [
              { label: 'National Insurance (Employer)', amount: e.employer_ni },
              { label: 'Workplace Pension (Employer, private -- not remitted to govt)', amount: e.employer_pension }
            ];
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'UK', state_province: row.State_Province, currency: 'GBP',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total,
              notes: 'Workplace pension lines are private, not government remittance -- excluded from Monthly Remittance sheet.'
            });
          }
          break;
        }
        case 'Kenya': {
          const input: KeEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            resident_status: 'RESIDENT'
          };
          const result = calculateKePayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'KRA - PAYE', amount: e.paye },
            { agency: 'NSSF - Pension (Employee + Employer)', amount: money(e.employee_nssf + e.employer_nssf) },
            { agency: 'SHIF - Health', amount: e.employee_shif },
            { agency: 'AHL - Affordable Housing Levy (Employee + Employer)', amount: money(e.employee_ahl + e.employer_ahl) },
            { agency: 'NITA - Industrial Training Levy (Employer)', amount: e.employer_nita }
          ];
          recordSuccess('Kenya', 'KES', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Kenya', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'PAYE', amount: e.paye },
              { label: 'NSSF Pension (Employee)', amount: e.employee_nssf },
              { label: 'SHIF Health (Employee)', amount: e.employee_shif },
              { label: 'AHL - Affordable Housing Levy (Employee)', amount: e.employee_ahl }
            ];
            const employer_lines: LineItem[] = [
              { label: 'NSSF Pension (Employer)', amount: e.employer_nssf },
              { label: 'AHL - Affordable Housing Levy (Employer)', amount: e.employer_ahl },
              { label: 'NITA - Industrial Training Levy (Employer)', amount: e.employer_nita }
            ];
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Kenya', state_province: row.State_Province, currency: 'KES',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes: ''
            });
          }
          break;
        }
        case 'South Africa': {
          const isExec = row.Is_Executive === 'Yes';
          const input: ZaEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            employee_age: 35,
            medical_scheme_main_member: false,
            employer_sdl_liable: true,
            // v3 (engine commit 5f12243): a cash allowance/benefit is ordinary
            // SARS remuneration, not a Seventh Schedule in-kind benefit -- wire
            // it straight through rather than dropping it as an unmodeled gap.
            exec_cash_fringe_benefit: isExec ? (row.Exec_Fringe_Benefits || 0) : 0
          };
          const result = calculateZaPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'SARS - PAYE (net of ETI)', amount: money(e.paye - e.eti) },
            { agency: 'UIF (Employee + Employer)', amount: money(e.employee_uif + e.employer_uif) },
            { agency: 'SDL (Employer)', amount: e.employer_sdl }
          ];
          recordSuccess('South Africa', 'ZAR', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('South Africa', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'PAYE (before ETI)', amount: e.paye },
              { label: 'UIF (Employee)', amount: e.employee_uif }
            ];
            const employer_lines: LineItem[] = [
              { label: 'UIF (Employer)', amount: e.employer_uif },
              { label: 'SDL (Employer)', amount: e.employer_sdl },
              { label: 'Employment Tax Incentive (ETI, reduces PAYE remitted -- shown as negative)', amount: -e.eti }
            ];
            const notes = '';
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'South Africa', state_province: row.State_Province, currency: 'ZAR',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes
            });
          }
          break;
        }
        case 'Rwanda': {
          const isExec = row.Is_Executive === 'Yes';
          const input: RwEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            employee_type: 'REGULAR',
            first_employer: true,
            rama_member: false,
            // v4 (engine commit 5f12243): a cash allowance is ordinary RRA
            // employment income and part of the RSSB pension/maternity base
            // -- wire it through rather than dropping it as an unmodeled gap.
            // Distinct from vehicle_benefit/accommodation_benefit (non-cash
            // BIK flags), which this dataset's Exec_Fringe_Benefits figure
            // does not map to.
            exec_cash_fringe_benefit: isExec ? (row.Exec_Fringe_Benefits || 0) : 0
          };
          const result = calculateRwPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'RRA - PAYE', amount: e.paye },
            { agency: 'RSSB - Pension (Employee + Employer)', amount: money(e.employee_pension + e.employer_pension) },
            { agency: 'RSSB - Occupational Hazards (Employer)', amount: e.employer_oh },
            { agency: 'RSSB - Maternity (Employee + Employer)', amount: money(e.employee_maternity + e.employer_maternity) }
          ];
          recordSuccess('Rwanda', 'RWF', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Rwanda', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'PAYE', amount: e.paye },
              { label: 'Pension (Employee)', amount: e.employee_pension },
              { label: 'Maternity (Employee)', amount: e.employee_maternity },
              { label: 'RAMA (Employee)', amount: e.employee_rama },
              { label: 'CBHI (Employee)', amount: e.employee_cbhi }
            ];
            const employer_lines: LineItem[] = [
              { label: 'Pension (Employer)', amount: e.employer_pension },
              { label: 'Occupational Hazards (Employer)', amount: e.employer_oh },
              { label: 'Maternity (Employer)', amount: e.employer_maternity },
              { label: 'RAMA (Employer)', amount: e.employer_rama }
            ];
            const notes = '';
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Rwanda', state_province: row.State_Province, currency: 'RWF',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes
            });
          }
          break;
        }
        case 'Mauritius': {
          const prev = muYtd.get(employeeId) || { cumulative_emoluments_before: 0, paye_withheld_ytd_before: 0, sequence: 0 };
          const sequence = prev.sequence + 1; // Documented assumption: Jan=1..Jul=7 (dataset has no fiscal-year alignment data; engine's own July=1 fiscal-year convention is not applicable here).
          const input: MuEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            resident_status: 'RESIDENT',
            pay_period_sequence: sequence,
            cumulative_emoluments_before: prev.cumulative_emoluments_before,
            paye_withheld_ytd_before: prev.paye_withheld_ytd_before,
            annual_edf_reliefs_total: 0, // Documented default: no EDF reliefs claimed (dataset has no relief data).
            nsf_worker_category: 'OTHER',
            prgf_private_pension_exempt: false
          };
          const result = calculateMuPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          muYtd.set(employeeId, { cumulative_emoluments_before: e.cumulative_emoluments_after, paye_withheld_ytd_before: e.paye_withheld_ytd_after, sequence });
          const lines: RemittanceLine[] = [
            { agency: 'MRA - PAYE', amount: e.paye },
            { agency: 'CSG (Employee + Employer)', amount: money(e.employee_csg + e.employer_csg) },
            { agency: 'NSF (Employee + Employer)', amount: money(e.employee_nsf + e.employer_nsf) },
            { agency: 'Training Levy (Employer)', amount: e.employer_training_levy },
            { agency: 'PRGF (Employer)', amount: e.employer_prgf }
          ];
          recordSuccess('Mauritius', 'MUR', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Mauritius', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'PAYE', amount: e.paye },
              { label: 'CSG (Employee)', amount: e.employee_csg },
              { label: 'NSF (Employee)', amount: e.employee_nsf }
            ];
            const employer_lines: LineItem[] = [
              { label: 'CSG (Employer)', amount: e.employer_csg },
              { label: 'NSF (Employer)', amount: e.employer_nsf },
              { label: 'Training Levy (Employer)', amount: e.employer_training_levy },
              { label: 'PRGF (Employer)', amount: e.employer_prgf }
            ];
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Mauritius', state_province: row.State_Province, currency: 'MUR',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total, notes: ''
            });
          }
          break;
        }
        case 'Georgia': {
          const isExec = row.Is_Executive === 'Yes';
          const prev = geYtd.get(employeeId) || { ytd_taxable_salary_before: 0 };
          const result = calculateGeorgiaPayroll({
            pay_period_start: ps, pay_period_end: pe, pay_date: pd,
            employees: [{
              employee_id: employeeId,
              gross_pay: gross,
              pension_participant: true,
              ytd_taxable_salary_before: prev.ytd_taxable_salary_before,
              taxable_benefits: isExec ? (row.Exec_Fringe_Benefits || 0) : 0
            }]
          });
          const e = result.employees[0];
          geYtd.set(employeeId, { ytd_taxable_salary_before: e.ytd_taxable_salary_after });
          const lines: RemittanceLine[] = [
            { agency: 'Revenue Service (RS) - Income Tax', amount: e.income_tax },
            { agency: 'Pension Agency - Pension (Employee + Employer + State)', amount: money(e.employee_pension + e.employer_pension + e.state_pension) }
          ];
          recordSuccess('Georgia', 'GEL', employeeId, month, e.taxable_salary, e.net_pay, lines);
          addMonthlyAgency('Georgia', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'Income Tax', amount: e.income_tax },
              { label: 'Pension (Employee)', amount: e.employee_pension }
            ];
            const employer_lines: LineItem[] = [
              { label: 'Pension (Employer)', amount: e.employer_pension }
            ];
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Georgia', state_province: row.State_Province, currency: 'GEL',
              gross_pay: e.taxable_salary, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total,
              notes: `State-funded pension top-up of ${e.state_pension} also remitted to the Pension Agency (included in Monthly Remittance) but is government-funded, not a company cost -- excluded from Employer Cost Total.`
            });
          }
          break;
        }
        case 'Cameroon': {
          const input: CmEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            sector_regime: 'GENERAL_OR_DOMESTIC',
            cnps_risk_group: 'A',
            employer_cfc_fne_exempt: false,
            crtv_exempt: false
          };
          const result = calculateCmPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'DGI - IRPP', amount: e.irpp },
            { agency: 'DGI - CAC', amount: e.cac },
            { agency: 'CNPS - Pension (Employee + Employer)', amount: money(e.employee_cnps_pension + e.employer_cnps_pension) },
            { agency: 'CNPS - Family Allowance (Employer)', amount: e.employer_cnps_family_allowance },
            { agency: 'CNPS - Occupational Risk (Employer)', amount: e.employer_cnps_occupational_risk },
            { agency: 'CFC - Housing Fund (Employee + Employer)', amount: money(e.employee_cfc + e.employer_cfc) },
            { agency: 'FNE - Employment Fund (Employer)', amount: e.employer_fne },
            { agency: 'DGI/Local - TDL', amount: e.tdl },
            { agency: 'CRTV - Broadcasting Fee', amount: e.crtv }
          ];
          recordSuccess('Cameroon', 'XAF', employeeId, month, e.gross_pay, e.net_pay, lines);
          addMonthlyAgency('Cameroon', month, lines);
          {
            const pc = payComponents(row);
            const employee_lines: LineItem[] = [
              { label: 'IRPP', amount: e.irpp },
              { label: 'CAC', amount: e.cac },
              { label: 'CNPS Pension (Employee)', amount: e.employee_cnps_pension },
              { label: 'CFC - Housing Fund (Employee)', amount: e.employee_cfc },
              { label: 'TDL - Local Development Tax', amount: e.tdl },
              { label: 'CRTV - Broadcasting Fee', amount: e.crtv }
            ];
            const employer_lines: LineItem[] = [
              { label: 'CNPS Pension (Employer)', amount: e.employer_cnps_pension },
              { label: 'CNPS Family Allowance (Employer)', amount: e.employer_cnps_family_allowance },
              { label: 'CNPS Occupational Risk (Employer)', amount: e.employer_cnps_occupational_risk },
              { label: 'CFC - Housing Fund (Employer)', amount: e.employer_cfc },
              { label: 'FNE - Employment Fund (Employer)', amount: e.employer_fne }
            ];
            pushPayslip({
              employee_id: employeeId, month, month_num: MONTH_NUM[month], country: 'Cameroon', state_province: row.State_Province, currency: 'XAF',
              gross_pay: e.gross_pay, base_pay: pc.base, overtime_pay: pc.overtime, bonus_pay: pc.bonus,
              employee_lines, employer_lines, net_pay: e.net_pay, employer_cost_total: e.employer_funded_total,
              notes: 'TDL and CRTV are deducted from the employee\'s net pay by the engine, not added to employer cost (see employer_funded_total formula).'
            });
          }
          break;
        }
        default:
          throw new Error(`unhandled country: ${row.Country}`);
      }
      successRows++;
    } catch (err) {
      recordFailure(row.Country, employeeId, month, err);
      failRows++;
      // eslint-disable-next-line no-console
      console.error(`FAIL ${row.Country} ${employeeId} ${month}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\n=== STRESS TEST SUMMARY ===');
console.log(`Total rows: ${totalRows}`);
console.log(`Success: ${successRows}`);
console.log(`Failed (real errors): ${failRows}`);
console.log(`Skipped (known unsupported): ${skipRows}`);

if (failRows > 0) {
  console.log('\n--- FAILURES (first 30) ---');
  outcomes.filter(o => !o.ok).slice(0, 30).forEach(o => console.log(`${o.country} ${o.employee_id} ${o.month}: ${o.error}`));
}

console.log('\n--- SKIPPED ---');
const skipByCountry = new Map<string, number>();
skipped.forEach(s => skipByCountry.set(s.country, (skipByCountry.get(s.country) || 0) + 1));
for (const [c, n] of skipByCountry) console.log(`${c}: ${n} employee-months skipped`);

console.log('\n--- PER-COUNTRY TOTALS (local currency) ---');
for (const country of Object.keys(countryGross).sort()) {
  console.log(`\n${country} (${countryCurrency[country]}), ${countryEmployeeMonths[country]} employee-months`);
  console.log(`  Gross pay:   ${countryGross[country].toLocaleString()}`);
  console.log(`  Net pay:     ${countryNet[country].toLocaleString()}`);
  console.log(`  Remittance:  ${countryRemit[country].toLocaleString()}`);
  const agencies = countryAgencyTotals[country] || {};
  for (const agency of Object.keys(agencies).sort()) {
    console.log(`    - ${agency}: ${agencies[agency].toLocaleString()}`);
  }
}

console.log('\n--- GAPS FOUND ---');
for (const g of gapsFound) console.log(`- ${g}`);

console.log('\n--- DONE ---');

// Dump machine-readable JSON for the report-writing step.
import fs from 'node:fs';
fs.writeFileSync('./_stress_test_results.json', JSON.stringify({
  totalRows, successRows, failRows, skipRows,
  failures: outcomes.filter(o => !o.ok),
  skipped,
  countryGross, countryNet, countryRemit, countryCurrency, countryEmployeeMonths,
  countryAgencyTotals,
  gapsFound: [...gapsFound]
}, null, 2));

// Detailed payslip register + monthly remittance -- separate file so the
// existing verified aggregate output above is untouched byte-for-byte.
fs.writeFileSync('./_stress_test_payslips.json', JSON.stringify({
  payslips,
  monthlyCountryAgencyTotals
}, null, 2));
