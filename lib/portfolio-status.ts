// Portfolio status/control aggregation -- Firm Workspace Implementation
// Brief, item 5. Turns each client company's REAL control state (already
// computed by lib/finance-cycle-engine.ts's evaluateMonthlyClose, which
// this file deliberately does NOT duplicate -- see the brief's own
// non-goal "do not duplicate bookkeeping/payroll engines for firms") into
// the GREEN/YELLOW/RED traffic light the brief specifies, with a
// rules-based, explainable reason-code list behind every color -- never a
// manually-set decoration field.
//
// UPDATE (same day): the company_id -> deployment_id gap this file
// originally flagged is now closed. lib/onboarding-history.ts's
// linkDeploymentCompany() writes a small, purely additive reverse index
// (finclose_company_deployments/{companyId}/{deploymentId}) alongside its
// existing fields in the same atomic update -- no existing field, record
// shape, or control flow changed. lib/service-deployments.ts exposes it
// as listDeploymentsForCompany(). resolveCompanyCloseStatusLive() below
// uses that index to implement a REAL CompanyCloseStatusResolver: for
// each of a company's linked deployments, follow deployment.
// latest_monthly_close_id -> finclose_monthly_closes/{id} (a record
// finance-cycle-engine.ts's evaluateMonthlyClose() already produces and
// persists), and return the most recently updated one. A company that
// existed before this index was added returns null (NOT_STARTED) until
// it next links or re-links a service -- a real, disclosed limitation,
// not a silent gap.
//
// deriveCloseStatus and combineFirmPortfolio remain exactly as designed
// below: pure rules over whatever close record they're handed, agnostic
// to where that record came from.

import { realtimeDatabase } from './finclose-backend';
import { listOrganizationCompanies } from './tenancy';
import { listFirmClientOrganizations } from './firm-tenancy';
import { listDeploymentsForCompany, getServiceDeployment } from './service-deployments';

export type PortfolioStatusColor = 'GREEN' | 'YELLOW' | 'RED' | 'NOT_STARTED';

export type PortfolioStatusResult = {
  status: PortfolioStatusColor;
  reasons: string[]; // machine-readable exception codes, empty for GREEN/NOT_STARTED
};

// Exception codes are the SAME strings evaluateMonthlyClose() in
// lib/finance-cycle-engine.ts already pushes into its own `exceptions`
// array (PAYROLL_JOURNAL_NOT_BALANCED, BANK_CLOSING_BALANCE_DIFFERENCE,
// etc.) -- this is a translation layer over that engine's own output, not
// a second, parallel set of checks. If evaluateMonthlyClose ever adds a
// new exception code, it lands in the UNRECOGNIZED_EXCEPTION fallback
// below (YELLOW, not silently GREEN) until this map is updated to
// classify it -- a new failure mode is never treated as "no problem."
const RED_EXCEPTION_CODES = new Set([
  'PAYROLL_JOURNAL_NOT_BALANCED',
  'BOOKKEEPING_JOURNAL_NOT_BALANCED',
  'BANK_CLOSING_BALANCE_CONTROL_NOT_PROVIDED', // bank feed / control missing entirely
  'BANK_CLOSING_BALANCE_DIFFERENCE', // statement does not reconcile
  'NET_PAYROLL_OVERSETTLED',
  'INCOME_TAX_OVERSETTLED',
  'PENSION_OVERSETTLED'
]);

const YELLOW_EXCEPTION_CODES = new Set([
  'BANK_RECONCILIATION_AMBIGUOUS_ITEMS',
  'BANK_RECONCILIATION_UNMATCHED_BANK_ITEMS',
  'BANK_RECONCILIATION_UNMATCHED_LEDGER_ITEMS'
]);

// Pure function -- takes the ALREADY-COMPUTED monthly-close record
// (whatever evaluateMonthlyClose() returned and finance-cycle-engine.ts
// persisted to finclose_monthly_closes/{id}) and derives the traffic
// light. No I/O, fully unit-testable, and it is the one piece of this
// file the brief's "reason codes so UI statuses are explainable"
// requirement is actually about.
export function deriveCloseStatus(closeRecord: { exceptions?: string[]; control_status?: string; close_status?: string } | null): PortfolioStatusResult {
  if (!closeRecord) return { status: 'NOT_STARTED', reasons: [] };

  const exceptions = closeRecord.exceptions || [];
  const reds = exceptions.filter(code => RED_EXCEPTION_CODES.has(code));
  const yellows = exceptions.filter(code => YELLOW_EXCEPTION_CODES.has(code));
  const unrecognized = exceptions.filter(code => !RED_EXCEPTION_CODES.has(code) && !YELLOW_EXCEPTION_CODES.has(code));

  if (reds.length > 0) return { status: 'RED', reasons: reds };
  if (unrecognized.length > 0) return { status: 'YELLOW', reasons: unrecognized }; // unknown exception code -> treat as needs-review, never silently clear
  if (yellows.length > 0) return { status: 'YELLOW', reasons: yellows };

  // No exceptions at all: GREEN only once the underlying engine itself
  // reports a clean pass -- an empty exceptions array with a non-PASS
  // control_status would be an inconsistent record, not a clean one, so
  // it is treated as YELLOW ("needs review") rather than trusted blindly.
  if (closeRecord.control_status === 'PASS') return { status: 'GREEN', reasons: [] };
  return { status: 'YELLOW', reasons: ['CONTROL_STATUS_NOT_PASS_WITH_NO_EXCEPTIONS'] };
}

export type PortfolioRow = {
  company_id: string;
  organization_id: string;
  legal_name: unknown;
  country_code: unknown;
  service_scope: unknown;
  status: PortfolioStatusColor;
  reasons: string[];
};

// Injected: given a company_id (and its service_scope, for convenience),
// return that company's latest close record (or null if none exists
// yet -> NOT_STARTED). Kept as an injected function rather than a hard
// import inside combineFirmPortfolio so the pure assembly logic stays
// testable without touching Firebase -- resolveCompanyCloseStatusLive
// below is the real implementation a caller supplies in production.
export type CompanyCloseStatusResolver = (companyId: string, serviceScope: unknown) => Promise<{ exceptions?: string[]; control_status?: string; close_status?: string } | null>;

// Real implementation of CompanyCloseStatusResolver. A company can have
// more than one linked deployment (e.g. a service was re-registered);
// this checks every one of them and returns the close record with the
// most recent updated_at, since that is the one most likely to reflect
// the company's current close cycle. Returns null (-> NOT_STARTED) if
// the company has no linked deployment yet, or none of its deployments
// has produced a close.
export const resolveCompanyCloseStatusLive: CompanyCloseStatusResolver = async (companyId) => {
  const deploymentRefs = await listDeploymentsForCompany(companyId);
  if (!deploymentRefs.length) return null;

  let best: { exceptions?: string[]; control_status?: string; close_status?: string; updated_at?: number } | null = null;

  for (const ref of deploymentRefs) {
    let deployment: Record<string, unknown>;
    try {
      deployment = await getServiceDeployment(ref.deployment_id) as Record<string, unknown>;
    } catch {
      continue; // a stale index entry pointing at a deleted deployment should not break the whole sweep
    }
    const closeId = String(deployment.latest_monthly_close_id || '');
    if (!closeId) continue;
    const closeSnap = await realtimeDatabase().ref(`finclose_monthly_closes/${closeId}`).once('value');
    if (!closeSnap.exists()) continue;
    const close = closeSnap.val() as { exceptions?: string[]; control_status?: string; close_status?: string; updated_at?: number };
    if (!best || Number(close.updated_at || 0) > Number(best.updated_at || 0)) best = close;
  }

  return best;
};

export async function combineFirmPortfolio(firmId: string, resolveCompanyCloseStatus: CompanyCloseStatusResolver): Promise<PortfolioRow[]> {
  const delegatedClients = await listFirmClientOrganizations(firmId);
  const rows: PortfolioRow[] = [];

  for (const client of delegatedClients) {
    const companies = await listOrganizationCompanies(client.organization_id);
    for (const company of companies) {
      const companyId = String(company.company_id || '');
      if (!companyId) continue;
      const closeRecord = await resolveCompanyCloseStatus(companyId, company.service_scope);
      const { status, reasons } = deriveCloseStatus(closeRecord);
      rows.push({
        company_id: companyId,
        organization_id: client.organization_id,
        legal_name: company.legal_name,
        country_code: company.country_code,
        service_scope: company.service_scope,
        status,
        reasons
      });
    }
  }

  return rows;
}

export function portfolioSummaryCounts(rows: PortfolioRow[]) {
  return {
    total: rows.length,
    green: rows.filter(r => r.status === 'GREEN').length,
    yellow: rows.filter(r => r.status === 'YELLOW').length,
    red: rows.filter(r => r.status === 'RED').length,
    not_started: rows.filter(r => r.status === 'NOT_STARTED').length,
    needs_attention_company_ids: rows.filter(r => r.status === 'RED' || r.status === 'YELLOW').map(r => r.company_id)
  };
}
