import { execFile } from 'node:child_process';
import { parseAmountToCents, parseStatementDate } from './statement-intake';

// Reads a receipt or invoice. Text PDFs are read directly (pdf-text.ts); images and scanned PDFs
// need an OCR engine, which is the Tesseract command-line program if the operator installed it
// (FINCLOSE_TESSERACT_PATH). It is run locally, so the image never leaves the server. No engine
// means images are not read and the owner types the answer as before. Everything extracted is a
// suggestion shown next to the receipt; nothing is booked from it.

export type ReceiptFields = {
  source: 'PDF_TEXT' | 'OCR';
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  currency: string | null;
  total_cents: number | null;
  total_is_guess: boolean; // true when no "total" line was found and the largest amount was used
  vat_cents: number | null;
  vat_rate: number | null; // percent, as printed
  invoice_number: string | null;
  text_chars: number;
};

const TOTAL_WORDS = /\b(grand total|total due|amount due|total to pay|to pay|total|kokku|tasuda|summa kokku|gesamtbetrag|gesamt|summe|endbetrag)\b/i;
const NOT_TOTAL = /\b(sub-?total|vahesumma|zwischensumme|net|neto|netto|excl|ilma|vat|km|käibemaks|mwst|tax)\b/i;
const VAT_WORDS = /\b(vat|km|käibemaks|kaibemaks|mwst|ust|tax)\b/i;
const MONEY = /[-−]?\d{1,3}(?:[ .,'’ ]\d{3})*[.,]\d{2}\b|[-−]?\d+[.,]\d{2}\b/g;

function moneyIn(line: string): number[] {
  const found: number[] = [];
  for (const match of line.matchAll(MONEY)) {
    const cents = parseAmountToCents(match[0].replace('−', '-'));
    if (cents !== null) found.push(Math.abs(cents));
  }
  return found;
}

export function extractReceiptFields(text: string, source: ReceiptFields['source']): ReceiptFields {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let total: number | null = null;
  let guess = false;
  for (const line of lines) {
    if (TOTAL_WORDS.test(line) && !NOT_TOTAL.test(line)) {
      const amounts = moneyIn(line);
      if (amounts.length) total = amounts[amounts.length - 1]; // the last matching line wins: totals come at the bottom
    }
  }
  if (total === null) {
    const all = lines.flatMap(moneyIn);
    if (all.length) { total = Math.max(...all); guess = true; }
  }

  let vat: number | null = null;
  let rate: number | null = null;
  for (const line of lines) {
    if (!VAT_WORDS.test(line)) continue;
    const percent = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line);
    if (percent && rate === null) rate = Number(percent[1].replace(',', '.'));
    const amounts = moneyIn(line);
    if (amounts.length && !/\b(reg|registration|nr|no|number)\b/i.test(line)) vat = amounts[amounts.length - 1];
  }
  if (vat !== null && total !== null && vat >= total) vat = null; // a "VAT" figure larger than the total is a misread

  let date: string | null = null;
  for (const line of lines) {
    const match = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/.exec(line);
    if (match) {
      const parsed = parseStatementDate(match[1], 'DMY').iso;
      if (parsed) { date = parsed; break; }
    }
  }

  const joined = text.slice(0, 4000);
  const currency = /€|\bEUR\b/.test(joined) ? 'EUR' : /£|\bGBP\b/.test(joined) ? 'GBP' : /\bUSD\b|\$/.test(joined) ? 'USD' : null;
  const invoice = /\b(?:invoice|arve|rechnung)\b\s*(?:no\.?|nr\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,24})/i.exec(text);
  const vendor = lines.find(l => /[A-Za-zÄÖÜÕäöüõ]{3}/.test(l) && moneyIn(l).length === 0 && !/^(invoice|receipt|arve|tšekk|kvittung|rechnung)\b/i.test(l)) ?? null;

  return {
    source,
    vendor: vendor ? vendor.slice(0, 80) : null,
    date,
    currency,
    total_cents: total,
    total_is_guess: guess,
    vat_cents: vat,
    vat_rate: rate,
    invoice_number: invoice ? invoice[1] : null,
    text_chars: text.length
  };
}

export type ReceiptMatch = { amount: 'MATCHES' | 'DIFFERS' | 'UNKNOWN'; date: 'SAME_DAY' | 'WITHIN_7_DAYS' | 'FAR' | 'UNKNOWN' };

// Compares what was read from a receipt with the bank line it was attached to.
export function matchReceipt(fields: ReceiptFields, tx: { amount_cents: number; date: string }): ReceiptMatch {
  const amount = fields.total_cents === null ? 'UNKNOWN' : Math.abs(tx.amount_cents) === fields.total_cents ? 'MATCHES' : 'DIFFERS';
  let date: ReceiptMatch['date'] = 'UNKNOWN';
  if (fields.date) {
    const days = Math.abs(Date.parse(`${tx.date}T00:00:00Z`) - Date.parse(`${fields.date}T00:00:00Z`)) / 86_400_000;
    date = days === 0 ? 'SAME_DAY' : days <= 7 ? 'WITHIN_7_DAYS' : 'FAR';
  }
  return { amount, date };
}

export interface OcrEngine {
  recognise(image: Buffer, contentType: string): Promise<string>;
}

export class TesseractCli implements OcrEngine {
  private readonly binary: string;
  private readonly languages: string;
  private readonly timeoutMs: number;
  constructor(binary: string, languages = 'eng', timeoutMs = 60_000) {
    this.binary = binary;
    this.languages = languages;
    this.timeoutMs = timeoutMs;
  }
  recognise(image: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      // Image on stdin, text on stdout: nothing is written to disk.
      const child = execFile(this.binary, ['stdin', 'stdout', '-l', this.languages, '--psm', '6'], { timeout: this.timeoutMs, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) return reject(new Error(`OCR failed: ${(error as Error).message.split('\n')[0]}`));
        resolve(String(stdout));
      });
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(image);
    });
  }
}

export function configuredOcr(env: NodeJS.ProcessEnv = process.env): OcrEngine | null {
  const binary = String(env.FINCLOSE_TESSERACT_PATH || '').trim();
  if (!binary) return null;
  const languages = String(env.FINCLOSE_OCR_LANGS || 'eng').trim();
  if (!/^[a-z_]{3,10}(\+[a-z_]{3,10})*$/i.test(languages)) return null;
  return new TesseractCli(binary, languages);
}

export async function readReceipt(
  bytes: Buffer,
  contentType: string,
  ocr: OcrEngine | null,
  pdfText: (bytes: Buffer) => Promise<string>
): Promise<{ fields: ReceiptFields } | { unreadable: string }> {
  if (contentType === 'application/pdf') {
    const text = await pdfText(bytes).catch(() => '');
    if (text.trim().length >= 20) return { fields: extractReceiptFields(text, 'PDF_TEXT') };
    return { unreadable: 'This PDF has no text layer (it looks scanned) and OCR for PDFs is not available. Attach a photo instead, or type the details in.' };
  }
  if (!ocr) return { unreadable: 'Reading photos needs the OCR program, which is not set up on this server. Type the details in instead.' };
  try {
    const text = await ocr.recognise(bytes, contentType);
    if (text.trim().length < 10) return { unreadable: 'No readable text was found in the image.' };
    return { fields: extractReceiptFields(text, 'OCR') };
  } catch (error) {
    return { unreadable: (error as Error).message };
  }
}
