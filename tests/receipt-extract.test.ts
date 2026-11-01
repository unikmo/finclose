import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredOcr, extractReceiptFields, matchReceipt, readReceipt, type OcrEngine } from '../lib/receipt-extract.ts';
import { InMemoryDocumentStore } from '../lib/document-store.ts';
import { readDocument, uploadDocument } from '../lib/document-intake.ts';
import { extractPdfPlainText } from '../lib/pdf-text.ts';
import { makeTextPdf } from './fixtures/make-pdf.ts';

const RECEIPT = [
  'Rimi Eesti Food AS',
  'Receipt 2026-03-14',
  'Milk 1,89',
  'Coffee 6,50',
  'Subtotal 8,39',
  'VAT 24% 2,01',
  'TOTAL EUR 10,40'
].join('\n');

test('reads vendor, date, total, VAT and currency from receipt text', () => {
  const f = extractReceiptFields(RECEIPT, 'PDF_TEXT');
  assert.equal(f.vendor, 'Rimi Eesti Food AS');
  assert.equal(f.date, '2026-03-14');
  assert.equal(f.total_cents, 1040);
  assert.equal(f.total_is_guess, false);
  assert.equal(f.vat_cents, 201);
  assert.equal(f.vat_rate, 24);
  assert.equal(f.currency, 'EUR');
});

test('the subtotal and VAT lines are never mistaken for the total', () => {
  const f = extractReceiptFields('Shop\nSubtotal 100,00\nVAT 22% 22,00\nTotal 122,00\nVAT reg no EE123456789', 'OCR');
  assert.equal(f.total_cents, 12200);
  assert.equal(f.vat_cents, 2200);
});

test('with no total line the largest amount is used and marked as a guess', () => {
  const f = extractReceiptFields('Cafe\nLatte 3,20\nCake 4,10', 'OCR');
  assert.equal(f.total_cents, 410);
  assert.equal(f.total_is_guess, true);
});

test('Estonian and German total words, EU and US number formats, invoice numbers', () => {
  assert.equal(extractReceiptFields('Arve nr ARV-2026/17\nSumma kokku 1 234,50', 'PDF_TEXT').total_cents, 123450);
  assert.equal(extractReceiptFields('Arve nr ARV-2026/17\nSumma kokku 1 234,50', 'PDF_TEXT').invoice_number, 'ARV-2026/17');
  assert.equal(extractReceiptFields('Rechnung 4711\nGesamtbetrag 1.234,50', 'PDF_TEXT').total_cents, 123450);
  assert.equal(extractReceiptFields('Invoice #A-77\nTotal due $1,234.50', 'PDF_TEXT').total_cents, 123450);
});

test('a VAT figure bigger than the total is dropped as a misread', () => {
  assert.equal(extractReceiptFields('X\nVAT 500,00\nTotal 10,00', 'OCR').vat_cents, null);
});

test('matching a receipt to its bank line', () => {
  const f = extractReceiptFields(RECEIPT, 'PDF_TEXT');
  assert.deepEqual(matchReceipt(f, { amount_cents: -1040, date: '2026-03-14' }), { amount: 'MATCHES', date: 'SAME_DAY' });
  assert.deepEqual(matchReceipt(f, { amount_cents: -1100, date: '2026-03-18' }), { amount: 'DIFFERS', date: 'WITHIN_7_DAYS' });
  assert.equal(matchReceipt(f, { amount_cents: -1040, date: '2026-05-01' }).date, 'FAR');
  assert.deepEqual(matchReceipt({ ...f, total_cents: null, date: null }, { amount_cents: -1, date: '2026-03-14' }), { amount: 'UNKNOWN', date: 'UNKNOWN' });
});

test('photos need an OCR engine; with one, its text is read; failures are explained, not thrown', async () => {
  const noPdf = async () => '';
  const none = await readReceipt(Buffer.from('img'), 'image/jpeg', null, noPdf);
  assert.ok('unreadable' in none && /OCR program/.test(none.unreadable));
  const engine: OcrEngine = { recognise: async () => RECEIPT };
  const read = await readReceipt(Buffer.from('img'), 'image/jpeg', engine, noPdf);
  assert.ok('fields' in read && read.fields.source === 'OCR' && read.fields.total_cents === 1040);
  const broken: OcrEngine = { recognise: async () => { throw new Error('OCR failed: spawn tesseract ENOENT'); } };
  const failed = await readReceipt(Buffer.from('img'), 'image/png', broken, noPdf);
  assert.ok('unreadable' in failed && /ENOENT/.test(failed.unreadable));
  const blank: OcrEngine = { recognise: async () => '  ' };
  assert.ok('unreadable' in await readReceipt(Buffer.from('img'), 'image/png', blank, noPdf));
});

test('configuredOcr needs a path and safe language codes', () => {
  assert.equal(configuredOcr({}), null);
  assert.ok(configuredOcr({ FINCLOSE_TESSERACT_PATH: '/usr/bin/tesseract' }));
  assert.ok(configuredOcr({ FINCLOSE_TESSERACT_PATH: '/usr/bin/tesseract', FINCLOSE_OCR_LANGS: 'eng+est' }));
  assert.equal(configuredOcr({ FINCLOSE_TESSERACT_PATH: '/usr/bin/tesseract', FINCLOSE_OCR_LANGS: 'eng; rm -rf /' }), null);
});

test('readDocument: a text PDF receipt is read; a quarantined or foreign one is not opened', async () => {
  const store = new InMemoryDocumentStore();
  const lines = ['Rimi Eesti Food AS', 'Receipt 2026-03-14', 'VAT 24% 2,01', 'TOTAL EUR 10,40'];
  const pdf = makeTextPdf([lines.map((text, i) => ({ x: 50, y: 700 - i * 14, text }))]);
  const clean = { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const };
  const up = await uploadDocument(store, { company_id: 'c1', organization_id: 'o', actor: { user_id: 'u' }, filename: 'r.pdf', bytes: pdf }, clean);
  const read = await readDocument(store, up.record.document_id, 'c1', null, extractPdfPlainText);
  assert.equal(read.extracted?.total_cents, 1040);
  assert.equal(read.extracted?.source, 'PDF_TEXT');
  assert.equal(read.status, 'CLEAN');
  assert.equal((await store.get(up.record.document_id))?.extracted?.vat_cents, 201, 'stored on the record');

  const held = await uploadDocument(store, { company_id: 'c1', organization_id: 'o', actor: { user_id: 'u' }, filename: 'q.pdf', bytes: Buffer.from('%PDF-1.4 q') }, { status: 'QUARANTINED', security_review_status: 'AWAITING_SCANNER' });
  await assert.rejects(() => readDocument(store, held.record.document_id, 'c1', null, extractPdfPlainText), /quarantined/);
  await assert.rejects(() => readDocument(store, up.record.document_id, 'other', null, extractPdfPlainText), /not found/);
});

test('a scanned PDF receipt is reported as unreadable, with the reason kept on the record', async () => {
  const store = new InMemoryDocumentStore();
  const blank = makeTextPdf([[]]);
  const clean = { status: 'RECEIVED' as const, security_review_status: 'NOT_REQUIRED_LAB' as const };
  const up = await uploadDocument(store, { company_id: 'c1', organization_id: 'o', actor: { user_id: 'u' }, filename: 'scan.pdf', bytes: blank }, clean);
  const read = await readDocument(store, up.record.document_id, 'c1', null, extractPdfPlainText);
  assert.equal(read.extracted, undefined);
  assert.match(read.read_note || '', /no text layer/);
});
