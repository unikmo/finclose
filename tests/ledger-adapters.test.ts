import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { toCents, toIsoDay } from '../lib/ledger.ts';
import type { LedgerSnapshot } from '../lib/ledger.ts';
import { SmartAccountsClient, buildSmartAccountsUrl, smartAccountsSignature, smartAccountsTimestamp } from '../lib/smartaccounts.ts';
import { reviewLedger } from '../lib/ledger-review.ts';
import { InMemoryActivationStore, activateCompany, checkPartnerCode, companyKey, partnerCode, usageForMonth, verifyActivationToken } from '../lib/activation.ts';
import { XeroLedgerSource } from '../lib/xero-ledger.ts';
import { QuickBooksLedgerSource } from '../lib/quickbooks-ledger.ts';
import { datevBuchungsstapel } from '../lib/datev-export.ts';
import type { JournalView } from '../lib/chart-of-accounts.ts';

const env = { FINCLOSE_ACTIVATION_KEY: 'a'.repeat(40) } as NodeJS.ProcessEnv;

test('money and date parsing never drift or guess', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('-5'), -500);
  assert.equal(toCents('1.005'), 101);
  assert.equal(toCents('abc'), null);
  assert.equal(toIsoDay('03.03.2021'), '2021-03-03');
  assert.equal(toIsoDay('2021-03-03T10:00:00'), '2021-03-03');
  assert.equal(toIsoDay('31.02.2021'), '');
});

test('SmartAccounts timestamp is Estonian time in ddMMyyyyHHmmss', () => {
  assert.equal(smartAccountsTimestamp(new Date('2026-10-31T10:00:00Z')), '31102026120000'); // winter, UTC+2
  assert.equal(smartAccountsTimestamp(new Date('2026-07-01T10:00:00Z')), '01072026130000'); // summer, UTC+3
});

test('SmartAccounts signature covers the query before "signature" plus the body, as hex HMAC-SHA256', () => {
  const creds = { apikey: 'pub123', secret: 'sec456' };
  const now = new Date('2026-10-31T10:00:00Z');
  const url = buildSmartAccountsUrl('purchasesales/vendorinvoices', 'get', { dateFrom: '01.01.2026', fetchRows: true }, creds, now);
  const [path, query] = url.split('?');
  assert.ok(path.endsWith('purchasesales/vendorinvoices:get'));
  const idx = query.lastIndexOf('&signature=');
  const signed = query.slice(0, idx);
  assert.equal(query.slice(idx + 11), crypto.createHmac('sha256', 'sec456').update(signed).digest('hex'));
  assert.ok(signed.includes('timestamp=31102026120000') && signed.includes('apikey=pub123'));
  assert.ok(!url.includes('sec456'), 'the secret must never be in the URL');
  assert.equal(smartAccountsSignature('a=1', '{"x":1}', 's'), crypto.createHmac('sha256', 's').update('a=1{"x":1}').digest('hex'));
});

// A stand-in for SmartAccounts: answers by service path.
function smartAccountsStandIn(handlers: Record<string, (query: URLSearchParams) => { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const service = u.pathname.replace('/api/', '').replace(/:get$/, '');
    const reply = handlers[service] ? handlers[service](u.searchParams) : { status: 200, body: {} };
    const status = reply.status ?? 200;
    return { ok: status < 300, status, text: async () => JSON.stringify(reply.body) };
  };
  return { fetchFn, calls };
}

const baseHandlers = () => ({
  'settings/accounts': () => ({ body: { accounts: [{ code: '1000', descriptionEn: 'Bank', type: 'ASSET' }, { code: '6100', descriptionEn: 'Office', type: 'EXPENSE' }] } }),
  'settings/vatpcs': () => ({ body: { vatPcs: [{ vatPc: '24', pc: 24, activePurchase: true, activeSales: true }, { vatPc: '17', pc: 17 }] } }),
  'settings/bankaccounts': () => ({ body: { bankAccounts: [{ name: 'LHV', account: '1000', currency: 'EUR', iban: 'EE00' }] } }),
  'purchasesales/clientinvoices': () => ({ body: { clientInvoices: [], hasMoreEntries: false } }),
  'purchasesales/payments': () => ({ body: { payments: [], hasMoreEntries: false } }),
  'general/entries': () => ({ body: { entries: [], hasMoreEntries: false } })
});

const vendorInvoice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, invoiceNumber: 'INV-' + id, date: '10.03.2026', dueDate: '24.03.2026', currency: 'EUR', amount: '100.00', vatAmount: '24.00', totalAmount: '124.00', outstandingAmount: '0',
  vendor: { name: 'Telia', regCode: '10234957' }, documents: [{ fileName: 'a.pdf' }], rows: [{ description: 'Phone', vatPc: '24', vat: '24.00', sum: '124.00' }], ...extra
});

test('SmartAccounts reader pages through results, uses only "get", and never sends the secret', async () => {
  const { fetchFn, calls } = smartAccountsStandIn({
    ...baseHandlers(),
    'purchasesales/vendorinvoices': q => (q.get('pageNumber') === '1'
      ? { body: { vendorInvoices: [vendorInvoice('1')], hasMoreEntries: true } }
      : { body: { vendorInvoices: [vendorInvoice('2')], hasMoreEntries: false } })
  });
  const client = new SmartAccountsClient({ creds: { apikey: 'pub', secret: 'topsecret' }, fetchFn, clock: () => new Date('2026-10-31T10:00:00Z') });
  const snap = await client.snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.equal(snap.invoices.length, 2);
  assert.equal(snap.invoices[0].total_cents, 12400);
  assert.equal(snap.invoices[0].partner_name, 'Telia');
  assert.equal(snap.invoices[0].has_document, true);
  assert.equal(snap.accounts.length, 2);
  assert.equal(snap.vat_codes.find(v => v.code === '24')?.rate_percent, 24);
  assert.ok(calls.every(c => /:get\?/.test(c)), 'every request is a read');
  assert.ok(calls.every(c => !c.includes('topsecret')));
  assert.ok(calls.some(c => c.includes('dateFrom=01.01.2026')));
  assert.equal(snap.requests_used, calls.length);
});

test('SmartAccounts wrong keys stop the run with a message that does not contain the keys', async () => {
  const { fetchFn } = smartAccountsStandIn({ 'settings/accounts': () => ({ status: 401, body: {} }) });
  const client = new SmartAccountsClient({ creds: { apikey: 'pub', secret: 'topsecret' }, fetchFn });
  await assert.rejects(() => client.snapshot({ from: '2026-01-01', to: '2026-12-31' }), (e: Error) => /401/.test(e.message) && !/topsecret|pub\b/.test(e.message));
});

test('a used-up request budget leaves a visible gap and the review says the data is incomplete', async () => {
  const { fetchFn } = smartAccountsStandIn({ ...baseHandlers(), 'purchasesales/vendorinvoices': () => ({ body: { vendorInvoices: [vendorInvoice('1')], hasMoreEntries: true } }) });
  const client = new SmartAccountsClient({ creds: { apikey: 'p', secret: 's' }, fetchFn, max_requests: 5 });
  const snap = await client.snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.ok(snap.requests_used <= 5);
  assert.ok(snap.gaps.some(g => !g.startsWith('Note: ')));
  assert.equal(reviewLedger(snap).status, 'DATA_INCOMPLETE');
});

const cleanSnapshot = (over: Partial<LedgerSnapshot> = {}): LedgerSnapshot => ({
  provider: 'smartaccounts', country: 'EE', period: { from: '2026-01-01', to: '2026-12-31' }, fetched_at: 0, accounts: [], bank_accounts: [], account_balances: null, requests_used: 1, gaps: ['Note: a harmless note'],
  vat_codes: [{ code: '24', rate_percent: 24, active_for_purchases: true, active_for_sales: true }],
  invoices: [{ id: 'i1', side: 'PURCHASE', number: 'A1', partner_name: 'Telia', partner_reg_code: '', partner_vat_number: '', date: '2026-03-10', due_date: '2026-03-24', currency: 'EUR', net_cents: 10000, vat_cents: 2400, total_cents: 12400, outstanding_cents: 0, credit_note: false, reverse_charge: 'NONE', has_document: true, rows: [{ description: 'x', vat_code: '24', net_cents: 10000, vat_cents: 2400, account: '' }] }],
  payments: [], entries: [], ...over
});

test('review of a clean ledger never claims the books are right', () => {
  const review = reviewLedger(cleanSnapshot());
  assert.equal(review.decides, 'NOTHING');
  assert.equal(review.status, 'NO_FINDINGS_FROM_CHECKS_RUN');
  assert.match(review.statement, /not a statement that the books are correct/);
  assert.ok(review.checks_not_run.length > 0);
  assert.ok(review.checks_not_run.includes('a harmless note'));
});

test('review raises proposals for duplicates, missing documents, unmatched payments, bad VAT and unbalanced entries', () => {
  const dup = { ...cleanSnapshot().invoices[0], id: 'i2' };
  const snap = cleanSnapshot({
    invoices: [{ ...cleanSnapshot().invoices[0], has_document: false }, dup, { ...dup, id: 'i3', number: 'B2', vat_cents: 900, total_cents: 10900 }],
    payments: [{ id: 'p1', date: '2026-03-12', account_kind: 'BANK', account_name: 'LHV', partner_name: 'Unknown', partner_side: 'VENDOR', currency: 'EUR', amount_cents: 5000, applied_cents: 0 }],
    entries: [{ id: 'e1', doc_type: 'LEDGER_ENTRY', date: '2026-03-15', number: '77', document_ref: '', has_document: false, rows: [{ account: '1000', description: '', debit_cents: 1000, credit_cents: 0 }, { account: '6100', description: '', debit_cents: 0, credit_cents: 900 }] }]
  });
  const review = reviewLedger(snap);
  const rules = new Set(review.proposals.map(p => p.rule));
  for (const rule of ['DUPLICATE_INVOICE', 'MISSING_DOCUMENT', 'PAYMENT_NOT_MATCHED', 'VAT_ARITHMETIC', 'ENTRY_UNBALANCED']) assert.ok(rules.has(rule), rule);
  assert.equal(review.status, 'OPEN_PROPOSALS');
  assert.ok(review.proposals.every(p => p.suggested_action.length > 0));
  // proposal ids are stable, so a dismissal can be remembered
  assert.deepEqual(reviewLedger(snap).proposals.map(p => p.proposal_id), review.proposals.map(p => p.proposal_id));
});

test('activation counts distinct companies per partner and month, not runs', async () => {
  const store = new InMemoryActivationStore();
  const code = partnerCode('acme-accounting', env);
  const run = (reg: string, now: number, partner = 'acme-accounting', pc = code) => activateCompany(store, { partner_id: partner, partner_code: pc, country: 'ee', reg_code: reg }, env, now);
  const t = Date.UTC(2026, 9, 5);
  const first = await run('12345678', t);
  const again = await run('1234 5678', t + 1000); // same company, typed differently
  await run('87654321', t + 2000);
  assert.equal(first.first_run_this_month, true);
  assert.equal(again.first_run_this_month, false);
  const usage = await usageForMonth(store, 'acme-accounting', '2026-10');
  assert.equal(usage.client_accounts, 2);
  assert.equal(usage.runs, 3);
  const next = await run('12345678', Date.UTC(2026, 10, 2)); // new month: counted again
  assert.equal(next.first_run_this_month, true);
  assert.equal((await usageForMonth(store, 'acme-accounting', '2026-11')).client_accounts, 1);
});

test('activation refuses a wrong partner code, keeps partners apart and signs tokens that cannot be edited', async () => {
  const store = new InMemoryActivationStore();
  await assert.rejects(() => activateCompany(store, { partner_id: 'acme-accounting', partner_code: 'nope', country: 'EE', reg_code: '12345678' }, env), /partner code/);
  assert.equal((await usageForMonth(store, 'acme-accounting', '2026-10')).client_accounts, 0);
  assert.equal(checkPartnerCode('acme-accounting', partnerCode('other-firm', env), env), false);
  const res = await activateCompany(store, { partner_id: 'acme-accounting', partner_code: partnerCode('acme-accounting', env), country: 'EE', reg_code: '12345678' }, env, Date.UTC(2026, 9, 5));
  assert.deepEqual(verifyActivationToken(res.token, env), { partner_id: 'acme-accounting', company_key: 'EE:12345678', month: '2026-10' });
  const [v, payload, sig] = res.token.split('.');
  const forged = Buffer.from(JSON.stringify({ p: 'acme-accounting', c: 'EE:99999999', m: '2026-10' })).toString('base64url');
  assert.equal(verifyActivationToken(`${v}.${forged}.${sig}`, env), null);
  assert.equal(verifyActivationToken(`${v}.${payload}.x`, env), null);
  assert.equal(companyKey('ee', '12-34 5678'), 'EE:12345678');
  await assert.rejects(() => activateCompany(store, { partner_id: 'acme-accounting', partner_code: 'x', country: 'EE', reg_code: '1' }, {} as NodeJS.ProcessEnv), /not configured/);
});

test('Xero reader maps invoices, unreconciled bank lines and journals, and only reads', async () => {
  const calls: { url: string; method?: string }[] = [];
  const fetchFn = async (url: string, init: { method?: string } = {}) => {
    calls.push({ url, method: init.method });
    const path = url.replace('https://api.xero.com/api.xro/2.0/', '').split('?')[0];
    const bodies: Record<string, unknown> = {
      Accounts: { Accounts: [{ Code: '200', Name: 'Sales', Class: 'REVENUE' }] },
      TaxRates: { TaxRates: [{ TaxType: 'INPUT2', EffectiveRate: 20, CanApplyToExpenses: true }] },
      Invoices: { Invoices: [{ InvoiceID: 'x1', Type: 'ACCPAY', InvoiceNumber: 'B1', Contact: { Name: 'Vendor' }, DateString: '2026-03-01T00:00:00', DueDateString: '2026-03-31T00:00:00', Total: 120, SubTotal: 100, TotalTax: 20, AmountDue: 120, HasAttachments: false, Status: 'AUTHORISED', LineItems: [{ Description: 'd', TaxType: 'INPUT2', LineAmount: 100, TaxAmount: 20, AccountCode: '400' }] }] },
      BankTransactions: { BankTransactions: [{ BankTransactionID: 'b1', Type: 'SPEND', Total: 50, IsReconciled: false, DateString: '2026-03-02T00:00:00', Contact: { Name: 'Shop' }, BankAccount: { Name: 'Main' } }] },
      ManualJournals: { ManualJournals: [{ ManualJournalID: 'm1', Status: 'POSTED', DateString: '2026-03-03T00:00:00', Narration: 'Adj', JournalLines: [{ LineAmount: 10, AccountCode: '400' }, { LineAmount: -9, AccountCode: '800' }] }] }
    };
    return { ok: true, status: 200, json: async () => bodies[path] || {} };
  };
  const snap = await new XeroLedgerSource({ fetchFn, auth: async () => ({ token: 't', tenantId: 'tn' }), country: 'GB' }).snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.ok(calls.every(c => !c.method || c.method === 'GET'));
  assert.equal(snap.invoices[0].side, 'PURCHASE');
  assert.equal(snap.invoices[0].total_cents, 12000);
  assert.equal(snap.invoices[0].has_document, false);
  assert.equal(snap.payments[0].applied_cents, 0);
  const rules = new Set(reviewLedger(snap).proposals.map(p => p.rule));
  assert.ok(rules.has('PAYMENT_NOT_MATCHED') && rules.has('MISSING_DOCUMENT') && rules.has('ENTRY_UNBALANCED'));
});

test('QuickBooks reader maps bills and journal entries and reports what it cannot see', async () => {
  const fetchFn = async (url: string) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('query') || '');
    const entity = /from (\w+)/.exec(q)?.[1] || '';
    const bodies: Record<string, unknown> = {
      Account: [{ Id: '1', Name: 'Bank', Classification: 'Asset' }],
      TaxRate: [{ Id: 'T1', RateValue: 10 }],
      Bill: [{ Id: 'b1', DocNumber: '7', TxnDate: '2026-03-01', DueDate: '2026-03-30', VendorRef: { name: 'V' }, TotalAmt: 110, Balance: 110, TxnTaxDetail: { TotalTax: 10 }, Line: [{ Amount: 100, Description: 'x', DetailType: 'AccountBasedExpenseLineDetail' }] }],
      Invoice: [],
      JournalEntry: [{ Id: 'j1', TxnDate: '2026-03-05', Line: [{ Amount: 5, JournalEntryLineDetail: { PostingType: 'Debit', AccountRef: { value: '1' } } }, { Amount: 4, JournalEntryLineDetail: { PostingType: 'Credit', AccountRef: { value: '2' } } }] }]
    };
    return { ok: true, status: 200, json: async () => ({ QueryResponse: { [entity]: bodies[entity] || [] } }) };
  };
  const snap = await new QuickBooksLedgerSource({ fetchFn, access_token: 'tok', realm_id: '12345678', sandbox: true }).snapshot({ from: '2026-01-01', to: '2026-12-31' });
  assert.equal(snap.invoices[0].net_cents, 10000);
  assert.equal(snap.entries[0].rows[0].debit_cents, 500);
  const review = reviewLedger(snap);
  assert.ok(review.proposals.some(p => p.rule === 'ENTRY_UNBALANCED'));
  assert.ok(review.checks_not_run.some(c => /attached documents/i.test(c)));
  assert.throws(() => new QuickBooksLedgerSource({ fetchFn, access_token: 't', realm_id: 'abc' }), /looks wrong/);
});

test('DATEV file pairs a balanced journal into Konto/Gegenkonto rows and refuses an unbalanced one', () => {
  const journal: JournalView = {
    status: 'PROPOSED_NOT_POSTED', account_map: 'x', balanced: true, skipped: [], account_totals: [], notice: '',
    lines: [
      { transaction_id: 't1', date: '2026-03-03', account_code: '4400', account_name: 'Exp', debit_cents: 10000, credit_cents: 0, memo: 'Rent' },
      { transaction_id: 't1', date: '2026-03-03', account_code: '1576', account_name: 'VAT', debit_cents: 1900, credit_cents: 0, memo: 'Rent VAT' },
      { transaction_id: 't1', date: '2026-03-03', account_code: '1200', account_name: 'Bank', debit_cents: 0, credit_cents: 11900, memo: 'Rent' }
    ]
  };
  const opts = { consultant_number: '1001', client_number: '10001', fiscal_year_start: '2026-01-01', label: 'FinClose', generated_at: new Date('2026-10-31T10:00:00Z') };
  const file = datevBuchungsstapel(journal, opts);
  const lines = file.trim().split('\r\n');
  assert.ok(lines[0].startsWith('"EXTF";700;21;"Buchungsstapel"'));
  const data = lines.slice(2).map(l => l.split(';'));
  assert.equal(data.length, 2);
  assert.deepEqual(data.map(r => r[0]), ['100,00', '19,00']);
  assert.deepEqual(data.map(r => [r[6], r[7]]), [['4400', '1200'], ['1576', '1200']]);
  assert.throws(() => datevBuchungsstapel({ ...journal, balanced: false }, opts), /does not balance/);
});
