import type { ProposedEntry, ReviewPack } from './review-pack';
import { JURISDICTIONS, normaliseJurisdiction } from './jurisdictions';

// An ESTIMATE of VAT position from bank lines and owner documents, for the
// accountant to check. It is not a VAT return and does not produce the Estonian
// KMD form. Bank lines carry gross amounts only, so every figure is derived and
// labelled as such. Input VAT is counted only where a document supports it.

// Rates a reviewer may choose per transaction. Estonia: 24% standard since 2025-07-01 (22% from
// 2024-01-01); 13% accommodation; 9% books, press and some medicines. The reduced-rate scope was
// read from secondary guides, not from the Tax and Customs Board, so it is UNCONFIRMED: the
// engine never picks a reduced rate itself.
export const REDUCED_RATE_SCOPE_CONFIRMED = false;

export function allowedVatRates(jurisdiction: string): number[] {
  return JURISDICTIONS[normaliseJurisdiction(jurisdiction)].allowed_rates;
}

type RateRow = { rate: number; gross_cents: number; net_cents: number; vat_cents: number; count: number };

export type VatSummary = {
  status: 'ESTIMATE_NOT_A_VAT_RETURN';
  vat_registered: boolean;
  reduced_rate_scope_confirmed: boolean;
  domestic_input_by_rate: RateRow[];
  domestic_input_unsupported: { transaction_id: string; gross_cents: number; reason: string }[];
  // Sales that charged VAT: only where a reviewer set the treatment, a rate, and an invoice is linked.
  domestic_output_by_rate: RateRow[];
  domestic_output_unsupported: { transaction_id: string; gross_cents: number; reason: string }[];
  // Revenue received with no VAT charged (export, EU business customer, exempt): the accountant classifies it.
  sales_without_output_vat: { count: number; gross_cents: number };
  reverse_charge: { base_cents: number; vat_cents: number; count: number; without_document: number; unrated: number };
  needs_invoice_review: { count: number; gross_cents: number };
  sales_bank_receipts: { count: number; gross_cents: number; note: string };
  foreign_currency_excluded: number;
  notes: string[];
};

const split = (gross: number, rate: number) => {
  const vat = Math.round((gross * rate) / (100 + rate));
  return { net: gross - vat, vat };
};

export function summariseVat(pack: ReviewPack): VatSummary {
  const registered = pack.company.vat_registered;
  const base = pack.summary.base_currency;
  const out: VatSummary = {
    status: 'ESTIMATE_NOT_A_VAT_RETURN',
    vat_registered: registered,
    reduced_rate_scope_confirmed: REDUCED_RATE_SCOPE_CONFIRMED,
    domestic_input_by_rate: [],
    domestic_input_unsupported: [],
    domestic_output_by_rate: [],
    domestic_output_unsupported: [],
    sales_without_output_vat: { count: 0, gross_cents: 0 },
    reverse_charge: { base_cents: 0, vat_cents: 0, count: 0, without_document: 0, unrated: 0 },
    needs_invoice_review: { count: 0, gross_cents: 0 },
    sales_bank_receipts: { count: 0, gross_cents: 0, note: 'Output VAT on sales depends on the invoice and customer, so it cannot be read from a bank receipt.' },
    foreign_currency_excluded: 0,
    notes: []
  };
  if (!registered) {
    out.notes.push('Company is not marked VAT-registered: no VAT is estimated.');
    return out;
  }
  const byRate = new Map<number, RateRow>();
  const outputByRate = new Map<number, RateRow>();
  for (const e of pack.entries as ProposedEntry[]) {
    if (e.currency !== base) {
      out.foreign_currency_excluded += 1;
      continue;
    }
    const gross = Math.abs(e.amount_cents);
    if (e.vat_treatment === 'INPUT_VAT_DOMESTIC' && e.amount_cents < 0) {
      if (e.vat_rate === null) out.domestic_input_unsupported.push({ transaction_id: e.transaction_id, gross_cents: gross, reason: 'no VAT rate known for this date' });
      else if (e.document_ids.length === 0) out.domestic_input_unsupported.push({ transaction_id: e.transaction_id, gross_cents: gross, reason: 'no invoice linked: input VAT not claimable yet' });
      else {
        const { net, vat } = split(gross, e.vat_rate);
        const row = byRate.get(e.vat_rate) || { rate: e.vat_rate, gross_cents: 0, net_cents: 0, vat_cents: 0, count: 0 };
        row.gross_cents += gross;
        row.net_cents += net;
        row.vat_cents += vat;
        row.count += 1;
        byRate.set(e.vat_rate, row);
      }
    } else if (e.vat_treatment === 'OUTPUT_VAT_DOMESTIC' && e.amount_cents > 0) {
      if (e.vat_rate === null) out.domestic_output_unsupported.push({ transaction_id: e.transaction_id, gross_cents: gross, reason: 'no VAT rate chosen for this sale' });
      else if (e.document_ids.length === 0) out.domestic_output_unsupported.push({ transaction_id: e.transaction_id, gross_cents: gross, reason: 'no sales invoice linked: output VAT cannot be confirmed' });
      else {
        const { net, vat } = split(gross, e.vat_rate);
        const row = outputByRate.get(e.vat_rate) || { rate: e.vat_rate, gross_cents: 0, net_cents: 0, vat_cents: 0, count: 0 };
        row.gross_cents += gross;
        row.net_cents += net;
        row.vat_cents += vat;
        row.count += 1;
        outputByRate.set(e.vat_rate, row);
      }
    } else if (e.category_code === 'REVENUE' && e.amount_cents > 0 && (e.vat_treatment === 'NO_VAT' || e.vat_treatment === 'OUT_OF_SCOPE')) {
      out.sales_without_output_vat.count += 1;
      out.sales_without_output_vat.gross_cents += gross;
    } else if (e.vat_treatment === 'REVERSE_CHARGE_FOREIGN_SERVICE' && e.amount_cents < 0) {
      out.reverse_charge.count += 1;
      if (e.document_ids.length === 0) out.reverse_charge.without_document += 1;
      if (e.vat_rate === null) out.reverse_charge.unrated += 1;
      else {
        out.reverse_charge.base_cents += gross;
        out.reverse_charge.vat_cents += Math.round((gross * e.vat_rate) / 100);
      }
    } else if (e.vat_treatment === 'NEEDS_INVOICE_REVIEW') {
      if (e.amount_cents > 0) {
        out.sales_bank_receipts.count += 1;
        out.sales_bank_receipts.gross_cents += gross;
      } else {
        out.needs_invoice_review.count += 1;
        out.needs_invoice_review.gross_cents += gross;
      }
    }
  }
  out.domestic_input_by_rate = [...byRate.values()].sort((a, b) => b.rate - a.rate);
  out.domestic_output_by_rate = [...outputByRate.values()].sort((a, b) => b.rate - a.rate);
  out.notes.push('Reverse-charge: the same VAT is normally both output and input for a fully deductible buyer; the accountant confirms the reporting.');
  if (!REDUCED_RATE_SCOPE_CONFIRMED) out.notes.push('Reduced-rate scope (13%, 9%) is unconfirmed against the Tax and Customs Board; the engine only uses a reduced rate when a reviewer sets it.');
  return out;
}
