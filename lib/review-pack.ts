import crypto from 'node:crypto';
import type { NormalisedBankTransaction } from './statement-intake';
import type { CategorySuggestion } from './categorisation-engine';

// Accountant review pack: turns normalised transactions plus categorisation
// suggestions into one document an accountant can review quickly. It lists what
// is prepared, what is not, and the questions the owner still has to answer.
// It never posts anything and never approves anything: status is always
// PREPARED_NOT_APPROVED, matching the bookkeeping engine's convention.

export type ExceptionCode =
  | 'UNCATEGORISED'
  | 'LOW_CONFIDENCE'
  | 'POSSIBLE_DUPLICATE'
  | 'MISSING_DOCUMENT'
  | 'OUTSIDE_PERIOD'
  | 'VAT_REVIEW'
  | 'JUDGEMENT_REQUIRED'
  | 'UNRECONCILED';

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export type ReviewException = {
  code: ExceptionCode;
  severity: Severity;
  transaction_id: string | null;
  message: string;
  suggested_action: string;
  evidence: { date: string; amount_cents: number; currency: string; counterparty: string; description: string } | null;
};

export type ReviewPackInput = {
  company: { name: string; jurisdiction: string; vat_registered: boolean };
  period: { start: string; end: string };
  transactions: NormalisedBankTransaction[];
  suggestions: CategorySuggestion[];
  document_links?: Record<string, string[]>; // transaction_id -> document ids the owner uploaded
  unreconciled_transaction_ids?: string[]; // from the ledger reconciliation, if one was run
  high_value_cents?: number; // missing-document severity threshold; default 50000 (500.00)
  generated_at?: number; // injected so output is reproducible
};

export type ProposedEntry = {
  transaction_id: string;
  date: string;
  amount_cents: number;
  currency: string;
  counterparty: string;
  description: string;
  category_code: string;
  category_name: string;
  vat_treatment: string;
  vat_rate: number | null;
  confidence: number;
  status: 'PROPOSED' | 'NEEDS_REVIEW';
  document_ids: string[];
};

export type OwnerQuestion = { transaction_id: string; question: string };

export type ReviewPack = {
  pack_version: 1;
  status: 'PREPARED_NOT_APPROVED';
  posting: 'NO_EXTERNAL_POSTING';
  generated_at: number;
  company: ReviewPackInput['company'];
  period: ReviewPackInput['period'];
  summary: {
    transaction_count: number;
    inflow_cents: number;
    outflow_cents: number;
    proposed_count: number;
    needs_review_count: number;
    clean_count: number;
    readiness_percent: number;
    readiness_definition: string;
    accountant_ready: boolean;
    accountant_ready_rule: string;
    exception_counts: Record<string, number>;
  };
  category_totals: { category_code: string; category_name: string; count: number; total_cents: number }[];
  entries: ProposedEntry[];
  exceptions: ReviewException[];
  owner_questions: OwnerQuestion[];
  pack_hash: string;
  limitations: string[];
};

const READINESS_DEFINITION = 'Share of in-period transactions with a confident category, no duplicate flag, no VAT query, a document where one is needed, and (if reconciled) a ledger match.';
const READY_RULE = 'Readiness of at least 90% and no HIGH exceptions.';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function formatCents(cents: number, currency = ''): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `${sign}${whole}.${String(abs % 100).padStart(2, '0')}`;
  return currency ? `${text} ${currency}` : text;
}

function evidenceOf(tx: NormalisedBankTransaction): ReviewException['evidence'] {
  return { date: tx.date, amount_cents: tx.amount_cents, currency: tx.currency, counterparty: tx.counterparty, description: tx.description };
}

export function buildReviewPack(input: ReviewPackInput): ReviewPack {
  const highValue = input.high_value_cents ?? 50000;
  const documents = input.document_links || {};
  const unreconciled = new Set(input.unreconciled_transaction_ids || []);
  const suggestionById = new Map(input.suggestions.map(suggestion => [suggestion.transaction_id, suggestion]));
  const exceptions: ReviewException[] = [];
  const ownerQuestions: OwnerQuestion[] = [];
  const entries: ProposedEntry[] = [];
  let inflow = 0;
  let outflow = 0;
  let inPeriod = 0;

  const add = (tx: NormalisedBankTransaction, code: ExceptionCode, severity: Severity, message: string, action: string) => {
    exceptions.push({ code, severity, transaction_id: tx.transaction_id, message, suggested_action: action, evidence: evidenceOf(tx) });
  };

  for (const tx of input.transactions) {
    const suggestion = suggestionById.get(tx.transaction_id);
    const inPeriodTx = tx.date >= input.period.start && tx.date <= input.period.end;
    if (!inPeriodTx) {
      add(tx, 'OUTSIDE_PERIOD', 'MEDIUM', `Dated ${tx.date}, outside ${input.period.start} to ${input.period.end}.`, 'Confirm which period it belongs to, or drop it from this pack.');
      continue;
    }
    inPeriod += 1;
    if (tx.amount_cents >= 0) inflow += tx.amount_cents; else outflow += -tx.amount_cents;
    const docs = documents[tx.transaction_id] || [];
    const amountText = formatCents(tx.amount_cents, tx.currency);
    const who = tx.counterparty || tx.description || 'unknown';

    if (!suggestion) {
      add(tx, 'UNCATEGORISED', 'HIGH', `${amountText} to/from ${who} was not processed by the categoriser.`, 'Categorise manually.');
      continue;
    }

    const isSuspense = suggestion.category_code.startsWith('SUSPENSE');
    if (isSuspense) {
      add(tx, 'UNCATEGORISED', 'HIGH', `${amountText} to/from ${who} matched no rule.`, 'Ask the owner what this was, then categorise.');
      ownerQuestions.push({ transaction_id: tx.transaction_id, question: `What was the ${formatCents(Math.abs(tx.amount_cents), tx.currency)} ${tx.amount_cents < 0 ? 'payment to' : 'receipt from'} "${who}" on ${tx.date}? Please attach the invoice or receipt if there is one.` });
    } else if (suggestion.needs_review) {
      add(tx, 'LOW_CONFIDENCE', 'MEDIUM', `Suggested "${suggestion.category_name}" with ${Math.round(suggestion.confidence * 100)}% confidence (${suggestion.rule_id || 'no rule'}).`, 'Confirm or change the category.');
    }
    if (tx.possible_duplicate_of) {
      add(tx, 'POSSIBLE_DUPLICATE', 'MEDIUM', `Same date, amount and text as ${tx.possible_duplicate_of}.`, 'Confirm it is two real payments, not an export duplicate.');
      ownerQuestions.push({ transaction_id: tx.transaction_id, question: `Two identical ${tx.amount_cents < 0 ? 'payments' : 'receipts'} of ${formatCents(Math.abs(tx.amount_cents), tx.currency)} ${tx.amount_cents < 0 ? 'to' : 'from'} "${who}" appear on ${tx.date}. Were both real?` });
    }
    if (suggestion.evidence_required && tx.amount_cents < 0 && docs.length === 0) {
      const severity: Severity = Math.abs(tx.amount_cents) >= highValue ? 'HIGH' : 'LOW';
      add(tx, 'MISSING_DOCUMENT', severity, `No invoice or receipt for ${amountText} to ${who}.`, 'Request the document from the owner.');
      // Unknown items already ask for the document in their own question.
      if (!isSuspense) ownerQuestions.push({ transaction_id: tx.transaction_id, question: `Please upload the invoice or receipt for ${formatCents(Math.abs(tx.amount_cents), tx.currency)} paid to "${who}" on ${tx.date}.` });
    }
    if (suggestion.vat_treatment === 'NEEDS_INVOICE_REVIEW' && input.company.vat_registered) {
      add(tx, 'VAT_REVIEW', 'MEDIUM', `VAT treatment for ${amountText} (${suggestion.category_name}) cannot be decided from the bank line.`, 'Check the invoice for the VAT amount and the supplier or customer status.');
    } else if (suggestion.vat_treatment === 'REVERSE_CHARGE_FOREIGN_SERVICE') {
      add(tx, 'VAT_REVIEW', 'LOW', `Foreign service supplier: ${who}.`, 'Confirm reverse-charge reporting for this supplier.');
    }
    if (suggestion.category_code === 'DIVIDENDS') {
      add(tx, 'JUDGEMENT_REQUIRED', 'HIGH', `Owner distribution of ${amountText}.`, 'Check retained earnings and the tax due before accepting.');
    }
    if (unreconciled.has(tx.transaction_id)) {
      add(tx, 'UNRECONCILED', 'HIGH', `${amountText} has no matching ledger entry.`, 'Match to a ledger item or create the missing entry.');
    }

    entries.push({
      transaction_id: tx.transaction_id,
      date: tx.date,
      amount_cents: tx.amount_cents,
      currency: tx.currency,
      counterparty: tx.counterparty,
      description: tx.description,
      category_code: suggestion.category_code,
      category_name: suggestion.category_name,
      vat_treatment: suggestion.vat_treatment,
      vat_rate: suggestion.vat_rate,
      confidence: suggestion.confidence,
      status: suggestion.needs_review ? 'NEEDS_REVIEW' : 'PROPOSED',
      document_ids: docs
    });
  }

  // A reverse-charge note on its own does not make a transaction "unclean"; it is a
  // confirm-once item. Everything else does.
  const unclean = new Set<string>();
  for (const exception of exceptions) {
    if (!exception.transaction_id) continue;
    if (exception.code === 'VAT_REVIEW' && exception.severity === 'LOW') continue;
    if (exception.code === 'OUTSIDE_PERIOD') continue;
    unclean.add(exception.transaction_id);
  }
  const cleanCount = inPeriod - unclean.size; // out-of-period rows never enter `unclean`
  const readiness = inPeriod === 0 ? 0 : Math.round((100 * Math.max(0, cleanCount)) / inPeriod);

  const severityRank: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  exceptions.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.evidence?.date || '').localeCompare(b.evidence?.date || '') || a.code.localeCompare(b.code));
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.transaction_id.localeCompare(b.transaction_id));

  const totals = new Map<string, { category_code: string; category_name: string; count: number; total_cents: number }>();
  for (const entry of entries) {
    const row = totals.get(entry.category_code) || { category_code: entry.category_code, category_name: entry.category_name, count: 0, total_cents: 0 };
    row.count += 1;
    row.total_cents += entry.amount_cents;
    totals.set(entry.category_code, row);
  }
  const exceptionCounts: Record<string, number> = {};
  for (const exception of exceptions) exceptionCounts[exception.code] = (exceptionCounts[exception.code] || 0) + 1;

  const hasHigh = exceptions.some(exception => exception.severity === 'HIGH');
  const body = {
    pack_version: 1 as const,
    status: 'PREPARED_NOT_APPROVED' as const,
    posting: 'NO_EXTERNAL_POSTING' as const,
    company: input.company,
    period: input.period,
    summary: {
      transaction_count: inPeriod,
      inflow_cents: inflow,
      outflow_cents: outflow,
      proposed_count: entries.filter(entry => entry.status === 'PROPOSED').length,
      needs_review_count: entries.filter(entry => entry.status === 'NEEDS_REVIEW').length,
      clean_count: Math.max(0, cleanCount),
      readiness_percent: readiness,
      readiness_definition: READINESS_DEFINITION,
      accountant_ready: readiness >= 90 && !hasHigh,
      accountant_ready_rule: READY_RULE,
      exception_counts: exceptionCounts
    },
    category_totals: [...totals.values()].sort((a, b) => a.category_code.localeCompare(b.category_code)),
    entries,
    exceptions,
    owner_questions: ownerQuestions,
    limitations: [
      'Built from bank-statement lines only. Invoices and receipts are matched by id, not read.',
      'Categories and VAT treatments are suggestions from draft rule packs that need tax review before customer use.',
      'No ledger or accounting system was changed. Nothing is approved or posted.'
    ]
  };
  return { ...body, generated_at: input.generated_at ?? Date.now(), pack_hash: crypto.createHash('sha256').update(canonicalJson(body)).digest('hex') };
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Bank-supplied text can start with = + - @ and run as a formula when the file is
// opened in a spreadsheet (CSV injection). Prefix such text with an apostrophe.
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// One row per proposed entry, for the accountant's spreadsheet or import tool.
export function renderEntriesCsv(pack: ReviewPack): string {
  const header = ['date', 'amount', 'currency', 'counterparty', 'description', 'category_code', 'category', 'vat_treatment', 'vat_rate_percent', 'confidence', 'status', 'document_ids', 'transaction_id'];
  const rows = pack.entries.map(entry => [
    entry.date, formatCents(entry.amount_cents).replace(/,/g, ''), entry.currency, safeText(entry.counterparty), safeText(entry.description),
    entry.category_code, entry.category_name, entry.vat_treatment, entry.vat_rate, entry.confidence, entry.status,
    entry.document_ids.join(' '), entry.transaction_id
  ].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n') + '\n';
}

export function renderReviewPackMarkdown(pack: ReviewPack): string {
  const s = pack.summary;
  const cur = pack.entries[0]?.currency || '';
  const lines: string[] = [];
  lines.push(`# Review pack: ${pack.company.name}`);
  lines.push('');
  lines.push(`Period ${pack.period.start} to ${pack.period.end}. Status: **${pack.status}** (${pack.posting}). Pack hash ${pack.pack_hash.slice(0, 16)}.`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Transactions in period: ${s.transaction_count}`);
  lines.push(`- Money in: ${formatCents(s.inflow_cents, cur)}. Money out: ${formatCents(s.outflow_cents, cur)}.`);
  lines.push(`- Proposed without review: ${s.proposed_count}. Needs your review: ${s.needs_review_count}.`);
  lines.push(`- Readiness: **${s.readiness_percent}%** (${s.accountant_ready ? 'ready for accountant review' : 'not ready yet'}).`);
  lines.push(`  - ${s.readiness_definition}`);
  lines.push(`  - Ready rule: ${s.accountant_ready_rule}`);
  lines.push('');
  lines.push('## Exceptions, most serious first');
  if (pack.exceptions.length === 0) lines.push('None.');
  for (const exception of pack.exceptions) {
    const where = exception.evidence ? ` (${exception.evidence.date}, ${formatCents(exception.evidence.amount_cents, exception.evidence.currency)}, ${exception.evidence.counterparty || exception.evidence.description})` : '';
    lines.push(`- **${exception.severity} ${exception.code}**${where}: ${exception.message} Action: ${exception.suggested_action}`);
  }
  lines.push('');
  lines.push('## Questions the owner still has to answer');
  if (pack.owner_questions.length === 0) lines.push('None.');
  for (const question of pack.owner_questions) lines.push(`- ${question.question}`);
  lines.push('');
  lines.push('## Totals by category');
  lines.push('| Category | Count | Total |');
  lines.push('|---|---|---|');
  for (const row of pack.category_totals) lines.push(`| ${row.category_name} | ${row.count} | ${formatCents(row.total_cents, cur)} |`);
  lines.push('');
  lines.push('## Limitations');
  for (const limitation of pack.limitations) lines.push(`- ${limitation}`);
  lines.push('');
  return lines.join('\n');
}
