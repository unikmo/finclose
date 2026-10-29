import type { NormalisedBankTransaction } from './statement-intake';

// Matches bank-statement rows against movements already posted in the ledger for
// the same bank account. A bank row is "unreconciled" when no ledger line has the
// same amount within a few days. One ledger line can clear only one bank row.

export type LedgerLine = { ledger_id: string; date: string; amount_cents: number; currency: string };

const MAX_DAYS_APART = 3;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function unreconciledIds(transactions: NormalisedBankTransaction[], ledger: LedgerLine[]): string[] {
  const used = new Set<string>();
  const missing: string[] = [];
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.transaction_id.localeCompare(b.transaction_id));
  for (const tx of ordered) {
    let best: LedgerLine | null = null;
    let bestGap = Infinity;
    for (const line of ledger) {
      if (used.has(line.ledger_id) || line.amount_cents !== tx.amount_cents || line.currency !== tx.currency) continue;
      const gap = Math.abs(dayNumber(line.date) - dayNumber(tx.date));
      if (gap <= MAX_DAYS_APART && gap < bestGap) {
        best = line;
        bestGap = gap;
      }
    }
    if (best) used.add(best.ledger_id);
    else missing.push(tx.transaction_id);
  }
  return missing;
}

export function ledgerOnlyLines(transactions: NormalisedBankTransaction[], ledger: LedgerLine[]): LedgerLine[] {
  const matchedBank = new Set(unreconciledIds(transactions, ledger));
  const bank = transactions.filter(tx => !matchedBank.has(tx.transaction_id));
  const remaining = [...ledger];
  for (const tx of bank) {
    const index = remaining.findIndex(l => l.amount_cents === tx.amount_cents && l.currency === tx.currency && Math.abs(dayNumber(l.date) - dayNumber(tx.date)) <= MAX_DAYS_APART);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining; // posted in the ledger, but not on the statement
}
