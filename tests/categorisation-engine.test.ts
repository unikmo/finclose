import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRulePack, categoriseTransaction, learnFromCorrection, merchantKey } from '../lib/categorisation-engine.ts';

const ee = buildRulePack('EE');

function tx(partial: { counterparty?: string; description?: string; reference?: string; amount_cents: number; date?: string }) {
  return {
    transaction_id: `tx_${Math.abs(partial.amount_cents)}_${partial.counterparty || partial.description}`,
    date: partial.date || '2026-03-01',
    currency: 'EUR',
    counterparty: partial.counterparty || '',
    description: partial.description || '',
    reference: partial.reference || '',
    source_row: 2,
    possible_duplicate_of: null,
    amount_cents: partial.amount_cents
  };
}

test('known SaaS vendor is a software expense with reverse charge when VAT-registered', () => {
  const result = categoriseTransaction(tx({ counterparty: 'Google Ireland Ltd', description: 'GSUITE', amount_cents: -1200 }), ee, [], { vat_registered: true });
  assert.equal(result.category_code, 'SOFTWARE');
  assert.equal(result.vat_treatment, 'REVERSE_CHARGE_FOREIGN_SERVICE');
  assert.equal(result.vat_rate, 24);
  assert.equal(result.needs_review, false);
  assert.equal(result.evidence_required, true);
});

test('an unregistered company gets no VAT coding and a note', () => {
  const result = categoriseTransaction(tx({ counterparty: 'Slack', amount_cents: -800 }), ee);
  assert.equal(result.vat_treatment, 'NOT_VAT_REGISTERED');
  assert.equal(result.vat_rate, null);
  assert.ok(result.notes.some(note => note.includes('not marked VAT-registered')));
});

test('the VAT rate follows the transaction date', () => {
  const before = categoriseTransaction(tx({ counterparty: 'Telia', amount_cents: -2500, date: '2025-05-10' }), ee, [], { vat_registered: true });
  const after = categoriseTransaction(tx({ counterparty: 'Telia', amount_cents: -2500, date: '2025-08-10' }), ee, [], { vat_registered: true });
  assert.equal(before.vat_rate, 22);
  assert.equal(after.vat_rate, 24);
});

test('direction matters: the same word is a fee going out and not a fee coming in', () => {
  const fee = categoriseTransaction(tx({ description: 'Monthly fee', amount_cents: -500 }), ee);
  assert.equal(fee.category_code, 'BANK_FEES');
  const incoming = categoriseTransaction(tx({ description: 'Monthly fee refund', amount_cents: 500 }), ee);
  assert.equal(incoming.category_code, 'SUSPENSE_IN');
});

test('unknown merchants go to suspense with zero confidence and need review', () => {
  const result = categoriseTransaction(tx({ counterparty: 'Zxqv Trading', amount_cents: -4200 }), ee);
  assert.equal(result.category_code, 'SUSPENSE_OUT');
  assert.equal(result.confidence, 0);
  assert.equal(result.needs_review, true);
  assert.equal(result.reason, 'FALLBACK_SUSPENSE');
});

test('low-confidence matches are flagged for review, not auto-accepted', () => {
  const result = categoriseTransaction(tx({ counterparty: 'Amazon EU', amount_cents: -3000 }), ee);
  assert.equal(result.category_code, 'OFFICE_SUPPLIES');
  assert.equal(result.needs_review, true);
});

test('the most specific high-confidence rule wins', () => {
  const ads = categoriseTransaction(tx({ counterparty: 'Google Ads', amount_cents: -9000 }), ee);
  assert.equal(ads.category_code, 'ADVERTISING');
  const stripeFee = categoriseTransaction(tx({ description: 'Stripe fee', amount_cents: -300 }), ee);
  assert.equal(stripeFee.category_code, 'BANK_FEES');
  const stripePayout = categoriseTransaction(tx({ counterparty: 'Stripe', amount_cents: 120000 }), ee);
  assert.equal(stripePayout.category_code, 'REVENUE_PAYOUT');
  assert.equal(stripePayout.needs_review, true);
});

test('taxes, dividends and own transfers are out of VAT scope', () => {
  assert.equal(categoriseTransaction(tx({ counterparty: 'Maksu- ja Tolliamet', amount_cents: -50000 }), ee, [], { vat_registered: true }).vat_treatment, 'OUT_OF_SCOPE');
  const dividend = categoriseTransaction(tx({ description: 'Dividend payout', amount_cents: -100000 }), ee, [], { vat_registered: true });
  assert.equal(dividend.category_code, 'DIVIDENDS');
  assert.ok(dividend.notes.some(note => note.includes('tax due')));
  assert.equal(categoriseTransaction(tx({ description: 'Transfer to savings', amount_cents: -100000 }), ee).category_code, 'TRANSFER');
});

test('an accountant correction becomes a learned rule that outranks built-in rules', () => {
  const source = tx({ counterparty: 'Zxqv Trading OÜ', amount_cents: -4200 });
  const rule = learnFromCorrection(source, 'PROFESSIONAL_FEES', 'NEEDS_INVOICE_REVIEW');
  assert.ok(rule);
  const later = categoriseTransaction(tx({ counterparty: 'ZXQV TRADING OU', amount_cents: -9900, date: '2026-04-02' }), ee, [rule!]);
  assert.equal(later.category_code, 'PROFESSIONAL_FEES');
  assert.equal(later.reason, 'LEARNED_RULE');
  assert.equal(later.confidence, 0.95);
  // direction is part of the key: an incoming payment from the same name is not auto-classified
  const incoming = categoriseTransaction(tx({ counterparty: 'Zxqv Trading OÜ', amount_cents: 5000 }), ee, [rule!]);
  assert.equal(incoming.reason, 'FALLBACK_SUSPENSE');
});

test('merchant key ignores case, diacritics, digits and punctuation', () => {
  assert.equal(merchantKey({ counterparty: 'Café  Müller 12345, Tallinn', description: '' }), 'cafe muller tallinn');
  assert.equal(merchantKey({ counterparty: '', description: '' }), '');
});
