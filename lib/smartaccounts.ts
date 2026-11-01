import crypto from 'node:crypto';
import {
  isoToDmy, toCents, toIsoDay,
  type LedgerAccount, type LedgerBankAccount, type LedgerEntry, type LedgerInvoice, type LedgerPayment, type LedgerSnapshot, type LedgerSource, type LedgerVatCode
} from './ledger';

// SmartAccounts (Estonia) READ adapter. Written from the provider's own API specification
// (SmartAccounts_API_latest.pdf, version 1.7 of 28.04.2025), which gives the signing rule, the
// request limits, the service paths and the field names used below.
//
// Checked against that document: signing (HMAC-SHA256 over the URL parameters before "signature",
// plus the body, as HEX), the ddMMyyyyHHmmss Estonian-time timestamp, the 60/minute and 1000/day
// limits, the service paths and request/field names of entries, accounts, vat percentages, bank
// accounts, vendor invoices, client invoices and payments, paging by pageNumber / hasMoreEntries.
//
// NOT checked, because the document does not say and no real SmartAccounts company was available:
//  - the names of the arrays in a response (the reader below accepts several and falls back to the
//    first array it finds);
//  - whether a key restricted to read-only privileges works with every call used here;
//  - whether the signing secret is used as plain text or in another encoding;
//  - any real response. Everything runs only against a stand-in so far.
//
// This file never writes: it uses "get" methods only. The API key and secret are held in memory for
// the length of one run, never logged and never put in an error message.

export type SmartAccountsCredentials = { apikey: string; secret: string };

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const BASE = 'https://sa.smartaccounts.eu/api/';
const PER_MINUTE = 55; // the provider allows 60; leave room
const PER_DAY_LIMIT = 1000;
const MAX_PAGES_PER_SERVICE = 40;

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

// ddMMyyyyHHmmss in Estonian time, which the provider requires (requests more than 15 minutes off are dropped).
export function smartAccountsTimestamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('day')}${get('month')}${get('year')}${get('hour')}${get('minute')}${get('second')}`;
}

// The signature input is exactly the query text before "&signature=", followed at once by the body.
export function smartAccountsSignature(signedQuery: string, body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(signedQuery + body, 'utf8').digest('hex');
}

export function buildSmartAccountsUrl(service: string, method: string, params: Record<string, string | number | boolean | undefined>, creds: SmartAccountsCredentials, now: Date, body = ''): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  pairs.push(`timestamp=${smartAccountsTimestamp(now)}`, `apikey=${encodeURIComponent(creds.apikey)}`);
  const signed = pairs.join('&');
  return `${BASE}${service}:${method}?${signed}&signature=${smartAccountsSignature(signed, body, creds.secret)}`;
}

// First array found under one of the likely names, else under any key; a bare array is accepted too.
function listOf(body: unknown, names: string[]): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  for (const name of names) if (Array.isArray(record[name])) return record[name] as Record<string, unknown>[];
  for (const value of Object.values(record)) if (Array.isArray(value) && value.every(v => v && typeof v === 'object')) return value as Record<string, unknown>[];
  return [];
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const docState = (v: unknown): boolean | null => (Array.isArray(v) ? v.length > 0 : null);

export class SmartAccountsClient implements LedgerSource {
  readonly provider = 'smartaccounts' as const;
  private creds: SmartAccountsCredentials;
  private fetchFn: FetchLike;
  private clock: () => Date;
  private sleep: (ms: number) => Promise<void>;
  private maxRequests: number;
  private recent: number[] = [];
  used = 0;

  constructor(args: { creds: SmartAccountsCredentials; fetchFn: FetchLike; clock?: () => Date; sleep?: (ms: number) => Promise<void>; max_requests?: number }) {
    if (!args.creds.apikey || !args.creds.secret) throw httpError('both the SmartAccounts API key and the secret key are needed', 400);
    this.creds = args.creds;
    this.fetchFn = args.fetchFn;
    this.clock = args.clock || (() => new Date());
    this.sleep = args.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    this.maxRequests = Math.min(args.max_requests ?? 300, PER_DAY_LIMIT);
  }

  private async get(service: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    if (this.used >= this.maxRequests) throw httpError('request budget for this run is used up', 429);
    const stamp = this.clock().getTime();
    this.recent = this.recent.filter(t => stamp - t < 60_000);
    if (this.recent.length >= PER_MINUTE) await this.sleep(60_000 - (stamp - this.recent[0]) + 50);
    this.recent.push(this.clock().getTime());
    this.used += 1;
    const url = buildSmartAccountsUrl(service, 'get', params, this.creds, this.clock());
    const response = await this.fetchFn(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (response.status === 401) throw httpError('SmartAccounts did not accept the key or signature (401). Check both keys, and that the API user group may read this data', 401);
    if (response.status === 503) throw httpError('SmartAccounts refused the request (503): over its request limit, or a billing problem on the account', 503);
    if (!response.ok) throw httpError(`SmartAccounts answered ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`, 502);
    try { return text ? JSON.parse(text) : {}; } catch { throw httpError('SmartAccounts sent an answer that is not JSON', 502); }
  }

  // All pages of a service that has change history, until hasMoreEntries is false.
  private async pages(service: string, params: Record<string, string | number | boolean | undefined>, names: string[], gaps: string[]): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES_PER_SERVICE; page += 1) {
      const body = await this.get(service, { ...params, pageNumber: page });
      rows.push(...listOf(body, names));
      const more = obj(body).hasMoreEntries;
      if (more === false || more === undefined) return rows;
    }
    gaps.push(`${service}: stopped after ${MAX_PAGES_PER_SERVICE} pages, so later records were not read`);
    return rows;
  }

  async snapshot(period: { from: string; to: string }): Promise<LedgerSnapshot> {
    const gaps: string[] = [
      'Note: account balances were not read (the endpoint is not described in the specification and is limited to one call per hour).',
      'Note: read from the provider\'s documentation only: no real SmartAccounts company has been checked yet.'
    ];
    const window = { dateFrom: isoToDmy(period.from), dateTo: isoToDmy(period.to), fetchRows: true, fetchDocuments: true };

    const safe = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await run(); } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 401) throw e; // wrong keys: nothing else can work either
        gaps.push(`${label}: not read (${(e as Error).message})`);
        return fallback;
      }
    };

    const accountsRaw = await safe('chart of accounts', async () => listOf(await this.get('settings/accounts'), ['accounts']), []);
    const vatRaw = await safe('VAT percentages', async () => listOf(await this.get('settings/vatpcs'), ['vatPcs', 'vatpcs']), []);
    const bankRaw = await safe('bank accounts', async () => listOf(await this.get('settings/bankaccounts'), ['bankAccounts', 'bankaccounts']), []);
    const vendorRaw = await safe('purchase invoices', () => this.pages('purchasesales/vendorinvoices', window, ['vendorInvoices', 'invoices'], gaps), []);
    const clientRaw = await safe('sales invoices', () => this.pages('purchasesales/clientinvoices', window, ['clientInvoices', 'invoices'], gaps), []);
    const paymentRaw = await safe('payments', () => this.pages('purchasesales/payments', { dateFrom: window.dateFrom, dateTo: window.dateTo, fetchRows: true }, ['payments'], gaps), []);
    const entryRaw = await safe('ledger entries', () => this.pages('general/entries', window, ['entries'], gaps), []);

    const accounts: LedgerAccount[] = accountsRaw.map(a => ({
      code: str(a.code), name: str(a.descriptionEn || a.descriptionEt),
      type: (['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'].includes(str(a.type)) ? str(a.type) : 'OTHER') as LedgerAccount['type']
    })).filter(a => a.code);

    const vat_codes: LedgerVatCode[] = vatRaw.map(v => ({
      code: str(v.vatPc), rate_percent: Number(v.pc) || 0, active_for_purchases: v.activePurchase !== false, active_for_sales: v.activeSales !== false
    })).filter(v => v.code);

    const bank_accounts: LedgerBankAccount[] = bankRaw.map(b => ({ name: str(b.name), ledger_account: str(b.account), currency: str(b.currency) || 'EUR', iban: str(b.iban) }));

    const invoice = (raw: Record<string, unknown>, side: 'PURCHASE' | 'SALES'): LedgerInvoice => {
      const partner = obj(side === 'PURCHASE' ? raw.vendor : raw.client);
      const rows = Array.isArray(raw.rows) ? (raw.rows as Record<string, unknown>[]) : [];
      const reverse = str(raw.reverseVatChargeType);
      return {
        id: str(raw.id), side, number: str(raw.invoiceNumber || raw.number),
        partner_name: str(partner.name), partner_reg_code: str(partner.regCode), partner_vat_number: str(partner.vatNumber),
        date: toIsoDay(raw.date), due_date: toIsoDay(raw.dueDate), currency: str(raw.currency) || 'EUR',
        net_cents: toCents(raw.amount) ?? 0, vat_cents: toCents(raw.vatAmount) ?? 0, total_cents: toCents(raw.totalAmount) ?? 0,
        outstanding_cents: toCents(raw.outstandingAmount) ?? 0, credit_note: str(raw.type) === 'CRE',
        reverse_charge: reverse === 'NATIONAL' || reverse === 'UNION' || reverse === 'OTHER' ? reverse : 'NONE',
        has_document: docState(raw.documents),
        rows: rows.map(r => {
          const vat = toCents(r.vat), sum = toCents(r.sum);
          return { description: str(r.description), vat_code: str(r.vatPc), vat_cents: vat, net_cents: vat !== null && sum !== null ? sum - vat : null, account: str(r.accountPurchase) };
        })
      };
    };
    const invoices = [...vendorRaw.map(r => invoice(r, 'PURCHASE')), ...clientRaw.map(r => invoice(r, 'SALES'))].filter(i => i.id);

    const payments: LedgerPayment[] = paymentRaw.map(p => {
      const rows = Array.isArray(p.rows) ? (p.rows as Record<string, unknown>[]) : [];
      let applied = 0;
      for (const r of rows) {
        applied += toCents(r.amount) ?? 0;
        applied += toCents(obj(r.prepayment).amount) ?? 0;
        if (Array.isArray(r.extras)) for (const x of r.extras as Record<string, unknown>[]) applied += toCents(x.amount) ?? 0;
      }
      const partner = obj(p.client ?? p.vendor);
      return {
        id: str(p.id), date: toIsoDay(p.date), account_kind: str(p.accountType) === 'CASH' ? ('CASH' as const) : ('BANK' as const), account_name: str(p.accountName),
        partner_name: str(partner.name), partner_side: str(p.partnerType) === 'VENDOR' ? ('VENDOR' as const) : ('CLIENT' as const),
        currency: str(p.currency) || 'EUR', amount_cents: toCents(p.amount) ?? 0, applied_cents: applied
      };
    }).filter(p => p.id);

    const entries: LedgerEntry[] = entryRaw.map(e => ({
      id: str(e.id), doc_type: str(e.docType) || 'LEDGER_ENTRY', date: toIsoDay(e.date), number: str(e.number), document_ref: str(e.document),
      has_document: docState(e.documents),
      rows: (Array.isArray(e.rows) ? (e.rows as Record<string, unknown>[]) : []).map(r => ({ account: str(r.account), description: str(r.description), debit_cents: toCents(r.debitAmount) ?? 0, credit_cents: toCents(r.creditAmount) ?? 0 }))
    })).filter(e => e.id);

    return { provider: 'smartaccounts', country: 'EE', period, fetched_at: this.clock().getTime(), accounts, vat_codes, bank_accounts, invoices, payments, entries, account_balances: null, requests_used: this.used, gaps };
  }
}
