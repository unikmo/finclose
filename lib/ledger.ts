// The common shape every accounting-system adapter fills in. FinClose only ever READS a ledger
// into this shape; the review in ledger-review.ts turns it into proposals. Nothing in here writes
// to a client's books. Money is integer cents; dates are YYYY-MM-DD.

export type LedgerProviderId = 'smartaccounts' | 'xero' | 'quickbooks' | 'freshbooks' | 'zohobooks';

export type LedgerAccount = {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'OTHER';
};

export type LedgerVatCode = {
  code: string;
  rate_percent: number;
  active_for_purchases: boolean;
  active_for_sales: boolean;
};

export type LedgerBankAccount = { name: string; ledger_account: string; currency: string; iban: string };

export type LedgerInvoiceRow = { description: string; vat_code: string; net_cents: number | null; vat_cents: number | null; account: string };

export type LedgerInvoice = {
  id: string;
  side: 'PURCHASE' | 'SALES';
  number: string; // the supplier's / our own invoice number
  partner_name: string;
  partner_reg_code: string;
  partner_vat_number: string;
  date: string;
  due_date: string;
  currency: string;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  outstanding_cents: number;
  credit_note: boolean;
  reverse_charge: 'NONE' | 'NATIONAL' | 'UNION' | 'OTHER';
  has_document: boolean | null; // null = the system did not tell us
  rows: LedgerInvoiceRow[];
};

export type LedgerPayment = {
  id: string;
  date: string;
  account_kind: 'BANK' | 'CASH';
  account_name: string;
  partner_name: string;
  partner_side: 'CLIENT' | 'VENDOR';
  currency: string;
  amount_cents: number;
  applied_cents: number; // part matched to invoices, VAT returns, salary or prepayments
};

export type LedgerEntryRow = { account: string; description: string; debit_cents: number; credit_cents: number };

export type LedgerEntry = {
  id: string;
  doc_type: string; // LEDGER_ENTRY, CLIENT_INVOICE, BANK_PAYMENT ...
  date: string;
  number: string;
  document_ref: string;
  rows: LedgerEntryRow[];
  has_document: boolean | null;
};

export type LedgerSnapshot = {
  provider: LedgerProviderId;
  country: string; // two-letter code used to pick VAT rules
  period: { from: string; to: string };
  fetched_at: number;
  accounts: LedgerAccount[];
  vat_codes: LedgerVatCode[];
  bank_accounts: LedgerBankAccount[];
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
  entries: LedgerEntry[];
  account_balances: { account: string; balance_cents: number }[] | null;
  requests_used: number;
  // Anything that makes this snapshot possibly incomplete. A non-empty list stops the review from
  // saying "no findings": the reader is told what was not seen.
  gaps: string[];
};

export interface LedgerSource {
  readonly provider: LedgerProviderId;
  snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot>;
}

// ---- parsing helpers shared by the adapters -----------------------------------------------------

// Decimal text or number -> integer cents without floating-point drift. Null when it is not a number.
export function toCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().replace(/\s/g, '');
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = (match[3] || '').padEnd(3, '0');
  let cents = Number(match[2]) * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents += 1;
  return match[1] === '-' ? -cents : cents;
}

// dd.MM.yyyy (SmartAccounts) or ISO (yyyy-MM-dd, with or without time) -> YYYY-MM-DD, or '' if unreadable.
export function toIsoDay(value: unknown): string {
  const text = String(value ?? '').trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (hit) { d = Number(hit[1]); m = Number(hit[2]); y = Number(hit[3]); }
  else {
    hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!hit) return '';
    y = Number(hit[1]); m = Number(hit[2]); d = Number(hit[3]);
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
