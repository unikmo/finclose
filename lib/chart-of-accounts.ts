import type { ProposedEntry, ReviewPack } from './review-pack';

// Maps each category to an account and turns a review pack into PROPOSED journal
// lines for the accountant. The numbering below is FinClose's own default, NOT a
// statutory chart: Estonia has no mandatory chart of accounts, and every firm
// maps to its own. An accountant can replace the map per company before use.
// Nothing here posts anywhere.

export type Account = { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' };
export type AccountMap = {
  id: string;
  jurisdiction: string;
  status: 'FINCLOSE_DEFAULT_NOT_STATUTORY';
  bank: Account;
  vat_input: Account;
  vat_output: Account;
  suspense: Account;
  by_category: Record<string, Account>;
};

const A = (code: string, name: string, type: Account['type']): Account => ({ code, name, type });

const SHARED: Record<string, Account> = {
  REVENUE: A('4000', 'Sales', 'INCOME'),
  REVENUE_PAYOUT: A('1210', 'Payment processor clearing', 'ASSET'),
  SOFTWARE: A('6100', 'Software and subscriptions', 'EXPENSE'),
  CLOUD: A('6110', 'Hosting and cloud services', 'EXPENSE'),
  ADVERTISING: A('6200', 'Advertising and marketing', 'EXPENSE'),
  BANK_FEES: A('6900', 'Bank and payment fees', 'EXPENSE'),
  TELECOM: A('6120', 'Phone and internet', 'EXPENSE'),
  TRAVEL: A('6300', 'Travel and transport', 'EXPENSE'),
  MEALS: A('6310', 'Meals and entertainment', 'EXPENSE'),
  RENT: A('6400', 'Rent and workspace', 'EXPENSE'),
  PROFESSIONAL_FEES: A('6500', 'Accounting, legal and professional fees', 'EXPENSE'),
  OFFICE_SUPPLIES: A('6130', 'Office supplies and equipment', 'EXPENSE'),
  INSURANCE: A('6600', 'Insurance', 'EXPENSE'),
  PAYROLL: A('5000', 'Salaries and payroll', 'EXPENSE'),
  TAXES_AND_DUTIES: A('2300', 'Taxes and duties', 'LIABILITY'),
  DIVIDENDS: A('3200', 'Dividends and owner distributions', 'EQUITY'),
  OWNER_FUNDING: A('3000', 'Share capital and owner funding', 'EQUITY'),
  LOAN: A('2500', 'Loans', 'LIABILITY'),
  TRANSFER: A('1010', 'Transfers between own accounts', 'ASSET'),
  SUSPENSE_IN: A('9990', 'Suspense: unclassified receipts', 'LIABILITY'),
  SUSPENSE_OUT: A('9991', 'Suspense: unclassified payments', 'ASSET')
};

export function buildAccountMap(jurisdiction: string): AccountMap {
  const ee = String(jurisdiction).toUpperCase() === 'EE';
  return {
    id: ee ? 'accounts-ee-default-v0' : 'accounts-generic-default-v0',
    jurisdiction: ee ? 'EE' : 'GENERIC',
    status: 'FINCLOSE_DEFAULT_NOT_STATUTORY',
    bank: A('1000', 'Bank', 'ASSET'),
    vat_input: A('1300', 'Input VAT receivable', 'ASSET'),
    vat_output: A('2200', 'Output VAT payable', 'LIABILITY'),
    suspense: SHARED.SUSPENSE_OUT,
    by_category: SHARED
  };
}

export type JournalLine = {
  transaction_id: string;
  date: string;
  account_code: string;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  memo: string;
};

export type JournalView = {
  status: 'PROPOSED_NOT_POSTED';
  account_map: string;
  lines: JournalLine[];
  account_totals: { account_code: string; account_name: string; debit_cents: number; credit_cents: number }[];
  skipped: { transaction_id: string; reason: string }[];
  balanced: boolean;
  notice: string;
};

function line(entry: ProposedEntry, account: Account, debit: number, credit: number, memo: string): JournalLine {
  return { transaction_id: entry.transaction_id, date: entry.date, account_code: account.code, account_name: account.name, debit_cents: debit, credit_cents: credit, memo };
}

// Input VAT is split out only for a VAT-registered company with a domestic rate
// AND a supporting document. Otherwise the gross amount stays in the expense.
export function buildJournal(pack: ReviewPack, map: AccountMap = buildAccountMap(pack.company.jurisdiction)): JournalView {
  const lines: JournalLine[] = [];
  const skipped: JournalView['skipped'] = [];
  for (const e of pack.entries) {
    if (e.currency !== pack.summary.base_currency) {
      skipped.push({ transaction_id: e.transaction_id, reason: 'foreign currency: not converted' });
      continue;
    }
    if (e.category_code === 'TRANSFER') {
      skipped.push({ transaction_id: e.transaction_id, reason: 'own-account transfer: no net effect' });
      continue;
    }
    const account = map.by_category[e.category_code] || map.suspense;
    const gross = Math.abs(e.amount_cents);
    const memo = `${e.counterparty || e.description}`.slice(0, 80);
    if (e.amount_cents < 0) {
      const splitVat = pack.company.vat_registered && e.vat_treatment === 'INPUT_VAT_DOMESTIC' && e.vat_rate && e.document_ids.length > 0;
      const vat = splitVat ? Math.round((gross * e.vat_rate!) / (100 + e.vat_rate!)) : 0;
      lines.push(line(e, account, gross - vat, 0, memo));
      if (vat) lines.push(line(e, map.vat_input, vat, 0, `${memo} (input VAT ${e.vat_rate}%)`));
      lines.push(line(e, map.bank, 0, gross, memo));
    } else {
      lines.push(line(e, map.bank, gross, 0, memo));
      lines.push(line(e, account, 0, gross, memo));
    }
  }
  const totals = new Map<string, { account_code: string; account_name: string; debit_cents: number; credit_cents: number }>();
  for (const l of lines) {
    const t = totals.get(l.account_code) || { account_code: l.account_code, account_name: l.account_name, debit_cents: 0, credit_cents: 0 };
    t.debit_cents += l.debit_cents;
    t.credit_cents += l.credit_cents;
    totals.set(l.account_code, t);
  }
  const debit = lines.reduce((s, l) => s + l.debit_cents, 0);
  const credit = lines.reduce((s, l) => s + l.credit_cents, 0);
  return {
    status: 'PROPOSED_NOT_POSTED',
    account_map: map.id,
    lines,
    account_totals: [...totals.values()].sort((a, b) => a.account_code.localeCompare(b.account_code)),
    skipped,
    balanced: debit === credit,
    notice: 'Proposed lines for accountant review using FinClose default account numbers. Not a statutory chart, not posted anywhere.'
  };
}

// Cells that start with a formula character are prefixed with an apostrophe so a spreadsheet never runs them.
export function journalCsv(view: JournalView): string {
  const cell = (v: string | number) => {
    const text = String(v).replace(/"/g, '""');
    return `"${/^[=+\-@\t\r]/.test(text) ? "'" + text : text}"`;
  };
  const money = (c: number) => (c ? (c / 100).toFixed(2) : '');
  const rows = [['date', 'transaction_id', 'account_code', 'account_name', 'debit', 'credit', 'memo'].map(cell).join(',')];
  for (const l of view.lines) rows.push([l.date, l.transaction_id, l.account_code, l.account_name, money(l.debit_cents), money(l.credit_cents), l.memo].map(cell).join(','));
  return rows.join('\n') + '\n';
}
