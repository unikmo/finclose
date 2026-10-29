import crypto from 'node:crypto';

// Bank-statement CSV intake: turns an exported statement into normalised,
// signed transactions the preparation engines can work with. Pure functions,
// no I/O and no Firebase, so the whole module is unit-testable. Money is held
// in integer cents throughout; floats are never used for amounts.

export type NormalisedBankTransaction = {
  transaction_id: string;
  date: string; // YYYY-MM-DD
  amount_cents: number; // inflow positive, outflow negative
  currency: string;
  description: string;
  counterparty: string;
  reference: string;
  source_row: number; // 1-based line number in the uploaded file
  possible_duplicate_of: string | null;
};

export type IntakeOptions = {
  currency?: string; // used when the file has no currency column
  date_order?: 'DMY' | 'MDY' | 'auto'; // ISO dates are always accepted; default DMY (EU first)
  known_transaction_ids?: ReadonlySet<string>; // already imported; skipped on re-upload
};

export type IntakeResult = {
  transactions: NormalisedBankTransaction[];
  rejected: { row: number; reason: string; raw: string }[];
  warnings: string[];
  skipped_already_imported: number;
  detected: { delimiter: string; columns: Record<string, string>; header_line: number };
};

// Order matters: for each field the first alias found in the header wins, so a plain "date" beats
// "started date". How well each bank's headers are sourced is recorded in docs/bank-formats.md.
const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'bookingdate', 'transactiondate', 'valuedate', 'postingdate', 'kuupaev', 'buchungstag', 'datum', 'booked', 'completeddate', 'createdutc', 'created'],
  date_alt: ['starteddate'], // used when the main date cell is empty, e.g. a Revolut row that is still pending,
  description: ['description', 'details', 'memo', 'narrative', 'text', 'selgitus', 'verwendungszweck', 'buchungstext', 'paymentdetails'],
  counterparty: ['counterparty', 'payee', 'beneficiary', 'name', 'receiver', 'payer', 'receiverpayer', 'saajamaksja', 'saaja', 'auftraggeber', 'merchant', 'beneficiarysremittersname', 'saajamaksjanimi'],
  payee: ['payeename'],
  payer: ['payername'],
  reference: ['referencenumber', 'reference', 'ref', 'viitenumber', 'paymentreference', 'transactionid', 'archiveid'],
  reference_alt: ['archivalid', 'arhiveerimistunnus', 'balancetransactionid'], // used when the main reference cell is empty,
  amount: ['amount', 'summa', 'betrag', 'value', 'transactionamount', 'gross'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'paidout', 'moneyout', 'outflow', 'deebet'],
  credit: ['credit', 'deposit', 'deposits', 'paidin', 'moneyin', 'inflow', 'kreedit'],
  indicator: ['dk', 'debitcredit', 'deebetkreedit', 'creditdebitindicator', 'type', 'dc', 'debitcreditdc', 'deebetkreeditdk'],
  currency: ['currency', 'valuuta', 'whrung', 'ccy'],
  fee: ['fee', 'fees'], // a separate fee column is booked as its own outgoing row
  status: ['state', 'status'],
  rowtype: ['reatuup']
};

// Statuses that never moved money; such rows are rejected with a reason, never imported.
const NOT_SETTLED = new Set(['pending', 'declined', 'reverted', 'failed', 'cancelled', 'canceled', 'rejected']);
// Row-type codes some Estonian exports use for balance and turnover lines. UNVERIFIED, see docs/bank-formats.md.
const SUMMARY_ROW_TYPES = new Set(['10', '82', '86']);

function normaliseHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return best;
}

// RFC-4180 style parser: quoted fields, escaped quotes, CRLF or LF.
export function parseCsv(text: string, delimiter: string): { rows: string[][]; line_numbers: number[] } {
  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) { rows.push(row); lineNumbers.push(rowStartLine); }
      row = [];
      line += 1;
      rowStartLine = line;
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) { rows.push(row); lineNumbers.push(rowStartLine); }
  return { rows, line_numbers: lineNumbers };
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Returns ISO date or null. `ambiguous` is set when a numeric date could be read
// both ways and the default order was used.
export function parseStatementDate(raw: string, order: 'DMY' | 'MDY' | 'auto'): { iso: string | null; ambiguous: boolean } {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(value);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return validCalendarDate(y, m, d) ? { iso: `${y}-${pad(m)}-${pad(d)}`, ambiguous: false } : { iso: null, ambiguous: false };
  }
  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[T\s].*)?$/.exec(value);
  if (!parts) return { iso: null, ambiguous: false };
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const year = Number(parts[3]);
  let day = first;
  let month = second;
  let ambiguous = false;
  if (order === 'MDY') {
    day = second; month = first;
  } else if (order === 'auto') {
    if (first > 12) { day = first; month = second; }
    else if (second > 12) { day = second; month = first; }
    else if (first !== second) ambiguous = true;
  } else if (first <= 12 && second <= 12 && first !== second) {
    ambiguous = true;
  }
  return validCalendarDate(year, month, day) ? { iso: `${year}-${pad(month)}-${pad(day)}`, ambiguous } : { iso: null, ambiguous: false };
}

// Parses "1.234,56", "1,234.56", "(12.50)", "12.50-", "-€12,5" into signed cents.
// Returns null when the text is not a number. Half-up rounding on extra decimals.
export function parseAmountToCents(raw: string): number | null {
  let value = raw.trim();
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) { negative = true; value = value.slice(1, -1); }
  value = value.replace(/[\s  ]/g, '').replace(/[€$£]|eur|usd|gbp/gi, '');
  if (value.endsWith('-')) { negative = !negative; value = value.slice(0, -1); }
  if (value.startsWith('-')) { negative = !negative; value = value.slice(1); }
  else if (value.startsWith('+')) value = value.slice(1);
  if (!/^[\d.,']+$/.test(value) || !/\d/.test(value)) return null;
  value = value.replace(/'/g, '');

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  let decimalIndex = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalIndex = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.';
    const index = value.lastIndexOf(separator);
    const occurrences = value.split(separator).length - 1;
    const digitsAfter = value.length - index - 1;
    if (occurrences === 1 && digitsAfter !== 3) decimalIndex = index;
    else if (occurrences === 1 && digitsAfter === 3 && /^0$/.test(value.slice(0, index))) decimalIndex = index;
  }
  const integerPart = (decimalIndex >= 0 ? value.slice(0, decimalIndex) : value).replace(/[.,]/g, '');
  const fractionPart = decimalIndex >= 0 ? value.slice(decimalIndex + 1).replace(/[.,]/g, '') : '';
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;
  let cents = Number(integerPart || '0') * 100 + Number((fractionPart + '00').slice(0, 2));
  if (fractionPart.length > 2 && Number(fractionPart[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function normaliseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mapColumns(header: string[]): Record<string, number> {
  const normalised = header.map(normaliseHeader);
  const mapping: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const index = normalised.indexOf(alias);
      if (index >= 0) { mapping[field] = index; break; }
    }
  }
  return mapping;
}

// Exports often start with account details before the column names. Looks at the first lines for one
// with a date column and an amount (or debit/credit) column. Returns its 0-based line, or 0.
function findHeaderLine(lines: string[]): number {
  for (let k = 0; k < Math.min(lines.length, 25); k += 1) {
    if (!lines[k].trim()) continue;
    const cells = parseCsv(lines[k], detectDelimiter(lines[k])).rows[0];
    if (!cells) continue;
    const m = mapColumns(cells);
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) return k;
  }
  return 0;
}

export function parseBankStatementCsv(input: string, options: IntakeOptions = {}): IntakeResult {
  const text = input.replace(/^﻿/, '');
  const order = options.date_order || 'DMY';
  const defaultCurrency = (options.currency || 'EUR').toUpperCase();
  const allLines = text.split('\n');
  const headerAt = findHeaderLine(allLines);
  const delimiter = detectDelimiter(allLines[headerAt] || '');
  const parsed = parseCsv(allLines.slice(headerAt).join('\n'), delimiter);
  const rows = parsed.rows;
  const lineNumbers = parsed.line_numbers.map(n => n + headerAt); // source_row stays the line number in the uploaded file
  const result: IntakeResult = {
    transactions: [],
    rejected: [],
    warnings: [],
    skipped_already_imported: 0,
    detected: { delimiter, columns: {}, header_line: headerAt + 1 }
  };
  if (headerAt > 0) result.warnings.push(`${headerAt} line(s) above the column names were ignored (account details or similar).`);
  if (rows.length < 2) {
    result.warnings.push('file has no data rows');
    return result;
  }
  const columns = mapColumns(rows[0]);
  result.detected.columns = Object.fromEntries(Object.entries(columns).map(([field, index]) => [field, rows[0][index]]));
  if (columns.date === undefined) {
    result.warnings.push('no date column found; expected one of: date, booking date, kuupäev, buchungstag');
    return result;
  }
  const hasAmount = columns.amount !== undefined;
  const hasSplit = columns.debit !== undefined || columns.credit !== undefined;
  if (!hasAmount && !hasSplit) {
    result.warnings.push('no amount column found; expected amount, or debit and credit columns');
    return result;
  }

  let ambiguousDates = 0;
  const seenCounts = new Map<string, number>();
  const firstSeen = new Map<string, string>();
  const identicalCounts = new Map<string, number>();

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const rowNumber = lineNumbers[i];
    const raw = cells.join(delimiter);
    const cell = (field: string) => (columns[field] === undefined ? '' : (cells[columns[field]] || ''));

    // Checked before the date: a pending row has no completed date, and its real reason should be the one reported.
    const state = normaliseText(cell('status')).toLowerCase();
    if (NOT_SETTLED.has(state)) { result.rejected.push({ row: rowNumber, reason: `status ${state}: no money moved`, raw }); continue; }
    const rowType = normaliseText(cell('rowtype'));
    if (rowType && SUMMARY_ROW_TYPES.has(rowType)) { result.rejected.push({ row: rowNumber, reason: `row type ${rowType}: balance or turnover line, not a payment`, raw }); continue; }
    const dateResult = parseStatementDate(cell('date') || cell('date_alt'), order);
    if (!dateResult.iso) { result.rejected.push({ row: rowNumber, reason: 'unreadable date', raw }); continue; }
    if (dateResult.ambiguous) ambiguousDates += 1;

    let cents: number | null = null;
    if (hasAmount && cell('amount').trim() !== '') {
      cents = parseAmountToCents(cell('amount'));
      if (cents !== null && columns.indicator !== undefined) {
        const flag = normaliseText(cell('indicator')).toLowerCase();
        const outgoing = flag === 'd' || flag === 'debit' || flag === 'deebet';
        const incoming = flag === 'c' || flag === 'k' || flag === 'credit' || flag === 'kreedit';
        if (outgoing) cents = -Math.abs(cents);
        else if (incoming) cents = Math.abs(cents);
      }
    } else if (hasSplit) {
      const debit = columns.debit === undefined ? null : parseAmountToCents(cell('debit'));
      const credit = columns.credit === undefined ? null : parseAmountToCents(cell('credit'));
      if (debit !== null && debit !== 0 && credit !== null && credit !== 0) {
        result.rejected.push({ row: rowNumber, reason: 'both debit and credit filled', raw });
        continue;
      }
      if (debit !== null && debit !== 0) cents = -Math.abs(debit);
      else if (credit !== null && credit !== 0) cents = Math.abs(credit);
      else if (debit === 0 || credit === 0) cents = 0;
    }
    if (cents === null) { result.rejected.push({ row: rowNumber, reason: 'unreadable amount', raw }); continue; }
    // A fee column (Revolut, Stripe) is money leaving separately from the amount, so it becomes its own outgoing row.
    const feeRaw = columns.fee === undefined ? null : parseAmountToCents(cell('fee'));
    const feeCents = feeRaw ? -Math.abs(feeRaw) : 0;
    if (cents === 0 && feeCents === 0) { result.rejected.push({ row: rowNumber, reason: 'zero amount', raw }); continue; }

    const description = normaliseText(cell('description'));
    // Wise gives separate payer and payee names: the other party is the payee for money out, the payer for money in.
    const sideName = normaliseText(cell(cents < 0 ? 'payee' : 'payer')) || normaliseText(cell(cents < 0 ? 'payer' : 'payee'));
    const counterparty = normaliseText(cell('counterparty')) || sideName;
    const reference = normaliseText(cell('reference')) || normaliseText(cell('reference_alt'));
    const currency = (normaliseText(cell('currency')) || defaultCurrency).toUpperCase();

    const pieces = [
      ...(cents !== 0 ? [{ cents, description, suffix: '' }] : []),
      ...(feeCents !== 0 ? [{ cents: feeCents, description: normaliseText(`Bank fee: ${description}`), suffix: '|fee' }] : [])
    ];
    for (const piece of pieces) {
      // Two genuinely identical payments on one day get distinct ids via the occurrence index.
      const identity = [dateResult.iso, piece.cents, currency, counterparty.toLowerCase(), piece.description.toLowerCase(), reference.toLowerCase()].join('|') + piece.suffix;
      const occurrence = (identicalCounts.get(identity) || 0) + 1;
      identicalCounts.set(identity, occurrence);
      const transactionId = `tx_${crypto.createHash('sha256').update(`${identity}|${occurrence}`).digest('hex').slice(0, 20)}`;
      if (options.known_transaction_ids?.has(transactionId)) { result.skipped_already_imported += 1; continue; }

      // Same day, amount and text twice is flagged for a human, never silently dropped.
      const duplicateKey = [dateResult.iso, piece.cents, currency, (counterparty + piece.description).toLowerCase().replace(/[^a-z0-9]/g, '')].join('|');
      const seen = (seenCounts.get(duplicateKey) || 0) + 1;
      seenCounts.set(duplicateKey, seen);
      if (seen === 1) firstSeen.set(duplicateKey, transactionId);

      result.transactions.push({
        transaction_id: transactionId,
        date: dateResult.iso,
        amount_cents: piece.cents,
        currency,
        description: piece.description,
        counterparty,
        reference,
        source_row: rowNumber,
        possible_duplicate_of: seen > 1 ? firstSeen.get(duplicateKey) || null : null
      });
    }
  }
  if (columns.fee !== undefined) result.warnings.push('A fee column was found: each non-zero fee is listed as its own outgoing row. Check that the amount column is before fees.');

  if (ambiguousDates > 0) {
    result.warnings.push(`${ambiguousDates} date(s) could be day-first or month-first; read as ${order === 'MDY' ? 'month-first' : 'day-first'}. Check the date format option if this is wrong.`);
  }
  const currencies = new Set(result.transactions.map(tx => tx.currency));
  if (currencies.size > 1) result.warnings.push(`file mixes currencies: ${[...currencies].sort().join(', ')}`);
  return result;
}
