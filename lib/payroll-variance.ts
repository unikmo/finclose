// Payroll run-over-run variance for the accountant review step. Turns
// two prepared payroll runs (current + the one immediately before it for
// the same service deployment) into a per-employee and aggregate
// gross/net pay delta ($ and %), flags what looks material, and never
// fabricates a comparison when there is nothing real to compare against.
//
// Deliberately scoped to gross_pay and net_pay only -- the two fields
// every country payroll engine (lib/payroll-engine-*.ts) produces with
// the same name and meaning. Country-specific fields (e.g. the US
// engine's 20+ state tax lines) are NOT unified into a fake "employer
// cost" total here; doing that generically across 9 very different rule
// packs would be guessing, not calculating. See limitations below.

import { realtimeDatabase } from './finclose-backend';

export type PayrollRunRecord = {
  payroll_run_id: string;
  deployment_id: string;
  pay_date: string;
  created_at: number;
  currency?: string;
  country_code?: string;
  employees: Array<{ employee_id: string; name?: string; gross_pay: number; net_pay: number }>;
  totals: { gross_pay: number; net_pay: number };
  controls: { employee_count: number };
};

// Realtime Database keys are `${deploymentId}__${pay_date}__${fingerprint}`
// (see preparePayrollRun in lib/payroll-engine.ts). RTDB orders children
// lexicographically by key, so a plain orderByKey() range query on that
// literal prefix returns exactly this deployment's runs -- no separate
// index to add or keep in sync, and ISO pay_date sorts correctly as text.
export async function listPayrollRunsForDeployment(deploymentId: string): Promise<PayrollRunRecord[]> {
  const prefix = `${deploymentId}__`;
  const snap = await realtimeDatabase()
    .ref('finclose_payroll_runs')
    .orderByKey()
    .startAt(prefix)
    .endAt(prefix + '')
    .once('value');
  const val = snap.val() as Record<string, PayrollRunRecord> | null;
  if (!val) return [];
  return Object.values(val).sort((a, b) =>
    String(a.pay_date).localeCompare(String(b.pay_date)) || Number(a.created_at) - Number(b.created_at)
  );
}

// Thresholds an accountant would actually want, not decoration: a
// percentage move alone over-flags tiny salaries (a $5 rounding blip on
// a $40 part-time gross reads as "12%"), and a dollar move alone
// over-flags large payrolls (a $200 move on a $50,000 total is nothing).
// Both must be crossed together for a per-employee flag.
export const VARIANCE_THRESHOLDS = {
  employee_material_pct: 0.03,
  employee_material_amount: 25,
  aggregate_material_pct: 0.05
};

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return money((current - previous) / Math.abs(previous));
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function amount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type VarianceFigure = {
  current: number;
  previous: number;
  delta_amount: number;
  delta_pct: number | null;
};

export type PayrollVarianceEmployee = {
  employee_id: string;
  name?: string;
  status: 'CONTINUING' | 'NEW_HIRE' | 'TERMINATED';
  current_gross_pay: number | null;
  previous_gross_pay: number | null;
  gross_pay_delta_amount: number | null;
  gross_pay_delta_pct: number | null;
  current_net_pay: number | null;
  previous_net_pay: number | null;
  net_pay_delta_amount: number | null;
  net_pay_delta_pct: number | null;
  flagged: boolean;
  flag_reasons: Array<'NEW_HIRE' | 'TERMINATED' | 'GROSS_PAY_CHANGE' | 'NET_PAY_CHANGE_WITHOUT_GROSS_CHANGE'>;
};

export type PayrollVarianceResult = {
  has_baseline: boolean;
  currency: string | null;
  current_run_id: string;
  previous_run_id: string | null;
  current_pay_date: string;
  previous_pay_date: string | null;
  aggregate: {
    gross_pay: VarianceFigure;
    net_pay: VarianceFigure;
    headcount: { current: number; previous: number; delta: number };
  } | null;
  employees: PayrollVarianceEmployee[];
  summary: {
    new_hires: number;
    terminated: number;
    flagged_continuing: number;
    needs_review: boolean;
  };
  thresholds: typeof VARIANCE_THRESHOLDS;
  limitations: string[];
};

function isEmployeeMaterial(deltaAmount: number, deltaPct: number | null) {
  return deltaPct !== null &&
    Math.abs(deltaPct) >= VARIANCE_THRESHOLDS.employee_material_pct &&
    Math.abs(deltaAmount) >= VARIANCE_THRESHOLDS.employee_material_amount;
}

export function computePayrollVariance(currentRun: PayrollRunRecord, previousRun: PayrollRunRecord | null): PayrollVarianceResult {
  const limitations = [
    'Compares gross_pay and net_pay only -- the two fields every FinClose payroll engine produces with the same meaning. Country-specific lines (e.g. individual US state taxes, employer contribution breakdowns) are not compared here.',
    'A per-employee flag requires BOTH the percentage and dollar-amount thresholds to be crossed, so a large swing on a small salary and a small swing on a large salary are both suppressed from the flagged list -- they still appear in the full employee table.',
    'This is a mechanical comparison against the immediately prior run for this deployment. It does not know WHY a number moved (raise, backdated correction, rate change, data error) -- that judgment is the reviewing accountant\'s.'
  ];

  if (!previousRun) {
    return {
      has_baseline: false,
      currency: currentRun.currency || null,
      current_run_id: currentRun.payroll_run_id,
      previous_run_id: null,
      current_pay_date: currentRun.pay_date,
      previous_pay_date: null,
      aggregate: null,
      employees: [],
      summary: { new_hires: 0, terminated: 0, flagged_continuing: 0, needs_review: false },
      thresholds: VARIANCE_THRESHOLDS,
      limitations: [
        'This is the first recorded payroll run for this deployment -- there is no prior run to compare against yet. Variance will be available starting with the second run.',
        ...limitations
      ]
    };
  }

  const currentById = new Map(currentRun.employees.map(e => [e.employee_id, e]));
  const previousById = new Map(previousRun.employees.map(e => [e.employee_id, e]));
  const allIds = new Set([...currentById.keys(), ...previousById.keys()]);

  const employees: PayrollVarianceEmployee[] = [];
  let newHires = 0;
  let terminated = 0;
  let flaggedContinuing = 0;

  for (const id of allIds) {
    const curr = currentById.get(id);
    const prev = previousById.get(id);

    if (curr && !prev) {
      newHires += 1;
      employees.push({
        employee_id: id, name: curr.name,
        status: 'NEW_HIRE',
        current_gross_pay: amount(curr.gross_pay), previous_gross_pay: null,
        gross_pay_delta_amount: null, gross_pay_delta_pct: null,
        current_net_pay: amount(curr.net_pay), previous_net_pay: null,
        net_pay_delta_amount: null, net_pay_delta_pct: null,
        flagged: true, flag_reasons: ['NEW_HIRE']
      });
      continue;
    }

    if (prev && !curr) {
      terminated += 1;
      employees.push({
        employee_id: id, name: prev.name,
        status: 'TERMINATED',
        current_gross_pay: null, previous_gross_pay: amount(prev.gross_pay),
        gross_pay_delta_amount: null, gross_pay_delta_pct: null,
        current_net_pay: null, previous_net_pay: amount(prev.net_pay),
        net_pay_delta_amount: null, net_pay_delta_pct: null,
        flagged: true, flag_reasons: ['TERMINATED']
      });
      continue;
    }

    const c = curr!;
    const p = prev!;
    const grossDeltaAmount = amount(c.gross_pay - p.gross_pay);
    const grossDeltaPct = pct(c.gross_pay, p.gross_pay);
    const netDeltaAmount = amount(c.net_pay - p.net_pay);
    const netDeltaPct = pct(c.net_pay, p.net_pay);

    const grossMaterial = isEmployeeMaterial(grossDeltaAmount, grossDeltaPct);
    const netMaterialAlone = !grossMaterial && isEmployeeMaterial(netDeltaAmount, netDeltaPct);

    const reasons: PayrollVarianceEmployee['flag_reasons'] = [];
    if (grossMaterial) reasons.push('GROSS_PAY_CHANGE');
    else if (netMaterialAlone) reasons.push('NET_PAY_CHANGE_WITHOUT_GROSS_CHANGE');
    if (reasons.length > 0) flaggedContinuing += 1;

    employees.push({
      employee_id: id, name: c.name || p.name,
      status: 'CONTINUING',
      current_gross_pay: amount(c.gross_pay), previous_gross_pay: amount(p.gross_pay),
      gross_pay_delta_amount: grossDeltaAmount, gross_pay_delta_pct: grossDeltaPct,
      current_net_pay: amount(c.net_pay), previous_net_pay: amount(p.net_pay),
      net_pay_delta_amount: netDeltaAmount, net_pay_delta_pct: netDeltaPct,
      flagged: reasons.length > 0, flag_reasons: reasons
    });
  }

  // Stable order: flagged first, then by employee_id, so the accountant
  // sees what needs attention without hunting for it.
  employees.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return a.employee_id.localeCompare(b.employee_id);
  });

  const grossAggregate: VarianceFigure = {
    current: amount(currentRun.totals.gross_pay),
    previous: amount(previousRun.totals.gross_pay),
    delta_amount: amount(currentRun.totals.gross_pay - previousRun.totals.gross_pay),
    delta_pct: pct(currentRun.totals.gross_pay, previousRun.totals.gross_pay)
  };
  const netAggregate: VarianceFigure = {
    current: amount(currentRun.totals.net_pay),
    previous: amount(previousRun.totals.net_pay),
    delta_amount: amount(currentRun.totals.net_pay - previousRun.totals.net_pay),
    delta_pct: pct(currentRun.totals.net_pay, previousRun.totals.net_pay)
  };

  const aggregateFlagged = grossAggregate.delta_pct !== null &&
    Math.abs(grossAggregate.delta_pct) >= VARIANCE_THRESHOLDS.aggregate_material_pct;

  return {
    has_baseline: true,
    currency: currentRun.currency || previousRun.currency || null,
    current_run_id: currentRun.payroll_run_id,
    previous_run_id: previousRun.payroll_run_id,
    current_pay_date: currentRun.pay_date,
    previous_pay_date: previousRun.pay_date,
    aggregate: {
      gross_pay: grossAggregate,
      net_pay: netAggregate,
      headcount: {
        current: currentRun.controls.employee_count,
        previous: previousRun.controls.employee_count,
        delta: currentRun.controls.employee_count - previousRun.controls.employee_count
      }
    },
    employees,
    summary: {
      new_hires: newHires,
      terminated,
      flagged_continuing: flaggedContinuing,
      needs_review: aggregateFlagged || flaggedContinuing > 0
    },
    thresholds: VARIANCE_THRESHOLDS,
    limitations
  };
}
