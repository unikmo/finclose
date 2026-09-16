'use client';

import { useEffect, useState } from 'react';

type RunSummary = {
  payroll_run_id: string;
  pay_date: string;
  currency?: string;
  employee_count: number;
  approval_status?: string;
};

type VarianceFigure = { current: number; previous: number; delta_amount: number; delta_pct: number | null };

type VarianceEmployee = {
  employee_id: string;
  name?: string;
  status: 'CONTINUING' | 'NEW_HIRE' | 'TERMINATED';
  current_gross_pay: number | null;
  previous_gross_pay: number | null;
  gross_pay_delta_amount: number | null;
  gross_pay_delta_pct: number | null;
  current_net_pay: number | null;
  previous_net_pay: number | null;
  flagged: boolean;
  flag_reasons: string[];
};

type Variance = {
  has_baseline: boolean;
  currency: string | null;
  current_pay_date: string;
  previous_pay_date: string | null;
  aggregate: {
    gross_pay: VarianceFigure;
    net_pay: VarianceFigure;
    headcount: { current: number; previous: number; delta: number };
  } | null;
  employees: VarianceEmployee[];
  summary: { new_hires: number; terminated: number; flagged_continuing: number; needs_review: boolean };
  limitations: string[];
};

const FLAG_LABEL: Record<string, string> = {
  NEW_HIRE: 'New hire',
  TERMINATED: 'Terminated',
  GROSS_PAY_CHANGE: 'Gross pay changed',
  NET_PAY_CHANGE_WITHOUT_GROSS_CHANGE: 'Net pay changed, gross flat'
};

function money(value: number | null, currency: string | null) {
  if (value === null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function pct(value: number | null) {
  if (value === null) return '—';
  const formatted = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value);
  return formatted;
}

export default function PayrollVariancePanel({ deploymentId }: { deploymentId: string }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [variance, setVariance] = useState<Variance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/service-deployments/${deploymentId}/payroll/runs`)
      .then(r => r.json())
      .then((result: RunSummary[]) => {
        setRuns(result);
        if (result.length > 0) setSelectedRunId(result[result.length - 1].payroll_run_id);
        else setLoading(false);
      })
      .catch(() => { setError('Could not load payroll runs for this company.'); setLoading(false); });
  }, [deploymentId]);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    setError('');
    fetch(`/api/service-deployments/${deploymentId}/payroll/variance?run_id=${encodeURIComponent(selectedRunId)}`)
      .then(r => r.json())
      .then((result: Variance) => setVariance(result))
      .catch(() => setError('Could not load payroll variance for this run.'))
      .finally(() => setLoading(false));
  }, [deploymentId, selectedRunId]);

  if (loading && runs === null) {
    return (
      <section className="payroll-stage payroll-variance-stage">
        <div className="payroll-empty-state">Loading payroll variance…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="payroll-stage payroll-variance-stage">
        <div className="payroll-warning-inline">{error}</div>
      </section>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <section className="payroll-stage payroll-variance-stage">
        <div className="payroll-stage-head">
          <div>
            <span className="payroll-stage-number">REVIEW</span>
            <h2>Payroll variance</h2>
            <p>Nothing to review yet — variance appears here as soon as the first payroll run is prepared for this company.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="payroll-stage payroll-variance-stage">
      <div className="payroll-stage-head">
        <div>
          <span className="payroll-stage-number">REVIEW</span>
          <h2>Payroll variance</h2>
          <p>Every prepared run compared against the one before it, so nothing gets approved on numbers alone.</p>
        </div>
        {runs.length > 1 && (
          <label className="payroll-variance-picker">
            <span>Run</span>
            <select value={selectedRunId} onChange={event => setSelectedRunId(event.target.value)}>
              {runs.map(run => (
                <option key={run.payroll_run_id} value={run.payroll_run_id}>
                  {run.pay_date} · {run.employee_count} employee{run.employee_count === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {variance && !variance.has_baseline && (
        <div className="payroll-empty-state">
          This is the first recorded run for this company — there is no prior run to compare it against yet. Variance will appear from the next run onward.
        </div>
      )}

      {variance && variance.has_baseline && variance.aggregate && (
        <>
          {variance.summary.needs_review && (
            <div className="payroll-warning-inline payroll-variance-alert">
              This run needs a closer look: {variance.summary.flagged_continuing > 0 ? `${variance.summary.flagged_continuing} employee${variance.summary.flagged_continuing === 1 ? '' : 's'} with a material pay change` : 'total gross pay moved more than the usual threshold'} since {variance.previous_pay_date}.
            </div>
          )}

          <div className="payroll-variance-tiles">
            <div className="payroll-variance-tile">
              <span>Gross pay</span>
              <strong>{money(variance.aggregate.gross_pay.current, variance.currency)}</strong>
              <small>{money(variance.aggregate.gross_pay.previous, variance.currency)} last run · {pct(variance.aggregate.gross_pay.delta_pct)} ({money(variance.aggregate.gross_pay.delta_amount, variance.currency)})</small>
            </div>
            <div className="payroll-variance-tile">
              <span>Net pay</span>
              <strong>{money(variance.aggregate.net_pay.current, variance.currency)}</strong>
              <small>{money(variance.aggregate.net_pay.previous, variance.currency)} last run · {pct(variance.aggregate.net_pay.delta_pct)} ({money(variance.aggregate.net_pay.delta_amount, variance.currency)})</small>
            </div>
            <div className="payroll-variance-tile">
              <span>Headcount</span>
              <strong>{variance.aggregate.headcount.current}</strong>
              <small>{variance.aggregate.headcount.previous} last run · {variance.summary.new_hires} new · {variance.summary.terminated} left</small>
            </div>
          </div>

          <div className="payroll-variance-table-wrap">
            <table className="payroll-variance-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Gross pay</th>
                  <th>Net pay</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {variance.employees.map(employee => (
                  <tr key={employee.employee_id} className={employee.flagged ? 'flagged' : ''}>
                    <td>{employee.name || employee.employee_id}</td>
                    <td className="payroll-variance-status">{employee.status.replace('_', ' ').toLowerCase()}</td>
                    <td>
                      {money(employee.current_gross_pay, variance.currency)}
                      {employee.gross_pay_delta_pct !== null && <small> {pct(employee.gross_pay_delta_pct)}</small>}
                    </td>
                    <td>
                      {money(employee.current_net_pay, variance.currency)}
                    </td>
                    <td>
                      {employee.flag_reasons.map(reason => (
                        <span className="payroll-variance-badge" key={reason}>{FLAG_LABEL[reason] || reason}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
