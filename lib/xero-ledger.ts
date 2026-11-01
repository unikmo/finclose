import { toCents, toIsoDay, type LedgerAccount, type LedgerEntry, type LedgerInvoice, type LedgerPayment, type LedgerSnapshot, type LedgerSource, type LedgerVatCode } from './ledger';

// Xero READ adapter: accounts, tax rates, invoices and bills, bank transactions, manual journals.
// UNVERIFIED: endpoint paths, the "where" filter syntax, field names and the paging rule are from
// Xero's public developer documentation as recalled, and have only run against a stand-in. Xero is
// also changing its scope model, so which scopes this needs must be confirmed on a Xero demo
// company. Only GET requests are made.

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const API = 'https://api.xero.com/api.xro/2.0';
const MAX_PAGES = 40;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export class XeroLedgerSource implements LedgerSource {
  readonly provider = 'xero' as const;
  private fetchFn: FetchLike;
  private auth: () => Promise<{ token: string; tenantId: string }>;
  private country: string;
  private clock: () => number;
  used = 0;

  constructor(args: { fetchFn: FetchLike; auth: () => Promise<{ token: string; tenantId: string }>; country?: string; clock?: () => number }) {
    this.fetchFn = args.fetchFn;
    this.auth = args.auth;
    this.country = args.country || 'GB';
    this.clock = args.clock || Date.now;
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const { token, tenantId } = await this.auth();
    this.used += 1;
    const response = await this.fetchFn(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}`, 'xero-tenant-id': tenantId, Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) throw httpError(`Xero would not let FinClose read ${path.split('?')[0]} (${response.status}). Reconnect and allow read access`, response.status);
    if (response.status === 429) throw httpError('Xero asked FinClose to slow down (429)', 429);
    if (!response.ok) throw httpError(`Xero answered ${response.status} for ${path.split('?')[0]}`, 502);
    return obj(await response.json());
  }

  private async paged(path: string, key: string, gaps: string[]): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = await this.get(`${path}${path.includes('?') ? '&' : '?'}page=${page}`);
      const rows = arr(body[key]);
      out.push(...rows);
      if (rows.length === 0 || rows.length < 100) return out; // Xero pages hold up to 100 invoices
    }
    gaps.push(`${key}: stopped after ${MAX_PAGES} pages, so later records were not read`);
    return out;
  }

  async snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot> {
    const gaps: string[] = ['Note: read from Xero\'s documentation as recalled: no real Xero organisation has been checked yet.'];
    const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await run(); } catch (e) {
        if ([401, 403].includes((e as { status?: number }).status || 0) && label === 'chart of accounts') throw e;
        gaps.push(`${label}: not read (${(e as Error).message})`);
        return fallback;
      }
    };
    const [fy, fm, fd] = period.from.split('-').map(Number);
    const [ty, tm, td] = period.to.split('-').map(Number);
    const range = encodeURIComponent(`Date>=DateTime(${fy},${fm},${fd}) AND Date<=DateTime(${ty},${tm},${td})`);

    const accountsRaw = await safe('chart of accounts', async () => arr((await this.get('Accounts')).Accounts), []);
    const taxRaw = await safe('tax rates', async () => arr((await this.get('TaxRates')).TaxRates), []);
    const invoiceRaw = await safe('invoices and bills', () => this.paged(`Invoices?where=${range}&order=Date`, 'Invoices', gaps), []);
    const bankRaw = await safe('bank transactions', () => this.paged(`BankTransactions?where=${range}`, 'BankTransactions', gaps), []);
    const journalRaw = await safe('manual journals', () => this.paged(`ManualJournals?where=${range}`, 'ManualJournals', gaps), []);

    const typeOf = (a: Record<string, unknown>): LedgerAccount['type'] => {
      const cls = str(a.Class).toUpperCase();
      if (cls === 'ASSET' || cls === 'LIABILITY' || cls === 'EQUITY') return cls;
      if (cls === 'REVENUE') return 'INCOME';
      if (cls === 'EXPENSE') return 'EXPENSE';
      return 'OTHER';
    };
    const accounts: LedgerAccount[] = accountsRaw.map(a => ({ code: str(a.Code), name: str(a.Name), type: typeOf(a) })).filter(a => a.code);

    const vat_codes: LedgerVatCode[] = taxRaw.map(t => ({
      code: str(t.TaxType), rate_percent: Number(t.EffectiveRate ?? t.DisplayTaxRate) || 0,
      active_for_purchases: t.CanApplyToExpenses !== false, active_for_sales: t.CanApplyToRevenue !== false
    })).filter(v => v.code);

    const invoices: LedgerInvoice[] = invoiceRaw
      .filter(i => !['DRAFT', 'DELETED', 'VOIDED'].includes(str(i.Status)))
      .map(i => {
        const accpay = str(i.Type).startsWith('ACCPAY');
        return {
          id: str(i.InvoiceID), side: accpay ? 'PURCHASE' as const : 'SALES' as const, number: str(i.InvoiceNumber),
          partner_name: str(obj(i.Contact).Name), partner_reg_code: '', partner_vat_number: str(obj(i.Contact).TaxNumber),
          date: toIsoDay(i.DateString ?? i.Date), due_date: toIsoDay(i.DueDateString ?? i.DueDate), currency: str(i.CurrencyCode) || 'GBP',
          net_cents: toCents(i.SubTotal) ?? 0, vat_cents: toCents(i.TotalTax) ?? 0, total_cents: toCents(i.Total) ?? 0, outstanding_cents: toCents(i.AmountDue) ?? 0,
          credit_note: str(i.Type).endsWith('CREDIT'), reverse_charge: 'NONE' as const,
          has_document: typeof i.HasAttachments === 'boolean' ? i.HasAttachments : null,
          rows: arr(i.LineItems).map(l => ({ description: str(l.Description), vat_code: str(l.TaxType), net_cents: toCents(l.LineAmount), vat_cents: toCents(l.TaxAmount), account: str(l.AccountCode) }))
        };
      }).filter(i => i.id);

    // A bank transaction that is not reconciled has nothing matched to it: that is the open item.
    const payments: LedgerPayment[] = bankRaw
      .filter(b => str(b.Status) !== 'DELETED')
      .map(b => {
        const total = toCents(b.Total) ?? 0;
        const spend = str(b.Type).startsWith('SPEND');
        return {
          id: str(b.BankTransactionID), date: toIsoDay(b.DateString ?? b.Date), account_kind: 'BANK' as const, account_name: str(obj(b.BankAccount).Name),
          partner_name: str(obj(b.Contact).Name), partner_side: spend ? 'VENDOR' as const : 'CLIENT' as const, currency: str(b.CurrencyCode) || 'GBP',
          amount_cents: spend ? -total : total, applied_cents: b.IsReconciled === true ? (spend ? -total : total) : 0
        };
      }).filter(p => p.id);

    const entries: LedgerEntry[] = journalRaw.filter(j => !['DRAFT', 'DELETED', 'VOIDED'].includes(str(j.Status))).map(j => ({
      id: str(j.ManualJournalID), doc_type: 'LEDGER_ENTRY', date: toIsoDay(j.DateString ?? j.Date), number: str(j.Narration).slice(0, 40), document_ref: '',
      has_document: typeof j.HasAttachments === 'boolean' ? j.HasAttachments : null,
      rows: arr(j.JournalLines).map(l => {
        const amount = toCents(l.LineAmount) ?? 0;
        return { account: str(l.AccountCode), description: str(l.Description), debit_cents: amount > 0 ? amount : 0, credit_cents: amount < 0 ? -amount : 0 };
      })
    })).filter(e => e.id);

    return { provider: 'xero', country: this.country, period, fetched_at: this.clock(), accounts, vat_codes, bank_accounts: [], invoices, payments, entries, account_balances: null, requests_used: this.used, gaps };
  }
}
