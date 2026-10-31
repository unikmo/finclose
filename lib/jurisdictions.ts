// Which countries the preparation engines know, and what is known about each one's VAT.
//
// Confirmed means checked against the tax authority's own pages. Estonia's standard rate was (see
// categorisation-engine history); everything else here is UNVERIFIED: written from general
// knowledge, not read from the authority's site, and shown as such wherever it reaches a screen or
// an export. A rate in this table only ever fills the "standard rate" suggestion for a domestic
// purchase or sale; a reviewer chooses any other rate, from the list of rates allowed here.
// The United States has no VAT: state sales tax is not handled at all.

export type JurisdictionCode = 'EE' | 'LV' | 'LT' | 'FI' | 'DE' | 'GB' | 'US' | 'GENERIC';

export type Jurisdiction = {
  code: JurisdictionCode;
  name: string;
  has_vat: boolean;
  vat_status: 'STANDARD_RATE_CONFIRMED' | 'UNVERIFIED' | 'NOT_APPLICABLE';
  standard_rates: { from: string; rate: number }[]; // ascending by date; before the first entry there is no rate
  allowed_rates: number[]; // what a reviewer may choose
  authority: string;
  note: string;
};

const unverified = 'Rates are unverified: not checked against the tax authority\'s own site. Confirm before use.';

export const JURISDICTIONS: Record<JurisdictionCode, Jurisdiction> = {
  EE: {
    code: 'EE', name: 'Estonia', has_vat: true, vat_status: 'STANDARD_RATE_CONFIRMED',
    standard_rates: [{ from: '2024-01-01', rate: 22 }, { from: '2025-07-01', rate: 24 }],
    allowed_rates: [24, 22, 13, 9, 0], authority: 'Tax and Customs Board (EMTA)',
    note: 'The standard rate matches EMTA\'s wording. The scope of the reduced rates (13%, 9%) is unconfirmed, so the engine never picks one itself.'
  },
  LV: {
    code: 'LV', name: 'Latvia', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [{ from: '2012-07-01', rate: 21 }], allowed_rates: [21, 12, 5, 0], authority: 'State Revenue Service (VID)', note: unverified
  },
  LT: {
    code: 'LT', name: 'Lithuania', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [{ from: '2009-09-01', rate: 21 }], allowed_rates: [21, 9, 5, 0], authority: 'State Tax Inspectorate (VMI)', note: unverified
  },
  FI: {
    code: 'FI', name: 'Finland', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [{ from: '2013-01-01', rate: 24 }, { from: '2024-09-01', rate: 25.5 }], allowed_rates: [25.5, 24, 14, 10, 0], authority: 'Finnish Tax Administration (Vero)', note: unverified
  },
  DE: {
    code: 'DE', name: 'Germany', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [{ from: '2007-01-01', rate: 19 }, { from: '2020-07-01', rate: 16 }, { from: '2021-01-01', rate: 19 }], allowed_rates: [19, 16, 7, 5, 0], authority: 'Federal Central Tax Office / state tax offices', note: unverified
  },
  GB: {
    code: 'GB', name: 'United Kingdom', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [{ from: '2011-01-04', rate: 20 }], allowed_rates: [20, 5, 0], authority: 'HM Revenue & Customs (HMRC)', note: unverified
  },
  US: {
    code: 'US', name: 'United States', has_vat: false, vat_status: 'NOT_APPLICABLE',
    standard_rates: [], allowed_rates: [], authority: 'State revenue departments',
    note: 'The United States has no VAT. State and local sales tax depends on where the company has a presence and what it sells, and is not handled here.'
  },
  GENERIC: {
    code: 'GENERIC', name: 'Other country', has_vat: true, vat_status: 'UNVERIFIED',
    standard_rates: [], allowed_rates: [], authority: 'your local tax authority', note: 'No tax rates are applied. An accountant sets any VAT.'
  }
};

export function normaliseJurisdiction(input: unknown): JurisdictionCode {
  const code = String(input ?? '').trim().toUpperCase();
  const alias = code === 'UK' ? 'GB' : code;
  return alias in JURISDICTIONS ? (alias as JurisdictionCode) : 'GENERIC';
}

export function isKnownJurisdiction(input: unknown): boolean {
  const code = String(input ?? '').trim().toUpperCase();
  return (code === 'UK' ? 'GB' : code) in JURISDICTIONS;
}

export function standardVatRate(code: JurisdictionCode, isoDate: string): number | null {
  let rate: number | null = null;
  for (const step of JURISDICTIONS[code].standard_rates) if (isoDate >= step.from) rate = step.rate;
  return rate;
}

export function listJurisdictions(): { code: JurisdictionCode; name: string; has_vat: boolean; vat_status: Jurisdiction['vat_status'] }[] {
  return Object.values(JURISDICTIONS).map(j => ({ code: j.code, name: j.name, has_vat: j.has_vat, vat_status: j.vat_status }));
}
