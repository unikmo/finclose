import type { JournalView } from './chart-of-accounts';

// DATEV file export of the PROPOSED journal, for a German accountant to import. FinClose has no
// live DATEV connection: DATEV's own interfaces need a partner registration.
//
// UNVERIFIED: the layout follows the DATEV "Buchungsstapel" (EXTF, format 700, category 21) as
// recalled. Only the first 14 data columns are written and the header row names only those, which
// the importer may or may not accept. No German accountant has imported a file yet. Treat this as a
// starting point to test with a partner's DATEV, not as a working integration.
//
// DATEV books pairs (Konto against Gegenkonto), so the balanced journal is paired off: debits are
// matched against credits, splitting an amount when one side is larger. Every row is "S" (Soll) on
// the Konto side, so each row reads: debit this account, credit that one.

export type DatevOptions = {
  consultant_number: string; // Beraternummer
  client_number: string; // Mandantennummer
  fiscal_year_start: string; // YYYY-MM-DD
  account_length?: number; // Sachkontenlänge, usually 4
  label: string;
  generated_at: Date;
};

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
const amount = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const compact = (iso: string) => iso.replace(/-/g, '');

function guard(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

export function datevBuchungsstapel(journal: JournalView, options: DatevOptions): string {
  if (!journal.balanced) throw new Error('the journal does not balance, so no DATEV file was made');
  const dates = journal.lines.map(l => l.date).sort();
  const from = dates[0] || options.fiscal_year_start;
  const to = dates[dates.length - 1] || options.fiscal_year_start;
  const ts = options.generated_at;
  const stamp = `${ts.getUTCFullYear()}${String(ts.getUTCMonth() + 1).padStart(2, '0')}${String(ts.getUTCDate()).padStart(2, '0')}${String(ts.getUTCHours()).padStart(2, '0')}${String(ts.getUTCMinutes()).padStart(2, '0')}${String(ts.getUTCSeconds()).padStart(2, '0')}000`;
  const header = ['"EXTF"', '700', '21', q('Buchungsstapel'), '13', stamp, '', '""', '""', '""', options.consultant_number, options.client_number, compact(options.fiscal_year_start), String(options.account_length ?? 4), compact(from), compact(to), q(options.label.slice(0, 30)), '""', '1', '0', '0', q('EUR')].join(';');
  const columns = ['Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext'].map(q).join(';');

  const rows: string[] = [];
  const days = [...new Set(journal.lines.map(l => l.date))].sort();
  for (const day of days) {
    const debits = journal.lines.filter(l => l.date === day && l.debit_cents > 0).map(l => ({ account: l.account_code, cents: l.debit_cents, memo: l.memo, ref: l.transaction_id }));
    const credits = journal.lines.filter(l => l.date === day && l.credit_cents > 0).map(l => ({ account: l.account_code, cents: l.credit_cents }));
    let c = 0;
    for (const d of debits) {
      let left = d.cents;
      while (left > 0 && c < credits.length) {
        const take = Math.min(left, credits[c].cents);
        rows.push([amount(take), 'S', q('EUR'), '', '', '', d.account, credits[c].account, '', day.slice(8, 10) + day.slice(5, 7), q(guard(d.ref.slice(0, 36))), '', '', q(guard(d.memo.slice(0, 60)))].join(';'));
        left -= take;
        credits[c].cents -= take;
        if (credits[c].cents === 0) c += 1;
      }
    }
  }
  return [header, columns, ...rows].join('\r\n') + '\r\n';
}
