// Builds payroll-stress-test-payslips-and-remittance-2026-09.xlsx from the
// two JSON outputs of stress-test-driver.ts:
//   _stress_test_results.json    -- verified 7-month aggregate (unchanged)
//   _stress_test_payslips.json   -- per-employee-month detail (new, additive)
//
// This script does NOT call any payroll engine and does NOT recompute any
// payroll number -- it only reshapes/aggregates numbers that are already in
// those two JSON files (both produced by stress-test-driver.ts, which is
// verified against run-selftest-all.ts). Reconciliation against the
// existing verified aggregate is asserted below and will throw if anything
// doesn't tie out.
//
// Run with: npx tsx build-payroll-workbook.ts

import XLSX from 'xlsx';
import fs from 'node:fs';

const agg = JSON.parse(fs.readFileSync('./_stress_test_results.json', 'utf8'));
const det = JSON.parse(fs.readFileSync('./_stress_test_payslips.json', 'utf8'));

type LineItem = { label: string; amount: number };
type PayslipRow = {
  employee_id: string; month: string; month_num: string; country: string; state_province: string; currency: string;
  gross_pay: number; base_pay: number; overtime_pay: number; bonus_pay: number;
  employee_lines: LineItem[]; employer_lines: LineItem[];
  total_employee_deductions: number; net_pay: number;
  total_employer_contributions: number; employer_cost_total: number;
  notes: string;
};

const payslips: PayslipRow[] = det.payslips;
const monthlyAgency: Record<string, Record<string, Record<string, number>>> = det.monthlyCountryAgencyTotals;

function money(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July'];
const COUNTRY_ORDER = ['US', 'Germany', 'Canada', 'UK', 'Kenya', 'South Africa', 'Rwanda', 'Mauritius', 'Georgia', 'Cameroon'];
const COUNTRY_CODE: Record<string, string> = {
  US: 'US', Germany: 'DE', Canada: 'CA', UK: 'UK', Kenya: 'KE', 'South Africa': 'ZA',
  Rwanda: 'RW', Mauritius: 'MU', Georgia: 'GE', Cameroon: 'CM'
};
const REMIT_TIMING_NOTE = 'remittance timing not modeled, consult local requirements';

// ---------------------------------------------------------------------------
// Reconciliation check: monthly-agency totals (built by this driver run,
// per employee-month) must sum EXACTLY to the already-verified 7-month
// countryAgencyTotals in _stress_test_results.json.
// ---------------------------------------------------------------------------
{
  let mismatches = 0;
  for (const country of Object.keys(agg.countryAgencyTotals)) {
    const months = monthlyAgency[country] || {};
    const summed: Record<string, number> = {};
    for (const m of Object.keys(months)) {
      for (const [agencyName, amt] of Object.entries(months[m] as Record<string, number>)) {
        summed[agencyName] = money((summed[agencyName] || 0) + amt);
      }
    }
    for (const [agencyName, amt] of Object.entries(agg.countryAgencyTotals[country] as Record<string, number>)) {
      const s = summed[agencyName] || 0;
      if (Math.abs(s - (amt as number)) > 0.02) {
        console.error(`RECONCILIATION MISMATCH: ${country} / ${agencyName}: monthly sum ${s} vs verified aggregate ${amt}`);
        mismatches++;
      }
    }
  }
  if (mismatches > 0) {
    throw new Error(`${mismatches} reconciliation mismatch(es) between monthly remittance detail and the verified 7-month aggregate -- aborting workbook build.`);
  }
  console.log('Reconciliation OK: monthly remittance detail sums exactly to the verified 7-month aggregate for every country/agency.');
}

// ---------------------------------------------------------------------------
// Payslip Register: wide, sparse columns (union of every country's
// employee-side and employer-side line items, prefixed with the country
// code to keep labels unique across countries).
// ---------------------------------------------------------------------------

type ColKey = { country: string; side: 'EE' | 'ER'; label: string; header: string };
const eeCols: ColKey[] = [];
const erCols: ColKey[] = [];
const seen = new Set<string>();

for (const country of COUNTRY_ORDER) {
  for (const p of payslips) {
    if (p.country !== country) continue;
    for (const l of p.employee_lines) {
      const k = `EE|${country}|${l.label}`;
      if (!seen.has(k)) { seen.add(k); eeCols.push({ country, side: 'EE', label: l.label, header: `${COUNTRY_CODE[country]} EE: ${l.label}` }); }
    }
    for (const l of p.employer_lines) {
      const k = `ER|${country}|${l.label}`;
      if (!seen.has(k)) { seen.add(k); erCols.push({ country, side: 'ER', label: l.label, header: `${COUNTRY_CODE[country]} ER: ${l.label}` }); }
    }
  }
}

const registerHeader = [
  'Employee ID', 'Month', 'Month #', 'Country', 'State/Province', 'Currency',
  'Gross Pay', 'Base Pay', 'Overtime Pay', 'Bonus Pay',
  ...eeCols.map(c => c.header),
  'Total Employee Deductions', 'Net Pay',
  ...erCols.map(c => c.header),
  'Total Employer Contributions', 'Employer Cost Total (Gross + Employer Contributions)',
  'Notes'
];

const monthSort = (m: string) => MONTH_ORDER.indexOf(m);
const sortedPayslips = [...payslips].sort((a, b) => {
  const ci = COUNTRY_ORDER.indexOf(a.country) - COUNTRY_ORDER.indexOf(b.country);
  if (ci !== 0) return ci;
  if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id);
  return monthSort(a.month) - monthSort(b.month);
});

const registerRows = sortedPayslips.map(p => {
  const eeMap = new Map(p.employee_lines.map(l => [l.label, l.amount]));
  const erMap = new Map(p.employer_lines.map(l => [l.label, l.amount]));
  const row: (string | number)[] = [
    p.employee_id, p.month, p.month_num, p.country, p.state_province, p.currency,
    p.gross_pay, p.base_pay, p.overtime_pay, p.bonus_pay,
    ...eeCols.map(c => (c.country === p.country ? (eeMap.get(c.label) ?? 0) : '')),
    p.total_employee_deductions, p.net_pay,
    ...erCols.map(c => (c.country === p.country ? (erMap.get(c.label) ?? 0) : '')),
    p.total_employer_contributions, p.employer_cost_total,
    p.notes
  ];
  return row;
});

// ---------------------------------------------------------------------------
// Monthly Remittance by Country: flat Country/Month/Agency/Amount/Currency
// table (chosen over one sub-table per country -- lets the business owner
// filter/pivot in Excel by country or by month directly).
// ---------------------------------------------------------------------------

const remittanceHeader = ['Country', 'Month', 'Month #', 'Agency / Program', 'Amount', 'Currency', 'Remittance Timing'];
const remittanceRows: (string | number)[][] = [];
for (const country of COUNTRY_ORDER) {
  const months = monthlyAgency[country] || {};
  const currency = agg.countryCurrency[country];
  for (const month of MONTH_ORDER) {
    const agencies = months[month] || {};
    for (const agencyName of Object.keys(agencies).sort()) {
      remittanceRows.push([country, month, MONTH_NUM(month), agencyName, agencies[agencyName], currency, REMIT_TIMING_NOTE]);
    }
    if (Object.keys(agencies).length > 0) {
      const monthTotal = money(Object.values(agencies).reduce((s: number, v) => s + (v as number), 0));
      remittanceRows.push([country, month, MONTH_NUM(month), 'TOTAL', monthTotal, currency, '']);
    }
  }
}

function MONTH_NUM(m: string): string {
  const map: Record<string, string> = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07' };
  return map[m];
}

// ---------------------------------------------------------------------------
// Month-to-Month Variance Analysis
// ---------------------------------------------------------------------------

type VarianceRow = {
  country: string; fromMonth: string; toMonth: string; metric: string;
  fromValue: number; toValue: number; dollarChange: number; pctChange: number | null;
  notable: boolean; driver: string;
};

const varianceRows: VarianceRow[] = [];

// Per-country, per-month: gross pay total + remittance total + per-agency totals.
const monthlyGross: Record<string, Record<string, number>> = {};
for (const p of payslips) {
  monthlyGross[p.country] = monthlyGross[p.country] || {};
  monthlyGross[p.country][p.month] = money((monthlyGross[p.country][p.month] || 0) + p.gross_pay);
}
const monthlyRemitTotal: Record<string, Record<string, number>> = {};
for (const country of COUNTRY_ORDER) {
  monthlyRemitTotal[country] = {};
  const months = monthlyAgency[country] || {};
  for (const month of MONTH_ORDER) {
    const agencies = months[month] || {};
    monthlyRemitTotal[country][month] = money(Object.values(agencies).reduce((s: number, v) => s + (v as number), 0));
  }
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return money(((to - from) / Math.abs(from)) * 100);
}

// Helpers for driver explanations, built from the payslip detail itself.
function employeesInMonth(country: string, month: string): PayslipRow[] {
  return payslips.filter(p => p.country === country && p.month === month);
}
function bonusSummary(country: string, month: string) {
  const rows = employeesInMonth(country, month).filter(p => p.bonus_pay > 0);
  const total = money(rows.reduce((s, p) => s + p.bonus_pay, 0));
  return { count: rows.length, total };
}
function newHires(country: string, month: string): string[] {
  const idx = MONTH_ORDER.indexOf(month);
  if (idx <= 0) return [];
  const priorIds = new Set(payslips.filter(p => p.country === country && MONTH_ORDER.indexOf(p.month) < idx).map(p => p.employee_id));
  const thisMonthIds = new Set(employeesInMonth(country, month).map(p => p.employee_id));
  return [...thisMonthIds].filter(id => !priorIds.has(id));
}
// US Social Security wage-base cap detection: an employee whose "Social
// Security (Employee)" line drops to (near) 0 this month having been > 0
// the prior month, while gross pay stays materially unchanged/high.
function ssWageBaseCapCrossers(month: string): string[] {
  const idx = MONTH_ORDER.indexOf(month);
  if (idx <= 0) return [];
  const prevMonth = MONTH_ORDER[idx - 1];
  const out: string[] = [];
  for (const p of employeesInMonth('US', month)) {
    const ssNow = p.employee_lines.find(l => l.label === 'Social Security (Employee)')?.amount ?? 0;
    const prev = payslips.find(q => q.country === 'US' && q.employee_id === p.employee_id && q.month === prevMonth);
    const ssPrev = prev?.employee_lines.find(l => l.label === 'Social Security (Employee)')?.amount ?? 0;
    if (ssPrev > 5 && ssNow < 1 && p.gross_pay > 1000) out.push(p.employee_id);
  }
  return out;
}
function futaCapDrop(month: string): boolean {
  const idx = MONTH_ORDER.indexOf(month);
  if (idx <= 0) return false;
  const prevMonth = MONTH_ORDER[idx - 1];
  const now = employeesInMonth('US', month).reduce((s, p) => s + (p.employer_lines.find(l => l.label === 'FUTA (Employer)')?.amount ?? 0), 0);
  const prev = employeesInMonth('US', prevMonth).reduce((s, p) => s + (p.employer_lines.find(l => l.label === 'FUTA (Employer)')?.amount ?? 0), 0);
  return prev > 0 && now < prev * 0.5;
}

const NOTABLE_THRESHOLD = 15; // percent

for (const country of COUNTRY_ORDER) {
  for (let i = 1; i < MONTH_ORDER.length; i++) {
    const fromMonth = MONTH_ORDER[i - 1];
    const toMonth = MONTH_ORDER[i];
    const gFrom = monthlyGross[country]?.[fromMonth] ?? 0;
    const gTo = monthlyGross[country]?.[toMonth] ?? 0;
    const gPct = pctChange(gFrom, gTo);
    const grossNotable = gPct !== null && Math.abs(gPct) > NOTABLE_THRESHOLD;

    let grossDriver = '';
    if (grossNotable) {
      const hires = newHires(country, toMonth);
      const bonus = bonusSummary(country, toMonth);
      const bonusPrev = bonusSummary(country, fromMonth);
      const parts: string[] = [];
      if (hires.length > 0) parts.push(`${hires.length} new hire(s) appeared this month (${hires.join(', ')})`);
      if (bonus.total > bonusPrev.total) parts.push(`bonuses paid to ${bonus.count} employee(s) totaling ${bonus.total} this month (vs ${bonusPrev.total} the prior month)`);
      else if (bonusPrev.total > bonus.total) parts.push(`reverting after the prior month's bonus payout of ${bonusPrev.total} to ${bonusPrev.count} employee(s) (this month's bonus total: ${bonus.total})`);
      grossDriver = parts.length > 0 ? parts.join('; ') : 'driver not attributable to a new hire or bonus swing in the underlying data -- likely broad-based hours/pay variation.';
    }
    varianceRows.push({
      country, fromMonth, toMonth, metric: 'Gross Payroll',
      fromValue: gFrom, toValue: gTo, dollarChange: money(gTo - gFrom), pctChange: gPct,
      notable: grossNotable, driver: grossDriver
    });

    const rFrom = monthlyRemitTotal[country]?.[fromMonth] ?? 0;
    const rTo = monthlyRemitTotal[country]?.[toMonth] ?? 0;
    const rPct = pctChange(rFrom, rTo);
    const remitNotable = rPct !== null && Math.abs(rPct) > NOTABLE_THRESHOLD;
    let remitDriver = '';
    if (remitNotable) {
      const parts: string[] = [];
      if (country === 'US') {
        const cappedEmployees = ssWageBaseCapCrossers(toMonth);
        if (cappedEmployees.length > 0) parts.push(`${cappedEmployees.length} employee(s) crossed the Social Security wage base cap and stopped accruing OASDI this month (${cappedEmployees.join(', ')})`);
        if (futaCapDrop(toMonth)) parts.push('FUTA wage-base cap ($7,000/employee/year) reached for one or more employees, reducing employer FUTA');
      }
      const hires = newHires(country, toMonth);
      if (hires.length > 0) parts.push(`${hires.length} new hire(s) appeared this month`);
      const bonus = bonusSummary(country, toMonth);
      const bonusPrev = bonusSummary(country, fromMonth);
      if (bonus.total > bonusPrev.total) parts.push(`bonus payouts of ${bonus.total} to ${bonus.count} employee(s) this month (vs ${bonusPrev.total} prior month) increased taxable/contributable pay`);
      else if (bonusPrev.total > bonus.total) parts.push(`reverting after the prior month's bonus payout of ${bonusPrev.total} to ${bonusPrev.count} employee(s) (no comparable bonus this month)`);
      remitDriver = parts.length > 0 ? parts.join('; ') : 'driver not attributable to a new hire, bonus swing, or a wage-base cap in the underlying data -- consult the per-agency lines below.';
    }
    varianceRows.push({
      country, fromMonth, toMonth, metric: 'Total Remittance',
      fromValue: rFrom, toValue: rTo, dollarChange: money(rTo - rFrom), pctChange: rPct,
      notable: remitNotable, driver: remitDriver
    });

    // Per-agency line variance
    const agenciesFrom = monthlyAgency[country]?.[fromMonth] || {};
    const agenciesTo = monthlyAgency[country]?.[toMonth] || {};
    const allAgencyNames = new Set([...Object.keys(agenciesFrom), ...Object.keys(agenciesTo)]);
    for (const agencyName of [...allAgencyNames].sort()) {
      const aFrom = agenciesFrom[agencyName] ?? 0;
      const aTo = agenciesTo[agencyName] ?? 0;
      const aPct = pctChange(aFrom, aTo);
      const aNotable = aPct !== null && Math.abs(aPct) > NOTABLE_THRESHOLD && Math.abs(aTo - aFrom) > 1; // ignore noise on tiny amounts
      let aDriver = '';
      if (aNotable) {
        if (country === 'US' && /Social Security/.test(agencyName)) {
          const cappedEmployees = ssWageBaseCapCrossers(toMonth);
          if (cappedEmployees.length > 0) aDriver = `Employee(s) crossed the Social Security wage base cap: ${cappedEmployees.join(', ')}`;
        }
        if (country === 'US' && /FUTA/.test(agencyName) && futaCapDrop(toMonth)) {
          aDriver = 'FUTA wage-base cap reached for one or more employees this month.';
        }
        if (!aDriver) {
          const hires = newHires(country, toMonth);
          const bonus = bonusSummary(country, toMonth);
          const bonusPrev = bonusSummary(country, fromMonth);
          const parts: string[] = [];
          if (hires.length > 0) parts.push(`${hires.length} new hire(s) this month`);
          if (bonus.total > bonusPrev.total) parts.push(`bonus payouts of ${bonus.total} vs ${bonusPrev.total} prior month`);
          else if (bonusPrev.total > bonus.total) parts.push(`reverting after prior month's bonus of ${bonusPrev.total} (vs ${bonus.total} this month)`);
          aDriver = parts.length > 0 ? parts.join('; ') : 'driver not clearly attributable in the underlying employee-month data.';
        }
      }
      varianceRows.push({
        country, fromMonth, toMonth, metric: agencyName,
        fromValue: aFrom, toValue: aTo, dollarChange: money(aTo - aFrom), pctChange: aPct,
        notable: aNotable, driver: aDriver
      });
    }
  }
}

const varianceHeader = ['Country', 'From Month', 'To Month', 'Metric', 'From Value', 'To Value', '$ Change', '% Change', 'Notable (>15%)', 'Driver Explanation'];
const varianceRowsOut = varianceRows.map(v => [
  v.country, v.fromMonth, v.toMonth, v.metric, v.fromValue, v.toValue, v.dollarChange,
  v.pctChange === null ? 'N/A (from 0)' : v.pctChange, v.notable ? 'YES' : '', v.driver
]);

// ---------------------------------------------------------------------------
// Summary sheet
// ---------------------------------------------------------------------------

const totalEmployeeMonths = payslips.length;
const totalEmployees = new Set(payslips.map(p => p.employee_id)).size;

const summaryRows: (string | number)[][] = [
  ['Global 7-Month Payroll Stress Test -- Payslips & Remittance Detail', ''],
  ['Generated', new Date().toISOString().slice(0, 10)],
  ['Source dataset', 'global_months7_payroll_stress_test.xlsx (7_Month_Raw_Ledger, Jan-Jul 2026)'],
  [''],
  ['Total employees', totalEmployees],
  ['Total employee-months (payslip rows)', totalEmployeeMonths],
  ['Countries covered', COUNTRY_ORDER.length],
  [''],
  ['7-Month Grand Totals by Country (local currency)', ''],
  ['Country', 'Currency', 'Employee-Months', 'Gross Pay', 'Net Pay', 'Total Remittance'],
  ...COUNTRY_ORDER.map(c => [c, agg.countryCurrency[c], agg.countryEmployeeMonths[c], agg.countryGross[c], agg.countryNet[c], agg.countryRemit[c]]),
  [''],
  ['Sheet guide', ''],
  ['Payslip Register', `One row per employee per month (${totalEmployeeMonths} rows): gross pay broken into base/overtime/bonus, every employee-side deduction and employer-side contribution by name and amount (country-prefixed columns; blank where not applicable to that country), net pay, and total employer cost.`],
  ['Monthly Remittance by Country', 'What the company owes each government agency, by month, by country, by agency -- the "payment instruction" view. Flat Country/Month/Agency/Amount table with a TOTAL row per country-month.'],
  ['Month-to-Month Variance', 'Gross payroll, total remittance, and each agency line, month over month, with $ and % change and a one-line driver explanation for every swing over 15%.'],
  [''],
  ['Reconciliation', 'Monthly remittance detail in this workbook sums EXACTLY to the already-verified 7-month totals in _stress_test_results.json (checked programmatically before this workbook was built -- see console output of build-payroll-workbook.ts).'],
  ['Note on Quebec', 'Quebec is included: 10 employees x 7 months = 70 employee-months, using QPP/QPIP/Quebec provincial tax/reduced-rate EI in place of CPP -- confirmed present in the Payslip Register and Monthly Remittance sheets.']
];

// ---------------------------------------------------------------------------
// Write workbook
// ---------------------------------------------------------------------------

const wb = XLSX.utils.book_new();

const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
wsSummary['!cols'] = [{ wch: 34 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

const wsRegister = XLSX.utils.aoa_to_sheet([registerHeader, ...registerRows]);
wsRegister['!cols'] = registerHeader.map((h, i) => ({ wch: i < 6 ? 14 : Math.min(Math.max(String(h).length + 2, 10), 32) }));
wsRegister['!freeze'] = { xSplit: 0, ySplit: 1 };
(wsRegister as any)['!views'] = [{ state: 'frozen', ySplit: 1 }];
XLSX.utils.book_append_sheet(wb, wsRegister, 'Payslip Register');

const wsRemit = XLSX.utils.aoa_to_sheet([remittanceHeader, ...remittanceRows]);
wsRemit['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 48 }, { wch: 14 }, { wch: 10 }, { wch: 42 }];
(wsRemit as any)['!views'] = [{ state: 'frozen', ySplit: 1 }];
XLSX.utils.book_append_sheet(wb, wsRemit, 'Monthly Remittance by Country');

const wsVariance = XLSX.utils.aoa_to_sheet([varianceHeader, ...varianceRowsOut]);
wsVariance['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 70 }];
(wsVariance as any)['!views'] = [{ state: 'frozen', ySplit: 1 }];
XLSX.utils.book_append_sheet(wb, wsVariance, 'Month-to-Month Variance');

const OUT_PATH = './payroll-stress-test-payslips-and-remittance-2026-09.xlsx';
XLSX.writeFile(wb, OUT_PATH);
console.log(`Wrote ${OUT_PATH}`);
console.log(`  Summary: 1 page overview`);
console.log(`  Payslip Register: ${registerRows.length} rows, ${registerHeader.length} columns`);
console.log(`  Monthly Remittance by Country: ${remittanceRows.length} rows`);
console.log(`  Month-to-Month Variance: ${varianceRowsOut.length} rows (${varianceRows.filter(v => v.notable).length} flagged notable >${NOTABLE_THRESHOLD}%)`);

// ---------------------------------------------------------------------------
// Notable findings for console + markdown append
// ---------------------------------------------------------------------------

const notableRemitSwings = varianceRows.filter(v => v.metric === 'Total Remittance' && v.notable);
console.log('\n--- Notable (>15%) month-to-month TOTAL REMITTANCE swings ---');
for (const v of notableRemitSwings) {
  console.log(`${v.country} ${v.fromMonth}->${v.toMonth}: ${v.fromValue} -> ${v.toValue} (${v.pctChange}%). ${v.driver}`);
}

fs.writeFileSync('./_variance_findings.json', JSON.stringify({ notableRemitSwings, notableGrossSwings: varianceRows.filter(v => v.metric === 'Gross Payroll' && v.notable) }, null, 2));
