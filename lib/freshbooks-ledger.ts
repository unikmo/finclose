import { toCents, toIsoDay, type LedgerInvoice, type LedgerSnapshot, type LedgerSource } from './ledger';

// FreshBooks READ adapter: bills, invoices and expenses. GET requests only.
//
// Checked against FreshBooks' own pages (read 2026-10-31): the base URL, the accounting path
// /accounting/account/<accountId>/..., the bills, invoices and expenses endpoints, the bills scope
// name, and the field names of those objects (amount as {amount, code}, bill_number, issue_date,
// due_date, total_amount, tax_amount, outstanding, attachment, has_receipt, invoice_number ...).
//
// NOT checked: the names of the paging request parameters (the pages show the response carries
// page / pages / per_page / total but not how to ask for a page, so `page` and `per_page` are
// assumed); the response envelope (assumed response.result.<name>, with a fallback to the first
// array found); date filters (not documented, so the date range is applied here after reading);
// the chart of accounts, payments and journal entries (not read: journal entries need a different
// business id and have no date filter). Nothing has run against a real FreshBooks account.

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const BASE = 'https://api.freshbooks.com';
const PER_PAGE = 100;
const MAX_PAGES = 40;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
// FreshBooks money is {amount: "12.34", code: "USD"}; accept a bare number or string too.
const cents = (v: unknown): number | null => (v && typeof v === 'object' ? toCents((v as Record<string, unknown>).amount) : toCents(v));
const code = (v: unknown): string => (v && typeof v === 'object' ? str((v as Record<string, unknown>).code) : '');

function listOf(body: unknown, name: string): { rows: Record<string, unknown>[]; pages: number | null } {
  const result = obj(obj(body).response).result ?? obj(body).result ?? body;
  const record = obj(result);
  let rows: unknown = record[name];
  if (!Array.isArray(rows)) rows = Object.values(record).find(v => Array.isArray(v));
  const pages = Number(record.pages);
  return { rows: Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [], pages: Number.isFinite(pages) && pages > 0 ? pages : null };
}

export class FreshBooksLedgerSource implements LedgerSource {
  readonly provider = 'freshbooks' as const;
  private fetchFn: FetchLike;
  private auth: () => Promise<{ token: string; tenantId: string }>;
  private clock: () => number;
  used = 0;

  constructor(args: { fetchFn: FetchLike; auth: () => Promise<{ token: string; tenantId: string }>; clock?: () => number }) {
    this.fetchFn = args.fetchFn;
    this.auth = args.auth;
    this.clock = args.clock || Date.now;
  }

  private async all(path: string, name: string, gaps: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { token, tenantId } = await this.auth();
      this.used += 1;
      const joiner = path.includes('?') ? '&' : '?';
      const response = await this.fetchFn(`${BASE}/accounting/account/${encodeURIComponent(tenantId)}/${path}${joiner}page=${page}&per_page=${PER_PAGE}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) throw httpError(`FreshBooks would not let FinClose read ${name} (${response.status}). Reconnect and allow read access`, response.status);
      if (response.status === 429) throw httpError('FreshBooks asked FinClose to slow down (429)', 429);
      if (!response.ok) throw httpError(`FreshBooks answered ${response.status} for ${name}`, 502);
      const { rows, pages } = listOf(await response.json(), name);
      out.push(...rows);
      if (rows.length === 0 || (pages !== null ? page >= pages : rows.length < PER_PAGE)) return out;
    }
    gaps.push(`${name}: stopped after ${MAX_PAGES} pages, so later records were not read`);
    return out;
  }

  async snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot> {
    const gaps: string[] = [
      'Note: read from FreshBooks\'s documentation, with the paging parameters and response envelope assumed: no real FreshBooks account has been checked yet.',
      'Note: the chart of accounts, payments and journal entries were not read, so the entry-balance, VAT-code and unmatched-payment checks cannot run on this source.',
      'Note: the date range is applied after reading, because FreshBooks\' date filters are not documented.'
    ];
    const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await run(); } catch (e) {
        if ([401, 403].includes((e as { status?: number }).status || 0)) throw e;
        gaps.push(`${label}: not read (${(e as Error).message})`);
        return fallback;
      }
    };
    const inRange = (iso: string) => iso !== '' && iso >= period.from && iso <= period.to;

    const billRaw = await safe('bills', () => this.all('bills/bills?include[]=vendor', 'bills', gaps), []);
    const invoiceRaw = await safe('invoices', () => this.all('invoices/invoices', 'invoices', gaps), []);
    const expenseRaw = await safe('expenses', () => this.all('expenses/expenses', 'expenses', gaps), []);

    const invoices: LedgerInvoice[] = [];
    for (const b of billRaw) {
      const date = toIsoDay(b.issue_date);
      if (!inRange(date)) continue;
      const total = cents(b.total_amount ?? b.amount) ?? 0, vat = cents(b.tax_amount) ?? 0;
      invoices.push({
        id: str(b.id), side: 'PURCHASE', number: str(b.bill_number), partner_name: str(obj(b.vendor).vendor_name || obj(b.vendor).display_name || b.vendorid), partner_reg_code: '', partner_vat_number: '',
        date, due_date: toIsoDay(b.due_date), currency: str(b.currency_code) || code(b.total_amount) || 'USD', net_cents: total - vat, vat_cents: vat, total_cents: total,
        outstanding_cents: cents(b.outstanding) ?? 0, credit_note: false, reverse_charge: 'NONE',
        has_document: 'attachment' in b ? Boolean(b.attachment) : null, rows: []
      });
    }
    for (const i of invoiceRaw) {
      const date = toIsoDay(i.create_date ?? i.date);
      if (!inRange(date) || ['draft', 'void'].includes(str(i.display_status).toLowerCase())) continue;
      const total = cents(i.amount) ?? 0;
      invoices.push({
        id: str(i.invoiceid ?? i.id), side: 'SALES', number: str(i.invoice_number), partner_name: str(i.organization || i.current_organization || [i.fname, i.lname].filter(Boolean).join(' ')), partner_reg_code: '', partner_vat_number: '',
        date, due_date: toIsoDay(i.due_date), currency: str(i.currency_code) || code(i.amount) || 'USD', net_cents: total, vat_cents: 0, total_cents: total,
        outstanding_cents: cents(i.outstanding) ?? 0, credit_note: false, reverse_charge: 'NONE', has_document: null, rows: []
      });
    }
    for (const e of expenseRaw) {
      const date = toIsoDay(e.date);
      if (!inRange(date)) continue;
      const total = cents(e.amount) ?? 0;
      invoices.push({
        id: 'exp-' + str(e.expenseid ?? e.id), side: 'PURCHASE', number: '', partner_name: str(e.vendor), partner_reg_code: '', partner_vat_number: '',
        date, due_date: '', currency: code(e.amount) || 'USD', net_cents: total, vat_cents: 0, total_cents: total, outstanding_cents: 0, credit_note: false, reverse_charge: 'NONE',
        has_document: typeof e.has_receipt === 'boolean' ? e.has_receipt : null, rows: []
      });
    }
    return { provider: 'freshbooks', country: 'US', period, fetched_at: this.clock(), accounts: [], vat_codes: [], bank_accounts: [], invoices: invoices.filter(i => i.id), payments: [], entries: [], account_balances: null, requests_used: this.used, gaps };
  }
}
