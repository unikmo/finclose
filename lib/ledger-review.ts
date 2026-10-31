import crypto from 'node:crypto';
import { JURISDICTIONS, normaliseJurisdiction } from './jurisdictions';
import type { LedgerSnapshot } from './ledger';

// Turns a read-only ledger snapshot into PROPOSALS for a person. It decides nothing, changes
// nothing, and never says the books are right: the strongest thing it can say is that the checks it
// ran found nothing, plus the list of checks it did not run. Every proposal names its rule and the
// records it came from, so a reviewer can see why it was raised and dismiss it.

export type ProposalKind = 'QUESTION' | 'CHECK' | 'DATA_GAP';

export type Proposal = {
  proposal_id: string;
  rule: string;
  kind: ProposalKind;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  suggested_action: string; // what a person could do; FinClose does none of it
  records: { type: 'INVOICE' | 'PAYMENT' | 'ENTRY' | 'ACCOUNT'; id: string; label: string }[];
};

export type LedgerReview = {
  provider: string;
  period: { from: string; to: string };
  decides: 'NOTHING';
  status: 'DATA_INCOMPLETE' | 'OPEN_PROPOSALS' | 'NO_FINDINGS_FROM_CHECKS_RUN';
  statement: string; // the one sentence that may be shown as the headline
  proposals: Proposal[];
  checks_run: { rule: string; description: string; examined: number; raised: number }[];
  checks_not_run: string[];
  counts: { invoices: number; payments: number; entries: number; accounts: number };
};

const money = (cents: number) => (cents / 100).toFixed(2);
const idOf = (rule: string, key: string) => rule + '-' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);

const OVERDUE_DAYS = 60;
const VAT_ROUNDING_TOLERANCE_CENTS = 5;

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000);
}

export function reviewLedger(snapshot: LedgerSnapshot): LedgerReview {
  const proposals: Proposal[] = [];
  const checks: LedgerReview['checks_run'] = [];
  const country = JURISDICTIONS[normaliseJurisdiction(snapshot.country)];
  const vatByCode = new Map(snapshot.vat_codes.map(v => [v.code, v]));

  const run = (rule: string, description: string, examined: number, body: (raise: (p: Omit<Proposal, 'proposal_id' | 'rule'> & { key: string }) => void) => void) => {
    let raised = 0;
    body(p => {
      const { key, ...rest } = p;
      proposals.push({ proposal_id: idOf(rule, key), rule, ...rest });
      raised += 1;
    });
    checks.push({ rule, description, examined, raised });
  };

  run('ENTRY_UNBALANCED', 'Every ledger entry has equal debits and credits.', snapshot.entries.length, raise => {
    for (const e of snapshot.entries) {
      const debit = e.rows.reduce((s, r) => s + r.debit_cents, 0), credit = e.rows.reduce((s, r) => s + r.credit_cents, 0);
      if (e.rows.length > 0 && debit !== credit) raise({
        key: e.id, kind: 'CHECK', severity: 'HIGH',
        summary: `Entry ${e.number || e.id} (${e.date}) has debits ${money(debit)} and credits ${money(credit)}.`,
        suggested_action: 'Open the entry in the accounting system and correct the rows.',
        records: [{ type: 'ENTRY', id: e.id, label: e.number || e.id }]
      });
    }
  });

  run('MISSING_DOCUMENT', 'Invoices and manual entries have a source document attached.', snapshot.invoices.length + snapshot.entries.filter(e => e.doc_type === 'LEDGER_ENTRY').length, raise => {
    for (const i of snapshot.invoices) if (i.has_document === false && !i.credit_note) raise({
      key: 'inv:' + i.id, kind: 'QUESTION', severity: i.side === 'PURCHASE' ? 'MEDIUM' : 'LOW',
      summary: `${i.side === 'PURCHASE' ? 'Purchase' : 'Sales'} invoice ${i.number || i.id} from ${i.partner_name || 'unknown'} (${money(i.total_cents)} ${i.currency}, ${i.date}) has no file attached.`,
      suggested_action: 'Ask the owner for the invoice or receipt, or note why none exists.',
      records: [{ type: 'INVOICE', id: i.id, label: i.number || i.id }]
    });
    for (const e of snapshot.entries) if (e.doc_type === 'LEDGER_ENTRY' && e.has_document === false) raise({
      key: 'ent:' + e.id, kind: 'QUESTION', severity: 'MEDIUM',
      summary: `Manual entry ${e.number || e.id} (${e.date}) has no supporting document.`,
      suggested_action: 'Ask who made the entry and why, and attach the support.',
      records: [{ type: 'ENTRY', id: e.id, label: e.number || e.id }]
    });
  });

  run('DUPLICATE_INVOICE', 'No supplier invoice number is booked twice for the same amount.', snapshot.invoices.filter(i => i.side === 'PURCHASE').length, raise => {
    const seen = new Map<string, string>();
    for (const i of snapshot.invoices) {
      if (i.side !== 'PURCHASE' || !i.number) continue;
      const key = [i.partner_name.toLowerCase(), i.number.toLowerCase(), i.total_cents, i.credit_note].join('|');
      const first = seen.get(key);
      if (first) raise({
        key, kind: 'QUESTION', severity: 'HIGH',
        summary: `Invoice ${i.number} from ${i.partner_name} for ${money(i.total_cents)} ${i.currency} appears twice in the ledger.`,
        suggested_action: 'Check whether the second booking is a duplicate and, if it is, have it removed or credited in the accounting system.',
        records: [{ type: 'INVOICE', id: first, label: i.number }, { type: 'INVOICE', id: i.id, label: i.number }]
      });
      else seen.set(key, i.id);
    }
  });

  run('VAT_ARITHMETIC', 'The VAT on each invoice matches its VAT code and net amount.', snapshot.invoices.length, raise => {
    for (const i of snapshot.invoices) {
      if (i.reverse_charge !== 'NONE') {
        if (i.vat_cents !== 0 && i.side === 'PURCHASE' && i.reverse_charge === 'UNION') raise({
          key: 'rc:' + i.id, kind: 'CHECK', severity: 'MEDIUM',
          summary: `Invoice ${i.number || i.id} is marked as EU reverse charge but also carries VAT of ${money(i.vat_cents)}.`,
          suggested_action: 'Check with the accountant which treatment applies.',
          records: [{ type: 'INVOICE', id: i.id, label: i.number || i.id }]
        });
        continue;
      }
      const expected = i.rows.reduce((s, r) => {
        const rate = vatByCode.get(r.vat_code)?.rate_percent;
        return rate === undefined || r.net_cents === null ? s : s + Math.round((r.net_cents * rate) / 100);
      }, 0);
      const known = i.rows.length > 0 && i.rows.every(r => vatByCode.has(r.vat_code) && r.net_cents !== null);
      if (known && Math.abs(expected - i.vat_cents) > VAT_ROUNDING_TOLERANCE_CENTS * Math.max(1, i.rows.length)) raise({
        key: 'va:' + i.id, kind: 'CHECK', severity: 'MEDIUM',
        summary: `Invoice ${i.number || i.id}: VAT booked is ${money(i.vat_cents)} but its VAT codes and net amounts imply ${money(expected)}.`,
        suggested_action: 'Compare the invoice with the source document and correct the VAT code or amount.',
        records: [{ type: 'INVOICE', id: i.id, label: i.number || i.id }]
      });
    }
  });

  run('VAT_RATE_NOT_ALLOWED', `VAT percentages used are rates ${country.name} allows (${country.vat_status === 'UNVERIFIED' ? 'rate list unverified' : 'rate list checked'}).`, snapshot.vat_codes.length, raise => {
    if (country.allowed_rates.length === 0) return;
    const inUse = new Set(snapshot.invoices.flatMap(i => i.rows.map(r => r.vat_code)));
    for (const v of snapshot.vat_codes) {
      if (!inUse.has(v.code)) continue;
      if (!country.allowed_rates.includes(v.rate_percent)) raise({
        key: v.code, kind: 'QUESTION', severity: 'MEDIUM',
        summary: `VAT code "${v.code}" is ${v.rate_percent}%, which is not among the rates FinClose knows for ${country.name} (${country.allowed_rates.join(', ')}), and it is used on invoices.`,
        suggested_action: country.vat_status === 'UNVERIFIED' ? 'FinClose\'s rate list for this country is unverified, so confirm with the accountant before changing anything.' : 'Confirm the code with the accountant.',
        records: [{ type: 'ACCOUNT', id: v.code, label: `VAT code ${v.code}` }]
      });
    }
  });

  run('OVERDUE_UNPAID', `Invoices unpaid more than ${OVERDUE_DAYS} days past their due date at period end.`, snapshot.invoices.length, raise => {
    for (const i of snapshot.invoices) {
      if (i.outstanding_cents <= 0 || !i.due_date) continue;
      if (daysBetween(i.due_date, snapshot.period.to) > OVERDUE_DAYS) raise({
        key: i.id, kind: 'QUESTION', severity: i.side === 'SALES' ? 'MEDIUM' : 'LOW',
        summary: `${i.side === 'SALES' ? 'Sales' : 'Purchase'} invoice ${i.number || i.id} (${i.partner_name}) has ${money(i.outstanding_cents)} ${i.currency} outstanding, due ${i.due_date}.`,
        suggested_action: i.side === 'SALES' ? 'Ask whether it will be paid or should be treated as doubtful.' : 'Ask whether it was paid outside the recorded accounts.',
        records: [{ type: 'INVOICE', id: i.id, label: i.number || i.id }]
      });
    }
  });

  run('PAYMENT_NOT_MATCHED', 'Every payment is matched to an invoice, VAT return, salary or prepayment.', snapshot.payments.length, raise => {
    for (const p of snapshot.payments) {
      const open = p.amount_cents - p.applied_cents;
      if (Math.abs(open) > 0) raise({
        key: p.id, kind: 'QUESTION', severity: 'MEDIUM',
        summary: `${p.account_kind === 'BANK' ? 'Bank' : 'Cash'} payment on ${p.date} (${p.partner_name || 'no partner'}, ${money(p.amount_cents)} ${p.currency}) has ${money(open)} not matched to anything.`,
        suggested_action: 'Ask what the payment was for, then match it in the accounting system.',
        records: [{ type: 'PAYMENT', id: p.id, label: `${p.date} ${p.partner_name}` }]
      });
    }
  });

  run('OUTSIDE_PERIOD', 'Entries and invoices fall inside the period under review.', snapshot.entries.length + snapshot.invoices.length, raise => {
    for (const e of snapshot.entries) if (e.date && (e.date < snapshot.period.from || e.date > snapshot.period.to)) raise({
      key: 'e' + e.id, kind: 'CHECK', severity: 'LOW',
      summary: `Entry ${e.number || e.id} is dated ${e.date}, outside ${snapshot.period.from} to ${snapshot.period.to}.`,
      suggested_action: 'Check the date; it may belong to another period.',
      records: [{ type: 'ENTRY', id: e.id, label: e.number || e.id }]
    });
  });

  // Gaps come last and decide the headline: a review that could not see everything says so.
  for (const gap of snapshot.gaps.filter(g => !g.startsWith('Note: '))) proposals.push({ proposal_id: idOf('DATA_GAP', gap), rule: 'DATA_GAP', kind: 'DATA_GAP', severity: 'LOW', summary: gap, suggested_action: 'Treat the review as covering only what was read.', records: [] });

  const incomplete = snapshot.gaps.some(g => !g.startsWith('Note: '));
  const open = proposals.filter(p => p.kind !== 'DATA_GAP');
  const status: LedgerReview['status'] = incomplete ? 'DATA_INCOMPLETE' : open.length > 0 ? 'OPEN_PROPOSALS' : 'NO_FINDINGS_FROM_CHECKS_RUN';
  const statement =
    status === 'DATA_INCOMPLETE' ? `Some data could not be read, so this review is partial. ${open.length} proposal(s) are open.`
    : status === 'OPEN_PROPOSALS' ? `${open.length} proposal(s) need a person's decision.`
    : `The ${checks.length} checks run found nothing to raise. This is not a statement that the books are correct.`;

  return {
    provider: snapshot.provider, period: snapshot.period, decides: 'NOTHING', status, statement, proposals, checks_run: checks,
    checks_not_run: [
      ...snapshot.gaps.filter(g => g.startsWith('Note: ')).map(g => g.slice(6)),
      'Bank statement against bank balance (no statement was supplied in this run).',
      'Whether each expense is business-related and in the right account.',
      'Depreciation, accruals, inventory and payroll correctness.',
      'Whether the VAT return matches the tax authority\'s form boxes.',
      'Anything outside the period or outside the records the system returned.'
    ],
    counts: { invoices: snapshot.invoices.length, payments: snapshot.payments.length, entries: snapshot.entries.length, accounts: snapshot.accounts.length }
  };
}
