import { parseBankStatementCsv, type IntakeResult } from './statement-intake';
import { buildRulePack, categoriseAll } from './categorisation-engine';
import { buildReviewPack, renderEntriesCsv, renderReviewPackMarkdown, type ReviewPack } from './review-pack';

// Orchestrates statement CSV -> categorisation -> accountant review pack.
// Pure and stateless: validates the request, runs the three steps, returns the
// result. Nothing is stored or posted. The API route is a thin wrapper.

export const MAX_STATEMENT_CHARS = 2_000_000;
export const MAX_STATEMENT_ROWS = 20_000;

export type StatementPrepRequest = {
  company_name?: unknown;
  jurisdiction?: unknown;
  vat_registered?: unknown;
  period_start?: unknown;
  period_end?: unknown;
  csv_text?: unknown;
  date_order?: unknown;
  currency?: unknown;
};

export type StatementPrepResult = {
  pack: ReviewPack;
  markdown: string;
  entries_csv: string;
  intake: {
    imported: number;
    rejected_count: number;
    rejected_sample: IntakeResult['rejected'];
    warnings: string[];
    detected: IntakeResult['detected'];
  };
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function isoDay(value: unknown, field: string): string {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw httpError(`${field} must be a date like 2026-03-31`, 400);
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (probe.getUTCFullYear() !== Number(match[1]) || probe.getUTCMonth() !== Number(match[2]) - 1 || probe.getUTCDate() !== Number(match[3])) {
    throw httpError(`${field} is not a real calendar date`, 400);
  }
  return text;
}

export function prepareStatementReview(request: StatementPrepRequest, generatedAt?: number): StatementPrepResult {
  const companyName = String(request.company_name ?? '').trim().slice(0, 200);
  if (!companyName) throw httpError('company_name is required', 400);
  const jurisdictionInput = String(request.jurisdiction ?? 'GENERIC').toUpperCase();
  if (jurisdictionInput !== 'EE' && jurisdictionInput !== 'GENERIC') throw httpError('jurisdiction must be EE or GENERIC', 400);
  const periodStart = isoDay(request.period_start, 'period_start');
  const periodEnd = isoDay(request.period_end, 'period_end');
  if (periodStart > periodEnd) throw httpError('period_start must not be after period_end', 400);
  const csv = typeof request.csv_text === 'string' ? request.csv_text : '';
  if (!csv.trim()) throw httpError('csv_text is required', 400);
  if (csv.length > MAX_STATEMENT_CHARS) throw httpError(`statement is larger than ${MAX_STATEMENT_CHARS} characters`, 413);
  const dateOrder = request.date_order === 'MDY' || request.date_order === 'auto' ? request.date_order : 'DMY';
  const currencyInput = String(request.currency ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyInput)) throw httpError('currency must be a 3-letter code', 400);
  const vatRegistered = request.vat_registered === true;

  const intake = parseBankStatementCsv(csv, { currency: currencyInput, date_order: dateOrder });
  if (intake.transactions.length > MAX_STATEMENT_ROWS) throw httpError(`statement has more than ${MAX_STATEMENT_ROWS} rows`, 413);
  if (intake.transactions.length === 0) {
    const reason = intake.warnings[0] || (intake.rejected.length ? `all ${intake.rejected.length} rows were rejected (${intake.rejected[0].reason})` : 'no transactions found');
    throw httpError(`no usable transactions: ${reason}`, 422);
  }

  const rulePack = buildRulePack(jurisdictionInput);
  const suggestions = categoriseAll(intake.transactions, rulePack, [], { vat_registered: vatRegistered });
  const pack = buildReviewPack({
    company: { name: companyName, jurisdiction: jurisdictionInput, vat_registered: vatRegistered },
    period: { start: periodStart, end: periodEnd },
    transactions: intake.transactions,
    suggestions,
    generated_at: generatedAt
  });
  return {
    pack,
    markdown: renderReviewPackMarkdown(pack),
    entries_csv: renderEntriesCsv(pack),
    intake: {
      imported: intake.transactions.length,
      rejected_count: intake.rejected.length,
      rejected_sample: intake.rejected.slice(0, 25).map(row => ({ ...row, raw: row.raw.slice(0, 200) })),
      warnings: intake.warnings,
      detected: intake.detected
    }
  };
}
