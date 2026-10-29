import { buildRulePack, categoriseTransaction, merchantKey, AUTO_ACCEPT_THRESHOLD, type RulePack } from './categorisation-engine';
import { parseBankStatementCsv, parseCsv, type NormalisedBankTransaction } from './statement-intake';

// Scores the rule pack against a statement that a person has already labelled. The labelled file
// is a normal bank CSV with one extra column, expected_category, holding a category code from the
// rule pack. Nothing here decides what is correct: it only measures how far the rules are from the
// labels, so an accountant's labelled statements can be turned into numbers.
//
// "Auto-accept precision" is the figure that matters for trust: of the rows the engine would have
// accepted without a human (confidence at or above the threshold), how many carried the right category.

export type AccuracyRow = { tx: NormalisedBankTransaction; expected: string };

export type CategoryScore = { category: string; expected: number; predicted: number; correct: number; precision: number | null; recall: number | null };

export type AccuracyReport = {
  rows: number;
  unlabelled_rows: number;
  correct: number;
  accuracy: number | null;
  auto_accepted: number;
  auto_accept_correct: number;
  auto_accept_precision: number | null;
  suspense: number;
  suspense_rate: number | null;
  per_category: CategoryScore[];
  misses: { transaction_id: string; source_row: number; merchant_key: string; counterparty: string; expected: string; got: string; rule_id: string | null; confidence: number }[];
  unmatched_merchants: { merchant_key: string; count: number; expected: string[] }[];
  warnings: string[];
};

const ratio = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 10_000) / 10_000);

export function parseLabelledCsv(text: string): { rows: AccuracyRow[]; unlabelled: number; warnings: string[] } {
  const intake = parseBankStatementCsv(text);
  const grid = parseCsv(text, intake.detected.delimiter);
  const header = (grid.rows[0] || []).map(h => h.trim().toLowerCase());
  const labelColumn = header.indexOf('expected_category');
  if (labelColumn < 0) throw new Error('the file needs an expected_category column');
  const labelByLine = new Map<number, string>();
  grid.rows.forEach((cells, i) => {
    if (i > 0) labelByLine.set(grid.line_numbers[i], (cells[labelColumn] || '').trim().toUpperCase());
  });
  const rows: AccuracyRow[] = [];
  let unlabelled = 0;
  for (const tx of intake.transactions) {
    const expected = labelByLine.get(tx.source_row) || '';
    if (!expected) unlabelled += 1;
    else rows.push({ tx, expected });
  }
  const warnings = intake.rejected.length ? [`${intake.rejected.length} row(s) could not be read by statement intake and are not scored.`] : [];
  return { rows, unlabelled, warnings };
}

export function scoreRules(rows: AccuracyRow[], pack: RulePack, options: { threshold?: number; unlabelled?: number; warnings?: string[] } = {}): AccuracyReport {
  const threshold = options.threshold ?? AUTO_ACCEPT_THRESHOLD;
  const known = new Set(pack.categories.map(c => c.code));
  const warnings = [...(options.warnings || [])];
  const unknownLabels = new Set(rows.map(r => r.expected).filter(code => !known.has(code)));
  if (unknownLabels.size) warnings.push(`Labels not in the rule pack's categories (always counted wrong): ${[...unknownLabels].join(', ')}`);

  let correct = 0;
  let autoAccepted = 0;
  let autoCorrect = 0;
  let suspense = 0;
  const perExpected = new Map<string, { expected: number; predicted: number; correct: number }>();
  const slot = (code: string) => perExpected.get(code) || perExpected.set(code, { expected: 0, predicted: 0, correct: 0 }).get(code)!;
  const misses: AccuracyReport['misses'] = [];
  const unmatched = new Map<string, { count: number; expected: Set<string> }>();

  for (const { tx, expected } of rows) {
    const s = categoriseTransaction(tx, pack);
    const hit = s.category_code === expected;
    slot(expected).expected += 1;
    slot(s.category_code).predicted += 1;
    if (hit) {
      correct += 1;
      slot(expected).correct += 1;
    } else {
      misses.push({ transaction_id: tx.transaction_id, source_row: tx.source_row, merchant_key: merchantKey(tx), counterparty: tx.counterparty, expected, got: s.category_code, rule_id: s.rule_id, confidence: s.confidence });
    }
    if (s.confidence >= threshold && !s.needs_review) {
      autoAccepted += 1;
      if (hit) autoCorrect += 1;
    }
    if (s.reason === 'FALLBACK_SUSPENSE') {
      suspense += 1;
      const key = merchantKey(tx) || '(no name)';
      const u = unmatched.get(key) || { count: 0, expected: new Set<string>() };
      u.count += 1;
      u.expected.add(expected);
      unmatched.set(key, u);
    }
  }

  const per_category = [...perExpected.entries()]
    .map(([category, v]) => ({ category, ...v, precision: ratio(v.correct, v.predicted), recall: ratio(v.correct, v.expected) }))
    .sort((a, b) => b.expected - a.expected || a.category.localeCompare(b.category));

  return {
    rows: rows.length,
    unlabelled_rows: options.unlabelled ?? 0,
    correct,
    accuracy: ratio(correct, rows.length),
    auto_accepted: autoAccepted,
    auto_accept_correct: autoCorrect,
    auto_accept_precision: ratio(autoCorrect, autoAccepted),
    suspense,
    suspense_rate: ratio(suspense, rows.length),
    per_category,
    misses: misses.sort((a, b) => b.confidence - a.confidence).slice(0, 200),
    unmatched_merchants: [...unmatched.entries()].map(([merchant_key, v]) => ({ merchant_key, count: v.count, expected: [...v.expected].sort() })).sort((a, b) => b.count - a.count).slice(0, 50),
    warnings
  };
}

export function scoreLabelledCsv(text: string, jurisdiction: 'EE' | 'GENERIC' = 'EE'): AccuracyReport {
  const parsed = parseLabelledCsv(text);
  return scoreRules(parsed.rows, buildRulePack(jurisdiction), { unlabelled: parsed.unlabelled, warnings: parsed.warnings });
}

export function renderAccuracyReport(r: AccuracyReport): string {
  const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
  const lines = [
    `Rows scored: ${r.rows} (unlabelled, skipped: ${r.unlabelled_rows})`,
    `Accuracy: ${pct(r.accuracy)} (${r.correct}/${r.rows})`,
    `Auto-accept precision: ${pct(r.auto_accept_precision)} (${r.auto_accept_correct}/${r.auto_accepted} rows the engine would accept without a human)`,
    `Fell to suspense: ${pct(r.suspense_rate)} (${r.suspense})`,
    '',
    'By expected category:',
    ...r.per_category.map(c => `  ${c.category.padEnd(18)} expected ${String(c.expected).padStart(4)}  precision ${pct(c.precision).padStart(6)}  recall ${pct(c.recall).padStart(6)}`),
    '',
    'Most common unmatched merchants (candidates for new rules):',
    ...r.unmatched_merchants.slice(0, 15).map(u => `  ${String(u.count).padStart(3)} x ${u.merchant_key}  -> ${u.expected.join('/')}`)
  ];
  if (r.warnings.length) lines.push('', 'Warnings:', ...r.warnings.map(w => `  ${w}`));
  return lines.join('\n') + '\n';
}
