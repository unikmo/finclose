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
type CaYtd = { ytd_earnings_before: number };
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

          // NY (like NJ) is a documented exception: the engine explicitly
          // REJECTS a nonzero pretax_401k_deferral/pretax_section125_deduction
          // for NY employees (its NY/NYC/Yonkers wage-base treatment of those
          // deferrals was not independently verified -- see the engine's own
          // limitations). Rather than crash or silently apply an unverified
          // wage-base treatment, this driver omits the 401(k) deferral for NY
          // employees only and records it as a gap.
          const applyable401k = stCode === 'NY' ? 0 : (row.US_401k_Deduction || 0);
          if (stCode === 'NY' && row.US_401k_Deduction > 0) {
            gapsFound.add('US/NY: the engine explicitly rejects a nonzero pretax_401k_deferral for NY employees (unverified NY/NYC/Yonkers wage-base treatment) -- NY employees\' 401(k) deferrals were run WITHOUT the pre-tax deduction applied (full gross taxed) rather than being dropped from the stress test entirely; their gross/net figures therefore do not reflect the 401(k) reduction.');
          }

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
          if (row.US_401k_Deduction > 0) {
            // supported directly by the engine; nothing to flag.
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
          gapsFound.add('Germany: German_BAV has no dedicated engine input; modeled as a pre-tax/pre-SV salary-sacrifice reduction of both taxable_gross_pay and sv_gross_pay (a documented assumption, not a native field).');
          break;
        }
        case 'Canada': {
          if (row.State_Province === 'Quebec') {
            recordSkip('Canada', employeeId, month, 'Quebec has no engine implementation (province_of_employment "QC" is explicitly rejected by payroll-engine-ca.ts) -- known, deliberate gap.');
            skipRows++;
            continue;
          }
          const prev = caYtd.get(employeeId) || { ytd_earnings_before: 0 };
          const input: CaEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            pay_frequency: 'MONTHLY',
            province_of_employment: 'ON',
            ytd_earnings_before: prev.ytd_earnings_before
          };
          const result = calculateCaPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          caYtd.set(employeeId, { ytd_earnings_before: e.ytd_earnings_after });
          const lines: RemittanceLine[] = [
            { agency: 'CRA - Federal Income Tax', amount: e.federal_income_tax },
            { agency: 'Ontario - Provincial Income Tax', amount: e.provincial_income_tax },
            { agency: 'CRA - CPP (Employee + Employer, CPP1 + CPP2)', amount: money(e.employee_cpp1 + e.employer_cpp1 + e.employee_cpp2 + e.employer_cpp2) },
            { agency: 'CRA - EI (Employee + Employer)', amount: money(e.employee_ei + e.employer_ei) }
          ];
          recordSuccess('Canada', 'CAD', employeeId, month, e.gross_pay, e.net_pay, lines);
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
          gapsFound.add('UK: workplace pension (employee 5% + employer 3% of qualifying earnings) is modeled but excluded from the government-remittance total -- it is paid to a private pension provider, not a UK government agency.');
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
          break;
        }
        case 'South Africa': {
          const isExec = row.Is_Executive === 'Yes';
          const input: ZaEmployeeInput = {
            employee_id: employeeId,
            gross_pay: gross,
            employee_age: 35,
            medical_scheme_main_member: false,
            employer_sdl_liable: true
          };
          const result = calculateZaPayroll({ pay_period_start: ps, pay_period_end: pe, pay_date: pd, employees: [input] });
          const e = result.employees[0];
          const lines: RemittanceLine[] = [
            { agency: 'SARS - PAYE (net of ETI)', amount: money(e.paye - e.eti) },
            { agency: 'UIF (Employee + Employer)', amount: money(e.employee_uif + e.employer_uif) },
            { agency: 'SDL (Employer)', amount: e.employer_sdl }
          ];
          recordSuccess('South Africa', 'ZAR', employeeId, month, e.gross_pay, e.net_pay, lines);
          if (isExec && row.Exec_Fringe_Benefits > 0) {
            gapsFound.add('South Africa: this engine does not model taxable fringe benefits at all ("gross_pay is assumed to be cash remuneration only" per its own limitations) -- Exec_Fringe_Benefits could not be applied and is excluded from ZA gross/PAYE.');
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
            rama_member: false
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
          if (isExec && row.Exec_Fringe_Benefits > 0) {
            gapsFound.add('Rwanda: benefit-in-kind is modeled only as vehicle_benefit (10%) / accommodation_benefit (20%) flags, not a caller-supplied cash amount -- Exec_Fringe_Benefits (an arbitrary cash figure) does not map to either flag and was excluded from the PAYE taxable base.');
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
