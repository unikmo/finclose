import path from 'node:path';

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
  note: 'v0.33 validates file type, filename, size and magic bytes. A dedicated malware scanning service remains required before unrestricted production upload volume.'
} as const;
