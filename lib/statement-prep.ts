import { parseAmountToCents, parseBankStatementCsv, type IntakeResult } from './statement-intake';
import { applyAccountingAdjustments } from './statement-accounting';
import { buildRulePack, categoriseAll, type CategorySuggestion, type LearnedRule, type VatTreatment } from './categorisation-engine';
import { unreconciledIds, type LedgerLine } from './reconciliation';
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
  opening_balance?: unknown; // optional statement balances enable the continuity check
  closing_balance?: unknown;
};

// Things learned from earlier rounds (saved packs): what the owner uploaded or
// answered, and what a reviewer corrected. All optional; absent means first run.
export type PrepExtras = {
  learned_rules?: LearnedRule[];
  document_links?: Record<string, string[]>;
  overrides?: Record<string, { category_code: string; vat_treatment: VatTreatment; vat_rate?: number }>;
  ledger_lines?: LedgerLine[]; // posted ledger movements for this bank account; enables the reconciliation check
  dismissed_duplicates?: string[]; // transaction ids the owner confirmed are real
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

export function prepareStatementReview(request: StatementPrepRequest, generatedAt?: number, extras: PrepExtras = {}): StatementPrepResult {
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
  const balance = (raw: unknown, field: string): number | null => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const cents = parseAmountToCents(String(raw));
    if (cents === null) throw httpError(`${field} is not a valid amount`, 400);
    return cents;
  };
  const openingBalance = balance(request.opening_balance, 'opening_balance');
  const closingBalance = balance(request.closing_balance, 'closing_balance');
  if ((openingBalance === null) !== (closingBalance === null)) throw httpError('give both opening_balance and closing_balance, or neither', 400);

  const dismissed = new Set(extras.dismissed_duplicates || []);
  const transactions = intake.transactions.map(tx => (tx.possible_duplicate_of && dismissed.has(tx.transaction_id) ? { ...tx, possible_duplicate_of: null } : tx));
  const names = new Map(rulePack.categories.map(category => [category.code, category.name]));
  const categorised = categoriseAll(transactions, rulePack, extras.learned_rules || [], { vat_registered: vatRegistered });
  const overridden: CategorySuggestion[] = categorised.map(suggestion => {
    const override = extras.overrides?.[suggestion.transaction_id];
    if (!override || !names.has(override.category_code)) return suggestion;
    return { ...suggestion, category_code: override.category_code, category_name: names.get(override.category_code)!, vat_treatment: override.vat_treatment, vat_rate: vatRegistered && override.vat_rate !== undefined ? override.vat_rate : suggestion.vat_rate, confidence: 1, reason: 'LEARNED_RULE' as const, needs_review: false, notes: [...suggestion.notes, 'Set by a reviewer correction.'] };
  });
  const adjusted = applyAccountingAdjustments(transactions, overridden, {
    company_name: companyName,
    base_currency: currencyInput,
    opening_balance_cents: openingBalance,
    closing_balance_cents: closingBalance,
    period: { start: periodStart, end: periodEnd }
  });
  const suggestions = adjusted.suggestions;
  const pack = buildReviewPack({
    company: { name: companyName, jurisdiction: jurisdictionInput, vat_registered: vatRegistered },
    period: { start: periodStart, end: periodEnd },
    transactions,
    suggestions,
    document_links: extras.document_links,
    accounting_findings: adjusted.findings,
    unreconciled_transaction_ids: extras.ledger_lines ? unreconciledIds(transactions, extras.ledger_lines) : undefined,
    base_currency: currencyInput,
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
