import { parseAmountToCents, parseStatementDate } from './statement-intake';

// Best-effort reading of text-based bank-statement PDFs. Not OCR: a scanned PDF has no text to read
// and is refused with that reason. The PDF is turned into a CSV and then goes through the same
// intake, rules and checks as any CSV, so the review pack still shows what could not be read.
// Layouts are found from the column headings of the table; nothing here is tied to one bank, and
// no bank's real PDF has been tried (see docs/pdf-statements.md).

export const MAX_PDF_PAGES = 100;
const PARSE_TIMEOUT_MS = 20_000;

type Cell = { text: string; x0: number; x1: number };
type Row = { cells: Cell[]; page: number };
type Kind = 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance';

export type PdfStatementResult = {
  csv_text: string;
  pages: number;
  rows_read: number;
  warnings: string[];
  hints: { opening_balance?: string; closing_balance?: string };
  layout: 'HEADED_TABLE' | 'UNHEADED_GUESS';
};

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

type PdfJs = {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
};
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; transform?: number[]; width?: number; height?: number }[] }> }>;
  destroy(): Promise<void>;
};

async function loadPdfJs(): Promise<PdfJs> {
  // The legacy build runs on plain Node (no canvas, no DOM). Kept as a dynamic import so the
  // library is only loaded when a PDF is actually uploaded.
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs;
}

// Groups text fragments into table rows (same baseline) and cells (fragments close together).
export function groupIntoRows(items: { str?: string; transform?: number[]; width?: number; height?: number }[], page: number): Row[] {
  const fragments = items
    .filter(item => typeof item.str === 'string' && item.str.trim() !== '' && item.transform)
    .map(item => ({ text: item.str!.trim(), x: item.transform![4], y: item.transform![5], w: item.width || 0, h: item.height || 8 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: (typeof fragments)[] = [];
  for (const fragment of fragments) {
    const line = lines.find(candidate => Math.abs(candidate[0].y - fragment.y) <= Math.max(2, fragment.h * 0.4));
    if (line) line.push(fragment); else lines.push([fragment]);
  }
  return lines.map(line => {
    line.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const fragment of line) {
      const last = cells[cells.length - 1];
      const gap = last ? fragment.x - last.x1 : Infinity;
      if (last && gap < fragment.h * 0.9) {
        last.text += (gap > fragment.h * 0.12 ? ' ' : '') + fragment.text;
        last.x1 = fragment.x + fragment.w;
      } else {
        cells.push({ text: fragment.text, x0: fragment.x, x1: fragment.x + fragment.w });
      }
    }
    return { cells, page };
  });
}

const HEADER_WORDS: [Kind, RegExp][] = [
  ['date', /^(date|booking date|value date|posting date|transaction date|kuupäev|kuupaev|buchungstag|datum)\b/i],
  ['debit', /^(debit|debits|withdrawals?|paid out|money out|deebet|soll)\b/i],
  ['credit', /^(credit|credits|deposits?|paid in|money in|kreedit|haben)\b/i],
  ['amount', /^(amount|summa|betrag|value)\b/i],
  ['balance', /^(balance|saldo|jääk|jaak|kontostand)\b/i],
  ['description', /^(description|details|narrative|particulars|reference|payee|counterparty|selgitus|saaja|maksja|verwendungszweck|buchungstext|transaction)\b/i]
];

function classifyHeader(text: string): Kind | null {
  for (const [kind, pattern] of HEADER_WORDS) if (pattern.test(text.trim())) return kind;
  return null;
}

const AMOUNT_CELL = /^[-+(−]?\s*\d{1,3}([ .,'’ ]\d{3})*([.,]\d{1,2})?\s*\)?\s*(CR|DR|C|D)?$|^[-+(−]?\s*\d+([.,]\d{1,2})?\s*\)?\s*(CR|DR|C|D)?$/i;
const isAmountCell = (text: string) => AMOUNT_CELL.test(text.trim()) && /\d/.test(text) && /[.,]\d{1,2}\b/.test(text);
const isDateCell = (text: string) => parseStatementDate(text.trim().split(/\s+/)[0], 'auto').iso !== null && /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(text.trim());

function distance(cell: Cell, column: { x0: number; x1: number }) {
  return Math.min(Math.abs(cell.x1 - column.x1), Math.abs(cell.x0 - column.x0), Math.abs((cell.x0 + cell.x1) / 2 - (column.x0 + column.x1) / 2));
}

const csvField = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function rowsToStatementCsv(rows: Row[]): Omit<PdfStatementResult, 'pages'> {
  const warnings: string[] = [];
  const hints: PdfStatementResult['hints'] = {};

  // Opening and closing balance lines, e.g. "Opening balance 1 200,00".
  for (const row of rows) {
    const label = row.cells.map(cell => cell.text).join(' ');
    const amountCell = [...row.cells].reverse().find(cell => isAmountCell(cell.text));
    if (!amountCell) continue;
    if (/\b(opening|beginning|brought forward|algsaldo|anfangssaldo)\b/i.test(label) && !hints.opening_balance) hints.opening_balance = amountCell.text.trim();
    else if (/\b(closing|ending|carried forward|lõppsaldo|loppsaldo|endsaldo)\b/i.test(label)) hints.closing_balance = amountCell.text.trim();
  }

  // The header: the first row that names a date column and at least an amount, or debit and credit.
  let headerIndex = -1;
  let columns: { kind: Kind; x0: number; x1: number }[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const found = rows[i].cells.map(cell => ({ kind: classifyHeader(cell.text), x0: cell.x0, x1: cell.x1 })).filter((c): c is { kind: Kind; x0: number; x1: number } => c.kind !== null);
    const kinds = new Set(found.map(c => c.kind));
    if (kinds.has('date') && (kinds.has('amount') || (kinds.has('debit') && kinds.has('credit')))) { headerIndex = i; columns = found; break; }
  }

  const records: { date: string; description: string; debit: string; credit: string; amount: string }[] = [];
  const dropped: string[] = [];
  const layout: PdfStatementResult['layout'] = headerIndex >= 0 ? 'HEADED_TABLE' : 'UNHEADED_GUESS';

  if (headerIndex >= 0) {
    const split = columns.some(c => c.kind === 'debit') && columns.some(c => c.kind === 'credit');
    const numeric = columns.filter(c => c.kind === 'amount' || c.kind === 'debit' || c.kind === 'credit' || c.kind === 'balance');
    const describing = columns.find(c => c.kind === 'description');
    for (const row of rows.slice(headerIndex + 1)) {
      const first = row.cells[0];
      if (first && isDateCell(first.text)) {
        const record = { date: first.text.trim().split(/\s+/)[0], description: '', debit: '', credit: '', amount: '' };
        const descriptionParts: string[] = [];
        for (const cell of row.cells.slice(1)) {
          if (isAmountCell(cell.text) && numeric.length) {
            const column = numeric.reduce((best, c) => (distance(cell, c) < distance(cell, best) ? c : best));
            if (column.kind === 'debit') record.debit = cell.text.trim();
            else if (column.kind === 'credit') record.credit = cell.text.trim();
            else if (column.kind === 'amount') record.amount = cell.text.trim();
          } else if (isDateCell(cell.text) && !record.description && descriptionParts.length === 0) {
            continue; // a second date column (value date)
          } else {
            descriptionParts.push(cell.text);
          }
        }
        record.description = descriptionParts.join(' ');
        if (split ? !record.debit && !record.credit && !record.amount : !record.amount && !record.debit && !record.credit) {
          dropped.push(row.cells.map(c => c.text).join(' '));
          continue;
        }
        records.push(record);
      } else if (records.length && row.cells.length && !row.cells.some(c => isAmountCell(c.text)) && (!describing || row.cells[0].x0 >= describing.x0 - 12)) {
        // A wrapped description line belongs to the transaction above it.
        const last = records[records.length - 1];
        last.description = `${last.description} ${row.cells.map(c => c.text).join(' ')}`.trim();
      }
    }
  } else {
    warnings.push('No column headings were found in the PDF, so the first amount on each dated line is taken as the amount. Check the signs and totals.');
    for (const row of rows) {
      const first = row.cells[0];
      if (!first || !isDateCell(first.text)) continue;
      const amounts = row.cells.slice(1).filter(c => isAmountCell(c.text));
      if (amounts.length === 0 || amounts.length > 2) { dropped.push(row.cells.map(c => c.text).join(' ')); continue; }
      records.push({
        date: first.text.trim().split(/\s+/)[0],
        description: row.cells.slice(1).filter(c => !isAmountCell(c.text) && !isDateCell(c.text)).map(c => c.text).join(' '),
        debit: '', credit: '', amount: amounts[0].text.trim()
      });
    }
  }

  if (dropped.length) warnings.push(`${dropped.length} dated line(s) in the PDF had no readable amount and were left out. First: "${dropped[0].slice(0, 120)}".`);
  const useSplit = records.some(r => r.debit || r.credit);
  const header = useSplit ? 'date,description,debit,credit,amount' : 'date,description,amount';
  const lines = records.map(r => (useSplit
    ? [r.date, r.description, r.debit, r.credit, r.amount]
    : [r.date, r.description, r.amount]).map(csvField).join(','));
  // Every amount must be readable by the CSV intake; say so now rather than silently losing rows later.
  const unreadable = records.filter(r => [r.debit, r.credit, r.amount].some(v => v && parseAmountToCents(v) === null)).length;
  if (unreadable) warnings.push(`${unreadable} amount(s) could not be understood and will be rejected in the next step.`);
  warnings.push('Read from a PDF, which is less reliable than a CSV export. Compare the totals with the bank before relying on the pack.');
  return { csv_text: [header, ...lines].join('\n'), rows_read: records.length, warnings, hints, layout };
}

// The text of a PDF, one line per row, cells separated by two spaces. Used for receipts and invoices.
export async function extractPdfPlainText(bytes: Buffer): Promise<string> {
  const { rows } = await readPdfRows(bytes);
  return rows.map(row => row.cells.map(cell => cell.text).join('  ')).join('\n');
}

export async function extractStatementFromPdf(bytes: Buffer): Promise<PdfStatementResult> {
  const { rows, pages } = await readPdfRows(bytes);
  if (rows.length === 0) throw httpError('this PDF has no text layer (it looks scanned). Download the CSV from internet banking, or use a text-based PDF', 422);
  const result = rowsToStatementCsv(rows);
  if (result.rows_read === 0) throw httpError('no transactions could be read from this PDF. Download the CSV from internet banking instead', 422);
  return { ...result, pages };
}

async function readPdfRows(bytes: Buffer): Promise<{ rows: Row[]; pages: number }> {
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw httpError('the file is not a PDF', 415);
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const doc = await task.promise;
      if (doc.numPages > MAX_PDF_PAGES) throw httpError(`the PDF has ${doc.numPages} pages; the limit is ${MAX_PDF_PAGES}`, 413);
      const rows: Row[] = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        rows.push(...groupIntoRows((await page.getTextContent()).items, n));
      }
      return { rows, pages: doc.numPages };
    })();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(httpError('reading the PDF took too long', 422)), PARSE_TIMEOUT_MS); });
    return await Promise.race([work, timeout]);
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    throw httpError(`the PDF could not be read: ${(error as Error).message}`, 422);
  } finally {
    if (timer) clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}
