import path from 'node:path';
import * as XLSX from 'xlsx';

export type FinancialUploadPurpose = 'initialization' | 'historical_context' | 'current_source';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.csv', '.pdf', '.png', '.jpg', '.jpeg']);

function httpError(message: string, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function startsWith(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((value, index) => buffer[index] === value);
}

function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) return false;
  let controls = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  return sample.length === 0 || controls / sample.length < 0.01;
}

// --- Pilot PII intake guard (structured uploads only: CSV / XLSX) ---
//
// Pilot design principle: FinClose calculates payroll/bookkeeping controls
// off an opaque employee_id plus financial figures ONLY -- no engine in
// this codebase reads or needs a name, SSN, national ID, date of birth, or
// contact detail (see lib/payroll-engine*.ts, where `name` is optional and
// unused in any calculation). Pilot providers are asked to supply their
// OWN randomized employee identifier and keep the identifier<->person
// mapping on their own side, so FinClose never receives direct identifiers
// in the first place.
//
// If a file arrives with an identifying column anyway, this REJECTS the
// upload outright -- not a strip-and-continue -- so the data never reaches
// storage or processing (every caller of validateFinancialUpload runs it
// BEFORE writing to storageBucket()). The thrown error names the exact
// column(s) to remove, so the uploader can fix and resubmit without any
// back-and-forth support ticket.
//
// DISCLOSED LIMITATION: this scan only reads the HEADER ROW of a CSV/XLSX
// file -- it does not inspect cell values, and it does not scan PDF/PNG/JPG
// uploads at all (those are typically scanned statements/receipts, not
// structured employee lists; OCR-based content scanning is out of scope
// this pass). A provider could still embed a name inside, say, a free-text
// "Notes" column this pattern list doesn't catch -- this is a header-name
// guard, not a guarantee that no cell anywhere contains PII.
const FORBIDDEN_COLUMN_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'employee name', pattern: /(full[ _-]?name|employee[ _-]?name|first[ _-]?name|last[ _-]?name|\bsurname\b|given[ _-]?name|\bname\b)/i },
  { reason: 'national ID / SSN / passport number', pattern: /(\bssn\b|social[ _-]?security|national[ _-]?id|\bpassport\b|\bnin\b|\bid[ _-]?number\b)/i },
  { reason: 'date of birth', pattern: /(date[ _-]?of[ _-]?birth|\bdob\b|birth[ _-]?date)/i },
  { reason: 'contact detail', pattern: /(\be-?mail\b|\bphone\b|\bmobile\b|\baddress\b|\bstreet\b)/i }
];

function findForbiddenColumns(headers: string[]): Array<{ column: string; reason: string }> {
  const hits: Array<{ column: string; reason: string }> = [];
  for (const raw of headers) {
    const column = String(raw || '').trim();
    if (!column) continue;
    const match = FORBIDDEN_COLUMN_PATTERNS.find(p => p.pattern.test(column));
    if (match) hits.push({ column, reason: match.reason });
  }
  return hits;
}

function extractCsvHeaders(buffer: Buffer): string[] {
  const text = buffer.toString('utf8');
  const firstLine = (text.split(/\r\n|\n|\r/, 1)[0] || '');
  return firstLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
}

function extractXlsxHeaders(buffer: Buffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 1 });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
    return (rows[0] || []).map(h => String(h ?? '').trim());
  } catch {
    return []; // unreadable as a spreadsheet -- the signature/format check below handles that failure
  }
}

function assertNoDirectIdentifierColumns(extension: string, buffer: Buffer) {
  if (extension !== '.csv' && extension !== '.xlsx') return; // scope: structured employee-list uploads only -- see header note
  const headers = extension === '.csv' ? extractCsvHeaders(buffer) : extractXlsxHeaders(buffer);
  const hits = findForbiddenColumns(headers);
  if (hits.length === 0) return;
  const columnList = hits.map(h => `"${h.column}" (${h.reason})`).join(', ');
  throw httpError(
    `This file was not accepted and was not stored. It contains a column that looks like it identifies a person directly: ${columnList}. ` +
    `FinClose only works with your own randomized employee identifier -- please remove ${hits.length === 1 ? 'this column' : 'these columns'} and keep the name<->identifier mapping on your side, then re-upload.`,
    422
  );
}

export function sanitizeFinancialFilename(filename: string) {
  const basename = path.basename(String(filename || '').trim());
  const safe = basename.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, '_').slice(0, 180);
  if (!safe || safe === '.' || safe === '..') throw httpError('valid filename is required', 400);
  return safe;
}

export function validateFinancialUpload(filename: string, buffer: Buffer, purpose: FinancialUploadPurpose) {
  const safeName = sanitizeFinancialFilename(filename);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError('file is empty', 400);
  if (buffer.length > MAX_BYTES) throw httpError('file exceeds the 25 MB upload limit', 413);
  const extension = path.extname(safeName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw httpError('unsupported file type; use XLSX, CSV, PDF, PNG or JPG', 415);
  }
  if (purpose === 'initialization' && extension !== '.xlsx') {
    throw httpError('initialization requires the FinClose XLSX template', 415);
  }

  let contentType = 'application/octet-stream';
  let signatureValid = false;
  if (extension === '.xlsx') {
    signatureValid = startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (extension === '.pdf') {
    signatureValid = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    contentType = 'application/pdf';
  } else if (extension === '.png') {
    signatureValid = startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    contentType = 'image/png';
  } else if (extension === '.jpg' || extension === '.jpeg') {
    signatureValid = startsWith(buffer, [0xff, 0xd8, 0xff]);
    contentType = 'image/jpeg';
  } else if (extension === '.csv') {
    signatureValid = looksLikeText(buffer);
    contentType = 'text/csv; charset=utf-8';
  }
  if (!signatureValid) throw httpError('file content does not match its extension', 415);

  assertNoDirectIdentifierColumns(extension, buffer);

  return {
    safe_name: safeName,
    extension,
    content_type: contentType,
    bytes: buffer.length,
    validation_status: 'FORMAT_VALIDATED' as const,
    malware_scan_status: 'NOT_INTEGRATED' as const
  };
}

export const FINANCIAL_UPLOAD_SECURITY = {
  max_bytes: MAX_BYTES,
  allowed_extensions: Array.from(ALLOWED_EXTENSIONS),
  macro_enabled_office_files_allowed: false,
  executable_files_allowed: false,
  content_signature_validation: true,
  malware_scanner_integrated: false,
  pii_column_guard_integrated: true,
  pii_column_guard_scope: 'CSV/XLSX header row only -- rejects (does not store) a file whose header row names a column that looks like an employee name, national ID/SSN/passport, date of birth, or contact detail. Does not inspect cell values or scan PDF/PNG/JPG content.',
  note: 'v0.34 validates file type, filename, size and magic bytes and adds quarantine-first controlled-pilot review. A verified automated malware scanner remains required before unrestricted production upload volume. The PII column guard (added for the pilot) rejects direct-identifier columns before any upload reaches storage -- pilot providers are asked to send their own randomized employee_id and keep the identifier<->person mapping on their own side.'
} as const;
