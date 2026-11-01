import { toCents, toIsoDay, type LedgerAccount, type LedgerInvoice, type LedgerSnapshot, type LedgerSource, type LedgerVatCode } from './ledger';

// Zoho Books READ adapter: chart of accounts, taxes, bills and invoices. GET requests only.
//
// UNVERIFIED in every detail. Zoho's own API reference refused to load (HTTP 403) when this was
// written, so the paths (/books/v3/...), the organization_id parameter, the Zoho-oauthtoken header,
// page / per_page paging with page_context.has_more_page, and all field names are from memory and
// ran only against a stand-in. Zoho also runs separate data centres (.com, .eu, .in ...), so the API
// base comes from configuration. Journal entries and bank transactions are not read.

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const PER_PAGE = 200;
const MAX_PAGES = 40;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export class ZohoLedgerSource implements LedgerSource {
  readonly provider = 'zohobooks' as const;
  private fetchFn: FetchLike;
  private auth: () => Promise<{ token: string; tenantId: string }>;
  private base: string;
  private country: string;
  private clock: () => number;
  used = 0;

  constructor(args: { fetchFn: FetchLike; auth: () => Promise<{ token: string; tenantId: string }>; api_base?: string; country?: string; clock?: () => number }) {
    this.fetchFn = args.fetchFn;
    this.auth = args.auth;
    this.base = (args.api_base || 'https://www.zohoapis.com').replace(/\/+$/, '');
    this.country = args.country || 'US';
    this.clock = args.clock || Date.now;
  }

  private async all(path: string, name: string, extra: Record<string, string>, gaps: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { token, tenantId } = await this.auth();
      this.used += 1;
      const query = new URLSearchParams({ organization_id: tenantId, page: String(page), per_page: String(PER_PAGE), ...extra });
      const response = await this.fetchFn(`${this.base}/books/v3/${path}?${query}`, { headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) throw httpError(`Zoho Books would not let FinClose read ${name} (${response.status}). Reconnect and allow read access`, response.status);
      if (response.status === 429) throw httpError('Zoho Books asked FinClose to slow down (429)', 429);
      if (!response.ok) throw httpError(`Zoho Books answered ${response.status} for ${name}`, 502);
      const body = obj(await response.json());
      const rows = Array.isArray(body[name]) ? (body[name] as Record<string, unknown>[]) : (Object.values(body).find(v => Array.isArray(v)) as Record<string, unknown>[] | undefined) || [];
      out.push(...rows);
      if (obj(body.page_context).has_more_page !== true) return out;
    }
    gaps.push(`${name}: stopped after ${MAX_PAGES} pages, so later records were not read`);
    return out;
  }

  async snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot> {
    const gaps: string[] = [
      'Note: read from memory of Zoho\'s API (its documentation could not be loaded): no real Zoho Books organisation has been checked yet.',
      'Note: journal entries, bank transactions and attached documents were not read, so the entry-balance, unmatched-payment and missing-document checks cannot run on this source.'
    ];
    const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await run(); } catch (e) {
        if ([401, 403].includes((e as { status?: number }).status || 0)) throw e;
        gaps.push(`${label}: not read (${(e as Error).message})`);
        return fallback;
      }
    };
    const window = { date_start: period.from, date_end: period.to };
    const accountRaw = await safe('chart of accounts', () => this.all('chartofaccounts', 'chartofaccounts', {}, gaps), []);
    const taxRaw = await safe('taxes', () => this.all('settings/taxes', 'taxes', {}, gaps), []);
    const billRaw = await safe('bills', () => this.all('bills', 'bills', window, gaps), []);
    const invoiceRaw = await safe('invoices', () => this.all('invoices', 'invoices', window, gaps), []);

    const typeOf = (a: Record<string, unknown>): LedgerAccount['type'] => {
      const t = str(a.account_type).toLowerCase();
      if (/(asset|bank|cash|receivable|stock)/.test(t)) return 'ASSET';
      if (/(liabilit|payable|credit_card)/.test(t)) return 'LIABILITY';
      if (/equity/.test(t)) return 'EQUITY';
      if (/(income|revenue)/.test(t)) return 'INCOME';
      if (/(expense|cost_of_goods)/.test(t)) return 'EXPENSE';
      return 'OTHER';
    };
    const accounts: LedgerAccount[] = accountRaw.map(a => ({ code: str(a.account_code || a.account_id), name: str(a.account_name), type: typeOf(a) })).filter(a => a.code);
    const vat_codes: LedgerVatCode[] = taxRaw.map(t => ({ code: str(t.tax_id), rate_percent: Number(t.tax_percentage) || 0, active_for_purchases: true, active_for_sales: true })).filter(v => v.code);

    const inRange = (iso: string) => iso !== '' && iso >= period.from && iso <= period.to;
    const toInvoice = (r: Record<string, unknown>, side: 'PURCHASE' | 'SALES'): LedgerInvoice => {
      const total = toCents(r.total) ?? 0, vat = toCents(r.tax_total) ?? 0;
      return {
        id: str(side === 'PURCHASE' ? r.bill_id : r.invoice_id), side, number: str(side === 'PURCHASE' ? r.bill_number : r.invoice_number),
        partner_name: str(side === 'PURCHASE' ? r.vendor_name : r.customer_name), partner_reg_code: '', partner_vat_number: '',
        date: toIsoDay(r.date), due_date: toIsoDay(r.due_date), currency: str(r.currency_code) || 'USD',
        net_cents: total - vat, vat_cents: vat, total_cents: total, outstanding_cents: toCents(r.balance) ?? 0,
        credit_note: false, reverse_charge: 'NONE', has_document: null, rows: []
      };
    };
    const live = (r: Record<string, unknown>) => !['void', 'draft'].includes(str(r.status).toLowerCase());
    const invoices = [...billRaw.filter(live).map(r => toInvoice(r, 'PURCHASE')), ...invoiceRaw.filter(live).map(r => toInvoice(r, 'SALES'))].filter(i => i.id && inRange(i.date));
    return { provider: 'zohobooks', country: this.country, period, fetched_at: this.clock(), accounts, vat_codes, bank_accounts: [], invoices, payments: [], entries: [], account_balances: null, requests_used: this.used, gaps };
  }
}
