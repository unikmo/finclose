import type { NormalisedBankTransaction } from './statement-intake';

// Rule-based transaction categorisation and VAT-treatment suggestions.
// Deterministic and explainable: every suggestion names the rule that produced
// it and carries a confidence. Nothing is posted anywhere; suggestions are
// PREPARED_NOT_APPROVED until an accountant accepts them. No AI is involved yet;
// an AI step can later propose rules, but it must still go through this shape.

export type CategoryKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'TAX' | 'EQUITY' | 'FINANCING' | 'SUSPENSE';

export type Category = { code: string; name: string; kind: CategoryKind };

export type VatTreatment =
  | 'NOT_VAT_REGISTERED' // company does not account for VAT; nothing to code
  | 'NO_VAT' // exempt or outside the VAT charge (e.g. bank fees)
  | 'OUT_OF_SCOPE' // taxes, transfers, equity movements
  | 'INPUT_VAT_DOMESTIC' // domestic purchase; input VAT only with a valid invoice
  | 'REVERSE_CHARGE_FOREIGN_SERVICE' // service bought from abroad; buyer accounts for VAT
  | 'NEEDS_INVOICE_REVIEW'; // cannot be decided from a bank line

export type Rule = {
  id: string;
  match: string[]; // lowercase substrings searched in counterparty + description + reference
  direction?: 'IN' | 'OUT';
  category: string;
  vat: VatTreatment;
  confidence: number; // 0..1
  evidence_required: boolean; // a receipt or invoice should exist
  note?: string;
};

export type RulePack = {
  id: string;
  jurisdiction: string;
  version: string;
  status: 'DRAFT_NEEDS_TAX_REVIEW';
  categories: Category[];
  rules: Rule[];
  vatRateFor: (isoDate: string, treatment: VatTreatment) => number | null;
};

// A correction an accountant made earlier; outranks built-in rules.
export type LearnedRule = {
  merchant_key: string;
  direction: 'IN' | 'OUT';
  category: string;
  vat: VatTreatment;
};

export type SuggestionReason = 'LEARNED_RULE' | 'RULE' | 'FALLBACK_SUSPENSE';

export type CategorySuggestion = {
  transaction_id: string;
  category_code: string;
  category_name: string;
  vat_treatment: VatTreatment;
  vat_rate: number | null;
  confidence: number;
  reason: SuggestionReason;
  rule_id: string | null;
  evidence_required: boolean;
  needs_review: boolean;
  notes: string[];
};

export type CategoriseOptions = {
  vat_registered?: boolean; // default false: coding VAT for an unregistered company would be wrong
  auto_accept_threshold?: number; // default 0.8
};

export const AUTO_ACCEPT_THRESHOLD = 0.8;

const CATEGORIES: Category[] = [
  { code: 'REVENUE', name: 'Revenue', kind: 'INCOME' },
  { code: 'REVENUE_PAYOUT', name: 'Payment processor payout', kind: 'INCOME' },
  { code: 'SOFTWARE', name: 'Software and subscriptions', kind: 'EXPENSE' },
  { code: 'CLOUD', name: 'Hosting and cloud services', kind: 'EXPENSE' },
  { code: 'ADVERTISING', name: 'Advertising and marketing', kind: 'EXPENSE' },
  { code: 'BANK_FEES', name: 'Bank and payment fees', kind: 'EXPENSE' },
  { code: 'TELECOM', name: 'Phone and internet', kind: 'EXPENSE' },
  { code: 'TRAVEL', name: 'Travel and transport', kind: 'EXPENSE' },
  { code: 'MEALS', name: 'Meals and entertainment', kind: 'EXPENSE' },
  { code: 'RENT', name: 'Rent and workspace', kind: 'EXPENSE' },
  { code: 'PROFESSIONAL_FEES', name: 'Accounting, legal and professional fees', kind: 'EXPENSE' },
  { code: 'OFFICE_SUPPLIES', name: 'Office supplies and equipment', kind: 'EXPENSE' },
  { code: 'INSURANCE', name: 'Insurance', kind: 'EXPENSE' },
  { code: 'PAYROLL', name: 'Salaries and payroll', kind: 'EXPENSE' },
  { code: 'TAXES_AND_DUTIES', name: 'Taxes and duties paid', kind: 'TAX' },
  { code: 'DIVIDENDS', name: 'Dividends and owner distributions', kind: 'EQUITY' },
  { code: 'OWNER_FUNDING', name: 'Owner funding and capital', kind: 'EQUITY' },
  { code: 'LOAN', name: 'Loans and interest', kind: 'FINANCING' },
  { code: 'TRANSFER', name: 'Transfer between own accounts', kind: 'TRANSFER' },
  { code: 'SUSPENSE_IN', name: 'Unclassified receipt', kind: 'SUSPENSE' },
  { code: 'SUSPENSE_OUT', name: 'Unclassified payment', kind: 'SUSPENSE' }
];

const FOREIGN_SERVICE_NOTE = 'Foreign supplier: if the company is VAT-registered, an accountant should confirm reverse-charge reporting.';

// Order does not matter: the highest confidence wins, ties go to the longest matching phrase.
const BASE_RULES: Rule[] = [
  // Cloud and software vendors (foreign suppliers, typically reverse charge)
  { id: 'vendor-aws', match: ['amazon web services', 'aws emea', 'aws '], direction: 'OUT', category: 'CLOUD', vat: 'REVERSE_CHARGE_FOREIGN_SERVICE', confidence: 0.92, evidence_required: true, note: FOREIGN_SERVICE_NOTE },
  { id: 'vendor-vercel', match: ['vercel', 'netlify', 'digitalocean', 'hetzner', 'cloudflare', 'heroku', 'google cloud'], direction: 'OUT', category: 'CLOUD', vat: 'REVERSE_CHARGE_FOREIGN_SERVICE', confidence: 0.9, evidence_required: true, note: FOREIGN_SERVICE_NOTE },
  { id: 'vendor-ads', match: ['google ads', 'facebook ads', 'meta platforms', 'linkedin ads', 'fb.me ads', 'tiktok ads', 'twitter ads'], direction: 'OUT', category: 'ADVERTISING', vat: 'REVERSE_CHARGE_FOREIGN_SERVICE', confidence: 0.92, evidence_required: true, note: FOREIGN_SERVICE_NOTE },
  { id: 'vendor-saas', match: ['google ireland', 'google workspace', 'gsuite', 'slack', 'zoom', 'notion', 'github', 'atlassian', 'adobe', 'microsoft', 'dropbox', 'openai', 'anthropic', 'figma', 'canva', 'mailchimp', 'hubspot', 'shopify', 'zapier', 'airtable', 'asana', 'linear.app', 'intercom'], direction: 'OUT', category: 'SOFTWARE', vat: 'REVERSE_CHARGE_FOREIGN_SERVICE', confidence: 0.88, evidence_required: true, note: FOREIGN_SERVICE_NOTE },
  { id: 'vendor-apple', match: ['apple.com/bill', 'itunes', 'app store'], direction: 'OUT', category: 'SOFTWARE', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.55, evidence_required: true, note: 'Could be software or hardware; check the invoice.' },
  { id: 'vendor-amazon', match: ['amazon'], direction: 'OUT', category: 'OFFICE_SUPPLIES', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.4, evidence_required: true, note: 'Generic marketplace purchase; check the invoice.' },

  // Banking and payments
  { id: 'bank-fee', match: ['service fee', 'monthly fee', 'account fee', 'bank fee', 'card fee', 'teenustasu', 'kuutasu', 'kontohaldus', 'kontoführung', 'maintenance fee', 'wire fee', 'swift fee', 'wise fee', 'stripe fee'], direction: 'OUT', category: 'BANK_FEES', vat: 'NO_VAT', confidence: 0.88, evidence_required: false },
  { id: 'payout-stripe', match: ['stripe', 'paypal', 'paddle', 'lemon squeezy', 'gumroad', 'shopify payments', 'square'], direction: 'IN', category: 'REVENUE_PAYOUT', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.6, evidence_required: true, note: 'Payout, not a sale date: match against the processor report.' },
  { id: 'transfer-own', match: ['own account', 'internal transfer', 'transfer to savings', 'transfer between', 'oma konto', 'ülekanne oma', 'eigenes konto', 'wise transfer', 'top up'], category: 'TRANSFER', vat: 'OUT_OF_SCOPE', confidence: 0.8, evidence_required: false },

  // Taxes and payroll
  { id: 'tax-authority', match: ['emta', 'maksu- ja tolliamet', 'tax and customs board', 'hmrc', 'irs ', 'internal revenue', 'finanzamt', 'bundeszentralamt', 'revenue commissioners'], direction: 'OUT', category: 'TAXES_AND_DUTIES', vat: 'OUT_OF_SCOPE', confidence: 0.9, evidence_required: false },
  { id: 'dividend', match: ['dividend', 'dividend payout'], direction: 'OUT', category: 'DIVIDENDS', vat: 'OUT_OF_SCOPE', confidence: 0.82, evidence_required: true, note: 'Distribution: the accountant must check retained earnings and the tax due on the payout.' },
  { id: 'owner-funding', match: ['share capital', 'osakapital', 'capital contribution', 'shareholder loan', 'owner contribution'], direction: 'IN', category: 'OWNER_FUNDING', vat: 'OUT_OF_SCOPE', confidence: 0.82, evidence_required: true },
  { id: 'payroll', match: ['salary', 'palk', 'wages', 'payroll', 'gehalt', 'lohn '], direction: 'OUT', category: 'PAYROLL', vat: 'OUT_OF_SCOPE', confidence: 0.82, evidence_required: true, note: 'Needs a payslip or payroll report.' },
  { id: 'loan', match: ['loan', 'laen', 'darlehen', 'interest charged', 'intressid'], category: 'LOAN', vat: 'OUT_OF_SCOPE', confidence: 0.7, evidence_required: true },

  // Everyday expenses
  { id: 'telecom', match: ['telia', 'elisa', 'tele2', 'vodafone', 'orange', 'o2 ', 'three.co'], direction: 'OUT', category: 'TELECOM', vat: 'INPUT_VAT_DOMESTIC', confidence: 0.85, evidence_required: true },
  { id: 'travel', match: ['airbnb', 'booking.com', 'ryanair', 'airbaltic', 'lufthansa', 'easyjet', 'wizz', 'uber', 'bolt.eu', 'taxi', 'hotel', 'hilton', 'marriott', 'flixbus', 'trainline', 'estonian air', 'finnair', 'lux express'], direction: 'OUT', category: 'TRAVEL', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.8, evidence_required: true, note: 'Confirm business purpose. VAT on travel depends on the supplier and the invoice.' },
  { id: 'meals', match: ['restaurant', 'cafe', 'café', 'starbucks', 'mcdonald', 'burger', 'pizza', 'bistro', 'bar '], direction: 'OUT', category: 'MEALS', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.6, evidence_required: true, note: 'Confirm business purpose; meals are often partly or fully non-deductible.' },
  { id: 'rent', match: ['rent', 'üür', 'miete', 'coworking', 'wework', 'regus'], direction: 'OUT', category: 'RENT', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.72, evidence_required: true },
  { id: 'professional', match: ['accounting', 'raamatupidamine', 'bookkeeping', 'buchhaltung', 'lawyer', 'advokaat', 'law firm', 'legal fee', 'notary', 'e-resident', 'e-residency', 'company registry', 'registrikeskus', 'consulting'], direction: 'OUT', category: 'PROFESSIONAL_FEES', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.75, evidence_required: true },
  { id: 'insurance', match: ['insurance', 'kindlustus', 'versicherung'], direction: 'OUT', category: 'INSURANCE', vat: 'NO_VAT', confidence: 0.8, evidence_required: true },
  { id: 'revenue-invoice', match: ['invoice', 'arve', 'rechnung', 'inv-', 'inv '], direction: 'IN', category: 'REVENUE', vat: 'NEEDS_INVOICE_REVIEW', confidence: 0.72, evidence_required: true, note: 'Sales VAT (domestic, EU reverse charge, export) depends on the customer and cannot be set from the bank line.' }
];

// Estonia standard rate: 24% from 2025-07-01 (Tax and Customs Board, emta.ee, checked 2026-10-29).
// 22% for 2024-01-01 to 2025-06-30 is taken from the same source's wording for that period.
// Earlier dates return null (no rate) so the accountant sets it. Reduced rates are not coded.
function estoniaVatRate(isoDate: string, treatment: VatTreatment): number | null {
  if (treatment === 'INPUT_VAT_DOMESTIC' || treatment === 'REVERSE_CHARGE_FOREIGN_SERVICE') {
    if (isoDate >= '2025-07-01') return 24;
    if (isoDate >= '2024-01-01') return 22;
    return null;
  }
  return null;
}

export function buildRulePack(jurisdiction: 'EE' | 'GENERIC'): RulePack {
  if (jurisdiction === 'EE') {
    return { id: 'rulepack-ee-v0', jurisdiction: 'EE', version: '0.1.0', status: 'DRAFT_NEEDS_TAX_REVIEW', categories: CATEGORIES, rules: BASE_RULES, vatRateFor: estoniaVatRate };
  }
  return { id: 'rulepack-generic-v0', jurisdiction: 'GENERIC', version: '0.1.0', status: 'DRAFT_NEEDS_TAX_REVIEW', categories: CATEGORIES, rules: BASE_RULES, vatRateFor: () => null };
}

export function merchantKey(tx: Pick<NormalisedBankTransaction, 'counterparty' | 'description'>): string {
  const source = (tx.counterparty || tx.description || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const tokens = source.split(/[^a-z0-9]+/).filter(token => token.length > 1 && !/^\d+$/.test(token));
  return tokens.slice(0, 3).join(' ');
}

function haystack(tx: NormalisedBankTransaction): string {
  return ` ${[tx.counterparty, tx.description, tx.reference].join(' ').toLowerCase()} `;
}

function longestMatch(rule: Rule, text: string): number {
  let best = 0;
  for (const phrase of rule.match) {
    if (text.includes(phrase) && phrase.length > best) best = phrase.length;
  }
  return best;
}

export function categoriseTransaction(
  tx: NormalisedBankTransaction,
  pack: RulePack,
  learned: LearnedRule[] = [],
  options: CategoriseOptions = {}
): CategorySuggestion {
  const threshold = options.auto_accept_threshold ?? AUTO_ACCEPT_THRESHOLD;
  const vatRegistered = options.vat_registered === true;
  const direction: 'IN' | 'OUT' = tx.amount_cents >= 0 ? 'IN' : 'OUT';
  const names = new Map(pack.categories.map(category => [category.code, category.name]));
  const key = merchantKey(tx);

  const finish = (
    category: string,
    vat: VatTreatment,
    confidence: number,
    reason: SuggestionReason,
    ruleId: string | null,
    evidenceRequired: boolean,
    notes: string[]
  ): CategorySuggestion => {
    const effectiveVat: VatTreatment = vatRegistered ? vat : 'NOT_VAT_REGISTERED';
    const outNotes = [...notes];
    if (!vatRegistered && (vat === 'REVERSE_CHARGE_FOREIGN_SERVICE' || vat === 'INPUT_VAT_DOMESTIC')) {
      outNotes.push('Company is not marked VAT-registered, so no VAT was coded. If it is registered, re-run with VAT enabled.');
    }
    return {
      transaction_id: tx.transaction_id,
      category_code: category,
      category_name: names.get(category) || category,
      vat_treatment: effectiveVat,
      vat_rate: vatRegistered ? pack.vatRateFor(tx.date, vat) : null,
      confidence,
      reason,
      rule_id: ruleId,
      evidence_required: evidenceRequired,
      needs_review: confidence < threshold || category.startsWith('SUSPENSE'),
      notes: outNotes
    };
  };

  if (key) {
    const hit = learned.find(rule => rule.merchant_key === key && rule.direction === direction);
    if (hit) return finish(hit.category, hit.vat, 0.95, 'LEARNED_RULE', `learned:${key}`, true, ['Applied from an earlier accountant correction.']);
  }

  const text = haystack(tx);
  let bestRule: Rule | null = null;
  let bestLength = 0;
  for (const rule of pack.rules) {
    if (rule.direction && rule.direction !== direction) continue;
    const length = longestMatch(rule, text);
    if (length === 0) continue;
    if (!bestRule || rule.confidence > bestRule.confidence || (rule.confidence === bestRule.confidence && length > bestLength)) {
      bestRule = rule;
      bestLength = length;
    }
  }
  if (bestRule) {
    return finish(bestRule.category, bestRule.vat, bestRule.confidence, 'RULE', bestRule.id, bestRule.evidence_required, bestRule.note ? [bestRule.note] : []);
  }

  const suspense = direction === 'IN' ? 'SUSPENSE_IN' : 'SUSPENSE_OUT';
  return finish(suspense, 'NEEDS_INVOICE_REVIEW', 0, 'FALLBACK_SUSPENSE', null, direction === 'OUT', ['No rule matched; ask the owner what this was.']);
}

export function categoriseAll(
  transactions: NormalisedBankTransaction[],
  pack: RulePack,
  learned: LearnedRule[] = [],
  options: CategoriseOptions = {}
): CategorySuggestion[] {
  return transactions.map(tx => categoriseTransaction(tx, pack, learned, options));
}

// Turns an accountant's correction into a rule for next time.
export function learnFromCorrection(
  tx: Pick<NormalisedBankTransaction, 'counterparty' | 'description' | 'amount_cents'>,
  category: string,
  vat: VatTreatment
): LearnedRule | null {
  const key = merchantKey(tx);
  if (!key) return null;
  return { merchant_key: key, direction: tx.amount_cents >= 0 ? 'IN' : 'OUT', category, vat };
}
