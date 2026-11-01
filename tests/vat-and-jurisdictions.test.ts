import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPackStore } from '../lib/pack-store.ts';
import { InMemoryDocumentStore } from '../lib/document-store.ts';
import { uploadDocument } from '../lib/document-intake.ts';
import { createPack, recordCorrection, recordOwnerAnswer } from '../lib/pack-lifecycle.ts';
import { buildRulePack } from '../lib/categorisation-engine.ts';
import { JURISDICTIONS, isKnownJurisdiction, normaliseJurisdiction, standardVatRate } from '../lib/jurisdictions.ts';
import { allowedVatRates, summariseVat } from '../lib/vat-summary.ts';
import { buildVatReturnWorksheet, vatReturnCsv } from '../lib/vat-return.ts';
import { buildJournal } from '../lib/chart-of-accounts.ts';
import { prepareStatementReview } from '../lib/statement-prep.ts';

const actor = { user_id: 'u1' };
const received = { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const };
const CSV = [
  'date,amount,counterparty,description',
  '2026-03-03,-124.00,Telia Eesti,Mobile March',
  '2026-03-05,-50.00,Vercel Inc,Hosting',
  '2026-03-10,1220.00,Client OU,Invoice 12',
  '2026-03-12,500.00,Foreign Client Ltd,Invoice 13 export'
].join('\n');
const base = { company_name: 'Test OU', jurisdiction: 'EE', vat_registered: true, period_start: '2026-03-01', period_end: '2026-03-31', csv_text: CSV };

test('jurisdictions: standard rates by date, aliases, unknown codes', () => {
  assert.equal(standardVatRate('EE', '2025-07-01'), 24);
  assert.equal(standardVatRate('EE', '2023-12-31'), null);
  assert.equal(standardVatRate('FI', '2024-08-31'), 24);
  assert.equal(standardVatRate('FI', '2024-09-01'), 25.5);
  assert.equal(standardVatRate('DE', '2020-08-01'), 16);
  assert.equal(standardVatRate('DE', '2021-02-01'), 19);
  assert.equal(standardVatRate('US', '2026-03-01'), null);
  assert.equal(normaliseJurisdiction('uk'), 'GB');
  assert.equal(normaliseJurisdiction('narnia'), 'GENERIC');
  assert.equal(isKnownJurisdiction('narnia'), false);
  assert.equal(JURISDICTIONS.EE.vat_status, 'STANDARD_RATE_CONFIRMED');
  for (const code of ['LV', 'LT', 'FI', 'DE', 'GB'] as const) assert.equal(JURISDICTIONS[code].vat_status, 'UNVERIFIED', 'only Estonia is confirmed');
});

test('each country gets its own standard rate; the US and unknown countries get none', () => {
  const tx = { transaction_id: 't', date: '2026-03-03', amount_cents: -12400, currency: 'EUR', description: 'Telia', counterparty: 'Telia', reference: '', source_row: 1, possible_duplicate_of: null };
  const rate = (code: string) => {
    const pack = buildRulePack(code);
    return pack.vatRateFor(tx.date, 'INPUT_VAT_DOMESTIC');
  };
  assert.deepEqual(['EE', 'LV', 'LT', 'FI', 'DE', 'GB', 'US', 'GENERIC'].map(rate), [24, 21, 21, 25.5, 19, 20, null, null]);
  assert.equal(buildRulePack('LV').id, 'rulepack-lv-v0');
  assert.equal(buildRulePack('EE').id, 'rulepack-ee-v0', 'the Estonian id is unchanged');
});

test('a pack for another country warns that its rates are unverified; the US drops VAT with a reason', () => {
  const lv = prepareStatementReview({ ...base, jurisdiction: 'LV' });
  assert.ok(lv.intake.warnings.some(w => /unverified/.test(w)));
  assert.equal(lv.pack.entries.find(e => /Telia/.test(e.counterparty))?.vat_rate, 21);
  const us = prepareStatementReview({ ...base, jurisdiction: 'US' });
  assert.ok(us.intake.warnings.some(w => /no VAT/.test(w)));
  assert.ok(us.pack.entries.every(e => e.vat_treatment === 'NOT_VAT_REGISTERED'));
  assert.throws(() => prepareStatementReview({ ...base, jurisdiction: 'Narnia' }), /jurisdiction must be one of/);
  assert.equal(prepareStatementReview({ ...base, jurisdiction: undefined, vat_registered: false }).pack.company.jurisdiction, 'GENERIC');
});

test('allowed reviewer rates follow the country', () => {
  assert.deepEqual(allowedVatRates('EE'), [24, 22, 13, 9, 0]);
  assert.ok(allowedVatRates('FI').includes(25.5));
  assert.deepEqual(allowedVatRates('US'), []);
  assert.deepEqual(allowedVatRates('GENERIC'), []);
});

async function scenario() {
  const packs = new InMemoryPackStore();
  const docs = new InMemoryDocumentStore();
  const created = await createPack(packs, { company_id: 'c1', organization_id: 'o', actor, request: base });
  const id = created.record.pack_id;
  const byName = (r: typeof created.result, name: RegExp) => r.pack.entries.find(e => name.test(e.counterparty))!;
  const doc = async (n: string) => (await uploadDocument(docs, { company_id: 'c1', organization_id: 'o', actor, filename: `${n}.pdf`, bytes: Buffer.from(`%PDF-1.4 ${n}`) }, received)).record.document_id;

  // Purchase invoice for the Telia payment: 124.00 gross at 24% = 24.00 input VAT.
  let r = await recordOwnerAnswer(packs, id, 'c1', actor, { transaction_id: byName(created.result, /Telia/).transaction_id, document_ids: [await doc('telia')] }, docs);
  // Sales invoice for the domestic sale: the reviewer sets "VAT charged on a local sale" at 22%. 1220.00 gross = 1000.00 net + 220.00 VAT.
  const sale = byName(r.result, /Client OU/).transaction_id;
  r = await recordOwnerAnswer(packs, id, 'c1', actor, { transaction_id: sale, document_ids: [await doc('sale')] }, docs);
  r = await recordCorrection(packs, id, 'c1', actor, { transaction_id: sale, category_code: 'REVENUE', vat_treatment: 'OUTPUT_VAT_DOMESTIC', vat_rate: 22 });
  // The foreign sale: revenue, no VAT charged.
  const exportSale = byName(r.result, /Foreign Client/).transaction_id;
  r = await recordCorrection(packs, id, 'c1', actor, { transaction_id: exportSale, category_code: 'REVENUE', vat_treatment: 'NO_VAT' });
  return r;
}

test('sales VAT is counted only with a reviewer-set rate and a linked invoice', async () => {
  const r = await scenario();
  const vat = summariseVat(r.result.pack);
  assert.equal(vat.domestic_output_by_rate.length, 1);
  assert.deepEqual(
    { rate: vat.domestic_output_by_rate[0].rate, net: vat.domestic_output_by_rate[0].net_cents, vat: vat.domestic_output_by_rate[0].vat_cents },
    { rate: 22, net: 100000, vat: 22000 }
  );
  assert.deepEqual(vat.sales_without_output_vat, { count: 1, gross_cents: 50000 });
});

test('a sale marked as charging VAT but without an invoice is listed, not counted', async () => {
  const packs = new InMemoryPackStore();
  const created = await createPack(packs, { company_id: 'c1', organization_id: 'o', actor, request: base });
  const sale = created.result.pack.entries.find(e => /Client OU/.test(e.counterparty))!.transaction_id;
  const r = await recordCorrection(packs, created.record.pack_id, 'c1', actor, { transaction_id: sale, category_code: 'REVENUE', vat_treatment: 'OUTPUT_VAT_DOMESTIC', vat_rate: 24 });
  const vat = summariseVat(r.result.pack);
  assert.equal(vat.domestic_output_by_rate.length, 0);
  assert.equal(vat.domestic_output_unsupported.length, 1);
  assert.match(vat.domestic_output_unsupported[0].reason, /no sales invoice/);
});

test('the VAT worksheet nets output against input and lists what it could not count', async () => {
  const r = await scenario();
  const w = buildVatReturnWorksheet(r.result.pack, summariseVat(r.result.pack))!;
  assert.equal(w.status, 'WORKSHEET_NOT_A_FILING');
  assert.equal(w.kmd_mapping, 'NOT_MAPPED');
  assert.equal(w.totals.output_vat_cents - w.totals.input_vat_cents, w.totals.net_payable_cents);
  // output: 220.00 on sales + reverse charge on Vercel (50.00 at 24% = 12.00); input: 24.00 Telia + the same 12.00 reverse charge.
  assert.equal(w.sections.output_vat[0].vat_cents, 22000);
  assert.equal(w.sections.reverse_charge_output?.vat_cents, 1200);
  assert.equal(w.sections.input_vat[0].vat_cents, 2400);
  assert.equal(w.totals.net_payable_cents, 22000 - 2400);
  assert.equal(w.totals.direction, 'PAYABLE');
  assert.ok(w.assumptions.some(a => /fully deductible/.test(a)));
  assert.ok(w.assumptions.some(a => /not a filing/.test(a)));
  const csv = vatReturnCsv(w);
  assert.match(csv, /"NET"/);
  assert.match(csv, /WORKSHEET_NOT_A_FILING/);
});

test('no worksheet for a company that is not VAT-registered', async () => {
  const packs = new InMemoryPackStore();
  const created = await createPack(packs, { company_id: 'c1', organization_id: 'o', actor, request: { ...base, vat_registered: false } });
  assert.equal(buildVatReturnWorksheet(created.result.pack, summariseVat(created.result.pack)), null);
});

test('the journal splits output VAT out of the sale, and still balances', async () => {
  const r = await scenario();
  const journal = buildJournal(r.result.pack);
  assert.equal(journal.balanced, true);
  const vatLines = journal.lines.filter(l => /output VAT/.test(l.memo));
  assert.equal(vatLines.length, 1);
  assert.equal(vatLines[0].credit_cents, 22000);
  const revenue = journal.lines.find(l => l.account_code === '4000' && /Client OU/.test(l.memo));
  assert.equal(revenue?.credit_cents, 100000);
});
