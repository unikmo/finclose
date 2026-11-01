import { toCents, toIsoDay, type LedgerAccount, type LedgerEntry, type LedgerInvoice, type LedgerSnapshot, type LedgerSource, type LedgerVatCode } from './ledger';

// QuickBooks Online READ adapter over the "query" endpoint. It is given an access token and a realm
// (company) id; the OAuth sign-in for QuickBooks is NOT built, so a token has to come from
// somewhere else for now.
//
// UNVERIFIED in every detail: the base URL, the query syntax, entity and field names are from
// Intuit's public documentation as recalled and ran only against a stand-in. Attachments are a
// separate entity that this adapter does not query, so "has a document" is reported as unknown.
// Only GET requests are made.

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const PAGE = 500;
const MAX_PAGES = 40;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export class QuickBooksLedgerSource implements LedgerSource {
  readonly provider = 'quickbooks' as const;
  private fetchFn: FetchLike;
  private token: string;
  private realm: string;
  private base: string;
  private country: string;
  private clock: () => number;
  used = 0;

  constructor(args: { fetchFn: FetchLike; access_token: string; realm_id: string; sandbox?: boolean; country?: string; clock?: () => number }) {
    if (!/^\d{5,20}$/.test(args.realm_id)) throw httpError('the QuickBooks company id looks wrong', 400);
    this.fetchFn = args.fetchFn;
    this.token = args.access_token;
    this.realm = args.realm_id;
    this.base = args.sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
    this.country = args.country || 'US';
    this.clock = args.clock || Date.now;
  }

  private async query(entity: string, where: string, gaps: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const sql = `select * from ${entity}${where ? ' where ' + where : ''} startposition ${page * PAGE + 1} maxresults ${PAGE}`;
      this.used += 1;
      const response = await this.fetchFn(`${this.base}/v3/company/${this.realm}/query?query=${encodeURIComponent(sql)}&minorversion=70`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) throw httpError(`QuickBooks would not let FinClose read ${entity} (${response.status}). The token may have expired`, response.status);
      if (response.status === 429) throw httpError('QuickBooks asked FinClose to slow down (429)', 429);
      if (!response.ok) throw httpError(`QuickBooks answered ${response.status} for ${entity}`, 502);
      const rows = arr(obj(obj(await response.json()).QueryResponse)[entity]);
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
    gaps.push(`${entity}: stopped after ${MAX_PAGES} pages, so later records were not read`);
    return out;
  }

  async snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot> {
    const gaps: string[] = [
      'Note: read from QuickBooks\'s documentation as recalled: no real QuickBooks company has been checked yet.',
      'Note: attached documents are not queried, so missing-document checks cannot run on this source.',
      'Note: bank transactions and payments were not read, so unmatched-payment checks cannot run on this source.'
    ];
    const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await run(); } catch (e) {
        if ([401, 403].includes((e as { status?: number }).status || 0)) throw e;
        gaps.push(`${label}: not read (${(e as Error).message})`);
        return fallback;
      }
    };
    const window = `TxnDate >= '${period.from}' and TxnDate <= '${period.to}'`;
    const accountRaw = await safe('chart of accounts', () => this.query('Account', '', gaps), []);
    const taxRaw = await safe('tax rates', () => this.query('TaxRate', '', gaps), []);
    const billRaw = await safe('bills', () => this.query('Bill', window, gaps), []);
    const invoiceRaw = await safe('invoices', () => this.query('Invoice', window, gaps), []);
    const journalRaw = await safe('journal entries', () => this.query('JournalEntry', window, gaps), []);

    const accountType = (a: Record<string, unknown>): LedgerAccount['type'] => {
      const c = str(a.Classification).toUpperCase();
      if (c === 'ASSET' || c === 'LIABILITY' || c === 'EQUITY') return c;
      if (c === 'REVENUE') return 'INCOME';
      if (c === 'EXPENSE') return 'EXPENSE';
      return 'OTHER';
    };
    const accounts: LedgerAccount[] = accountRaw.map(a => ({ code: str(a.AcctNum || a.Id), name: str(a.Name), type: accountType(a) })).filter(a => a.code);
    const vat_codes: LedgerVatCode[] = taxRaw.map(t => ({ code: str(t.Id), rate_percent: Number(t.RateValue) || 0, active_for_purchases: true, active_for_sales: true })).filter(v => v.code);

    const toInvoice = (r: Record<string, unknown>, side: 'PURCHASE' | 'SALES'): LedgerInvoice => {
      const total = toCents(r.TotalAmt) ?? 0;
      const vat = toCents(obj(r.TxnTaxDetail).TotalTax) ?? 0;
      return {
        id: str(r.Id), side, number: str(r.DocNumber), partner_name: str(obj(side === 'PURCHASE' ? r.VendorRef : r.CustomerRef).name), partner_reg_code: '', partner_vat_number: '',
        date: toIsoDay(r.TxnDate), due_date: toIsoDay(r.DueDate), currency: str(obj(r.CurrencyRef).value) || 'USD',
        net_cents: total - vat, vat_cents: vat, total_cents: total, outstanding_cents: toCents(r.Balance) ?? 0, credit_note: false, reverse_charge: 'NONE', has_document: null,
        rows: arr(r.Line).filter(l => l.DetailType !== 'SubTotalLineDetail').map(l => ({ description: str(l.Description), vat_code: '', net_cents: toCents(l.Amount), vat_cents: null, account: '' }))
      };
    };
    const invoices = [...billRaw.map(r => toInvoice(r, 'PURCHASE')), ...invoiceRaw.map(r => toInvoice(r, 'SALES'))].filter(i => i.id);

    const entries: LedgerEntry[] = journalRaw.map(j => ({
      id: str(j.Id), doc_type: 'LEDGER_ENTRY', date: toIsoDay(j.TxnDate), number: str(j.DocNumber), document_ref: '', has_document: null,
      rows: arr(j.Line).map(l => {
        const detail = obj(l.JournalEntryLineDetail);
        const amount = toCents(l.Amount) ?? 0;
        const debit = str(detail.PostingType) === 'Debit';
        return { account: str(obj(detail.AccountRef).value), description: str(l.Description), debit_cents: debit ? amount : 0, credit_cents: debit ? 0 : amount };
      })
    })).filter(e => e.id);

    return { provider: 'quickbooks', country: this.country, period, fetched_at: this.clock(), accounts, vat_codes, bank_accounts: [], invoices, payments: [], entries, account_balances: null, requests_used: this.used, gaps };
  }
}
