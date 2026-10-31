import type { ReviewPack } from './review-pack';
import type { VatSummary } from './vat-summary';
import { JURISDICTIONS, normaliseJurisdiction } from './jurisdictions';

// A VAT RETURN WORKSHEET for the period of a pack: the figures an accountant needs to fill in the
// return, laid out in FinClose's own lines. It is not a filing and it is not the country's form:
// no form-box numbers are used because FinClose has not checked them against the authority's current
// form (kmd_mapping stays NOT_MAPPED). Every figure comes from the bank lines and linked invoices
// in the pack; anything that could not be counted is listed rather than guessed.

export type VatReturnLine = { line: string; label: string; net_cents: number | null; vat_cents: number; count: number; basis: string };

export type VatReturnWorksheet = {
  status: 'WORKSHEET_NOT_A_FILING';
  kmd_mapping: 'NOT_MAPPED';
  jurisdiction: string;
  vat_status: string;
  period: { start: string; end: string };
  currency: string;
  sections: {
    output_vat: VatReturnLine[];
    reverse_charge_output: VatReturnLine | null;
    input_vat: VatReturnLine[];
    reverse_charge_input: VatReturnLine | null;
  };
  totals: { output_vat_cents: number; input_vat_cents: number; net_payable_cents: number; direction: 'PAYABLE' | 'REFUNDABLE' | 'NIL' };
  sales_without_output_vat: { count: number; gross_cents: number };
  not_counted: { what: string; count: number; gross_cents: number }[];
  assumptions: string[];
};

export function buildVatReturnWorksheet(pack: ReviewPack, vat: VatSummary): VatReturnWorksheet | null {
  if (!pack.company.vat_registered) return null;
  const code = normaliseJurisdiction(pack.company.jurisdiction);
  const country = JURISDICTIONS[code];
  const output: VatReturnLine[] = vat.domestic_output_by_rate.map(r => ({
    line: `OUT-${r.rate}`, label: `Sales charging ${r.rate}% VAT`, net_cents: r.net_cents, vat_cents: r.vat_cents, count: r.count, basis: 'gross bank receipt split at the rate the reviewer set; invoice linked'
  }));
  const input: VatReturnLine[] = vat.domestic_input_by_rate.map(r => ({
    line: `IN-${r.rate}`, label: `Purchases with ${r.rate}% input VAT`, net_cents: r.net_cents, vat_cents: r.vat_cents, count: r.count, basis: 'gross bank payment split at the rate; invoice linked'
  }));
  const rcVat = vat.reverse_charge.vat_cents;
  const rcLine = (label: string, line: string): VatReturnLine | null => (vat.reverse_charge.count ? {
    line, label, net_cents: vat.reverse_charge.base_cents, vat_cents: rcVat, count: vat.reverse_charge.count, basis: 'bank payment treated as the net value of a foreign service'
  } : null);

  const outputTotal = output.reduce((s, l) => s + l.vat_cents, 0) + rcVat;
  const inputTotal = input.reduce((s, l) => s + l.vat_cents, 0) + rcVat;
  const net = outputTotal - inputTotal;

  const notCounted: VatReturnWorksheet['not_counted'] = [];
  const add = (what: string, count: number, gross: number) => { if (count) notCounted.push({ what, count, gross_cents: gross }); };
  add('Local purchases with no invoice or no rate: input VAT not claimed', vat.domestic_input_unsupported.length, vat.domestic_input_unsupported.reduce((s, x) => s + x.gross_cents, 0));
  add('Sales marked as charging VAT but missing a rate or invoice: output VAT not counted', vat.domestic_output_unsupported.length, vat.domestic_output_unsupported.reduce((s, x) => s + x.gross_cents, 0));
  add('Receipts whose VAT treatment is not decided (need the sales invoice)', vat.sales_bank_receipts.count, vat.sales_bank_receipts.gross_cents);
  add('Payments that need their invoice checked', vat.needs_invoice_review.count, vat.needs_invoice_review.gross_cents);
  add('Foreign-currency lines left out (not converted)', vat.foreign_currency_excluded, 0);
  add('Foreign services with no rate known for the date', vat.reverse_charge.unrated, 0);

  const assumptions = [
    'Reverse charge is shown as equal output and input VAT, which holds only if the VAT is fully deductible. The accountant confirms this.',
    'Amounts come from bank payments, so VAT is derived from the gross amount and the rate, not read from the invoice.',
    `The VAT figures are not a filing. No form-box numbers are applied; the accountant transfers them to the ${country.name} return.`
  ];
  if (country.vat_status !== 'STANDARD_RATE_CONFIRMED') assumptions.push(`${country.name} VAT rates are ${country.vat_status === 'UNVERIFIED' ? 'unverified (not checked against ' + country.authority + ')' : 'not applicable'}.`);
  else assumptions.push(country.note);

  return {
    status: 'WORKSHEET_NOT_A_FILING',
    kmd_mapping: 'NOT_MAPPED',
    jurisdiction: code,
    vat_status: country.vat_status,
    period: pack.period,
    currency: pack.summary.base_currency,
    sections: { output_vat: output, reverse_charge_output: rcLine('Foreign services: VAT you account for (output side)', 'RC-OUT'), input_vat: input, reverse_charge_input: rcLine('Foreign services: matching deduction (input side)', 'RC-IN') },
    totals: { output_vat_cents: outputTotal, input_vat_cents: inputTotal, net_payable_cents: net, direction: net > 0 ? 'PAYABLE' : net < 0 ? 'REFUNDABLE' : 'NIL' },
    sales_without_output_vat: vat.sales_without_output_vat,
    not_counted: notCounted,
    assumptions
  };
}

const cell = (v: string | number) => {
  const text = String(v).replace(/"/g, '""');
  return `"${/^[=+\-@\t\r]/.test(text) ? "'" + text : text}"`;
};
const money = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));

export function vatReturnCsv(w: VatReturnWorksheet): string {
  const rows: (string | number)[][] = [['section', 'line', 'label', 'net', 'vat', 'count', 'basis']];
  const push = (section: string, l: VatReturnLine | null) => { if (l) rows.push([section, l.line, l.label, money(l.net_cents), money(l.vat_cents), l.count, l.basis]); };
  w.sections.output_vat.forEach(l => push('OUTPUT', l));
  push('OUTPUT', w.sections.reverse_charge_output);
  w.sections.input_vat.forEach(l => push('INPUT', l));
  push('INPUT', w.sections.reverse_charge_input);
  rows.push(['TOTAL', 'OUTPUT', 'Output VAT', '', money(w.totals.output_vat_cents), '', '']);
  rows.push(['TOTAL', 'INPUT', 'Input VAT', '', money(w.totals.input_vat_cents), '', '']);
  rows.push(['TOTAL', 'NET', `Net VAT ${w.totals.direction.toLowerCase()}`, '', money(w.totals.net_payable_cents), '', '']);
  rows.push(['INFO', 'SALES-NO-VAT', 'Sales with no VAT charged (gross)', money(w.sales_without_output_vat.gross_cents), '', w.sales_without_output_vat.count, 'accountant classifies: export, EU business customer, exempt']);
  w.not_counted.forEach(n => rows.push(['NOT COUNTED', '', n.what, money(n.gross_cents), '', n.count, '']));
  w.assumptions.forEach(a => rows.push(['ASSUMPTION', '', a, '', '', '', '']));
  rows.push(['STATUS', '', `${w.status}; period ${w.period.start} to ${w.period.end}; ${w.currency}`, '', '', '', '']);
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}
