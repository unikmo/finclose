import type { NormalisedBankTransaction } from './statement-intake';
import { merchantKey, type CategorySuggestion } from './categorisation-engine';

// Accounting-core checks that run between categorisation and the review pack.
// Pure functions. They never delete or post anything: they re-label suggestions
// (own-account transfers, refunds) and raise findings the pack turns into
// exceptions. Where the evidence is weak they ask instead of deciding.

export type AccountingFindingCode =
  | 'TRANSFER_UNMATCHED' // labelled as an own-account transfer but no other leg is in this upload
  | 'POSSIBLE_TRANSFER' // equal and opposite amounts a few days apart, no sign they are the same owner
  | 'REFUND_UNMATCHED' // refund or reversal wording with no earlier payment to net against
  | 'BALANCE_MISMATCH' // opening balance plus movements does not equal closing balance
  | 'FX_REVIEW'; // not in the company's base currency; no conversion was done

export type AccountingFinding = {
  code: AccountingFindingCode;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  transaction_ids: string[];
  message: string;
  suggested_action: string;
};

export type AccountingContext = {
  company_name: string;
  base_currency: string;
  opening_balance_cents?: number | null;
  closing_balance_cents?: number | null;
  period: { start: string; end: string };
};

const TRANSFER_WINDOW_DAYS = 3;
const REFUND_WINDOW_DAYS = 120;
const REFUND_WORDS = ['refund', 'reversal', 'reversed', 'chargeback', 'storno', 'tagastus', 'tagasimakse', 'erstattung', 'rückerstattung', 'ruckerstattung', 'return of'];

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function textOf(tx: NormalisedBankTransaction): string {
  return `${tx.counterparty} ${tx.description}`.toLowerCase();
}

function companyTokens(name: string): string[] {
  const legalForms = new Set(['oü', 'ou', 'as', 'llc', 'ltd', 'limited', 'inc', 'gmbh', 'ug', 'sia', 'uab', 'oy', 'ab', 'co', 'corp', 'the', 'and']);
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 3 && !legalForms.has(token));
}

function namesTheCompany(tx: NormalisedBankTransaction, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const text = textOf(tx);
  return tokens.every(token => text.includes(token));
}

export type AdjustmentResult = {
  suggestions: CategorySuggestion[];
  findings: AccountingFinding[];
  transfer_pairs: { out_id: string; in_id: string }[];
  refund_matches: { refund_id: string; original_id: string }[];
};

function asTransfer(suggestion: CategorySuggestion, note: string): CategorySuggestion {
  return {
    ...suggestion,
    category_code: 'TRANSFER',
    category_name: 'Transfer between own accounts',
    vat_treatment: 'OUT_OF_SCOPE',
    vat_rate: null,
    confidence: 0.9,
    evidence_required: false,
    needs_review: false,
    notes: [...suggestion.notes.filter(n => n !== note), note]
  };
}

export function applyAccountingAdjustments(
  transactions: NormalisedBankTransaction[],
  suggestions: CategorySuggestion[],
  context: AccountingContext
): AdjustmentResult {
  const byId = new Map(suggestions.map(s => [s.transaction_id, { ...s }]));
  const findings: AccountingFinding[] = [];
  const tokens = companyTokens(context.company_name);
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.transaction_id.localeCompare(b.transaction_id));

  // Rows in another currency are never netted or summed with the base currency.
  const sameCurrency = (a: NormalisedBankTransaction, b: NormalisedBankTransaction) => a.currency === b.currency;

  // 1. Own-account transfers: equal and opposite, a few days apart, with a sign it is the same owner.
  const used = new Set<string>();
  const transferPairs: { out_id: string; in_id: string }[] = [];
  const isHinted = (tx: NormalisedBankTransaction) => byId.get(tx.transaction_id)?.category_code === 'TRANSFER' || namesTheCompany(tx, tokens);
  for (const out of sorted) {
    if (out.amount_cents >= 0 || used.has(out.transaction_id)) continue;
    let best: NormalisedBankTransaction | null = null;
    let bestGap = Infinity;
    for (const incoming of sorted) {
      if (incoming.amount_cents !== -out.amount_cents || used.has(incoming.transaction_id) || !sameCurrency(out, incoming)) continue;
      const gap = Math.abs(dayNumber(incoming.date) - dayNumber(out.date));
      if (gap <= TRANSFER_WINDOW_DAYS && gap < bestGap) { best = incoming; bestGap = gap; }
    }
    if (!best) continue;
    if (isHinted(out) || isHinted(best)) {
      used.add(out.transaction_id);
      used.add(best.transaction_id);
      transferPairs.push({ out_id: out.transaction_id, in_id: best.transaction_id });
      const note = 'Matched with an equal and opposite movement in this upload: treated as a transfer, not income or expense.';
      for (const id of [out.transaction_id, best.transaction_id]) {
        const current = byId.get(id);
        if (current) byId.set(id, asTransfer(current, note));
      }
    }
  }

  // Transfers with no other leg: the second statement is probably missing.
  for (const tx of sorted) {
    const suggestion = byId.get(tx.transaction_id);
    if (suggestion?.category_code === 'TRANSFER' && !used.has(tx.transaction_id) && tx.date >= context.period.start && tx.date <= context.period.end) {
      findings.push({
        code: 'TRANSFER_UNMATCHED',
        severity: 'MEDIUM',
        transaction_ids: [tx.transaction_id],
        message: 'Looks like a transfer between own accounts, but the other side is not in this upload.',
        suggested_action: 'Upload the statement for the other account, or confirm where the money went.'
      });
    }
  }

  // 2. Refunds and reversals: net against the earlier payment from the same merchant.
  const refundMatches: { refund_id: string; original_id: string }[] = [];
  const refunded = new Set<string>();
  for (const tx of sorted) {
    if (tx.amount_cents <= 0 || used.has(tx.transaction_id)) continue;
    const text = textOf(tx);
    const wording = REFUND_WORDS.some(word => text.includes(word));
    const key = merchantKey(tx);
    let original: NormalisedBankTransaction | null = null;
    if (key) {
      for (const earlier of sorted) {
        if (earlier.amount_cents >= 0 || refunded.has(earlier.transaction_id) || used.has(earlier.transaction_id) || !sameCurrency(earlier, tx)) continue;
        if (earlier.date > tx.date || dayNumber(tx.date) - dayNumber(earlier.date) > REFUND_WINDOW_DAYS) continue;
        if (merchantKey(earlier) !== key || -earlier.amount_cents < tx.amount_cents) continue;
        // Prefer an exact amount, then the most recent payment.
        if (!original || (-earlier.amount_cents === tx.amount_cents && -original.amount_cents !== tx.amount_cents) || (-earlier.amount_cents === tx.amount_cents && earlier.date > original.date)) original = earlier;
      }
    }
    const current = byId.get(tx.transaction_id);
    const originalSuggestion = original ? byId.get(original.transaction_id) : undefined;
    if (original && originalSuggestion && current && (wording || -original.amount_cents === tx.amount_cents)) {
      refunded.add(original.transaction_id);
      refundMatches.push({ refund_id: tx.transaction_id, original_id: original.transaction_id });
      byId.set(tx.transaction_id, {
        ...current,
        category_code: originalSuggestion.category_code,
        category_name: originalSuggestion.category_name,
        vat_treatment: originalSuggestion.vat_treatment,
        vat_rate: originalSuggestion.vat_rate,
        confidence: Math.min(0.85, originalSuggestion.confidence),
        evidence_required: false,
        needs_review: originalSuggestion.needs_review,
        notes: [...current.notes, `Refund of the ${original.date} payment: reduces ${originalSuggestion.category_name}, not income. VAT may need a credit note.`]
      });
    } else if (wording && current) {
      findings.push({
        code: 'REFUND_UNMATCHED',
        severity: 'MEDIUM',
        transaction_ids: [tx.transaction_id],
        message: 'Described as a refund or reversal, but no earlier payment from the same merchant was found to net it against.',
        suggested_action: 'Ask the owner which payment this refunds, or upload the earlier statement.'
      });
    }
  }

  // 3. Equal and opposite movements nobody explained: ask, do not assume.
  for (const out of sorted) {
    if (out.amount_cents >= 0 || used.has(out.transaction_id) || refunded.has(out.transaction_id)) continue;
    if (refundMatches.some(match => match.original_id === out.transaction_id)) continue;
    const mate = sorted.find(incoming => incoming.amount_cents === -out.amount_cents && !used.has(incoming.transaction_id) && sameCurrency(out, incoming)
      && Math.abs(dayNumber(incoming.date) - dayNumber(out.date)) <= TRANSFER_WINDOW_DAYS
      && !refundMatches.some(match => match.refund_id === incoming.transaction_id));
    if (mate) {
      findings.push({
        code: 'POSSIBLE_TRANSFER',
        severity: 'LOW',
        transaction_ids: [out.transaction_id, mate.transaction_id],
        message: 'An equal payment out and receipt in within a few days. This may be a transfer between accounts, a returned payment, or a coincidence.',
        suggested_action: 'Confirm what it was. If it is your own money moving between accounts, mark both as transfers.'
      });
    }
  }

  // 4. Currencies: totals are never mixed, and nothing is converted here.
  for (const tx of sorted) {
    if (tx.currency !== context.base_currency && tx.date >= context.period.start && tx.date <= context.period.end) {
      findings.push({
        code: 'FX_REVIEW',
        severity: 'MEDIUM',
        transaction_ids: [tx.transaction_id],
        message: `Amount is in ${tx.currency}, the company reports in ${context.base_currency}. No conversion was applied and it is left out of the totals.`,
        suggested_action: 'Convert at the rate for the transaction date and record the rate used.'
      });
    }
  }

  // 5. Balance continuity: only checkable when both balances were provided.
  const balance = checkBalanceContinuity(transactions, context);
  if (balance) findings.push(balance);

  return {
    suggestions: suggestions.map(s => byId.get(s.transaction_id) || s),
    findings,
    transfer_pairs: transferPairs,
    refund_matches: refundMatches
  };
}

export function checkBalanceContinuity(transactions: NormalisedBankTransaction[], context: Pick<AccountingContext, 'opening_balance_cents' | 'closing_balance_cents' | 'period' | 'base_currency'>): AccountingFinding | null {
  const { opening_balance_cents: opening, closing_balance_cents: closing } = context;
  if (typeof opening !== 'number' || typeof closing !== 'number') return null;
  const movement = transactions
    .filter(tx => tx.currency === context.base_currency && tx.date >= context.period.start && tx.date <= context.period.end)
    .reduce((sum, tx) => sum + tx.amount_cents, 0);
  const expected = opening + movement;
  if (expected === closing) return null;
  const diff = closing - expected;
  return {
    code: 'BALANCE_MISMATCH',
    severity: 'HIGH',
    transaction_ids: [],
    message: `Opening balance plus the movements in this upload gives ${expected} cents, but the stated closing balance is ${closing} cents (difference ${diff} cents). Rows may be missing or duplicated.`,
    suggested_action: 'Check the export covers every day of the period and no row is missing before relying on this pack.'
  };
}
