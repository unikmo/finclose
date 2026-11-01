import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, httpError } from '../../../lib/pack-route-support';
import { FINANCIAL_UPLOAD_SECURITY, validateFinancialUpload } from '../../../lib/file-security';
import { extractStatementFromPdf } from '../../../lib/pdf-text';
import { configuredScanner, scanBytes } from '../../../lib/malware-scan';
import { isRealDataMode, uploadQuarantineMode } from '../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// POST multipart: company_id, file (a text-based PDF bank statement)  -> { csv_text, ... }  (ACCOUNTANT)
// The PDF is read in memory and never stored; the caller gets CSV text back and sends it to the
// normal pack routes. The file is still checked first: signature, built-in active-content checks,
// and the malware scanner when one is configured. In real-data mode a scanner that cannot say
// CLEAN stops the read, the same rule as for receipts.
export async function POST(req: NextRequest) {
  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > FINANCIAL_UPLOAD_SECURITY.max_bytes + 100_000) throw httpError('file exceeds the 25 MB upload limit', 413);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw httpError('a file is required', 400);
    await authorisePackCall(req, form.get('company_id'), 'ACCOUNTANT', 20);
    const bytes = Buffer.from(await file.arrayBuffer());
    const checked = validateFinancialUpload(file.name, bytes, 'current_source');
    if (checked.extension !== '.pdf') throw httpError('this route reads PDF statements only', 415);
    const scanner = configuredScanner();
    const verdict = await scanBytes(bytes, scanner);
    if (verdict.verdict === 'INFECTED') throw httpError(`the file was rejected by the security check (${verdict.signature})`, 422);
    if (verdict.verdict === 'ERROR' && isRealDataMode() && uploadQuarantineMode() === 'SCANNER') throw httpError('the security scan could not be completed, so the PDF was not read. Try again later', 503);
    const result = await extractStatementFromPdf(bytes);
    return NextResponse.json({ ...result, scanned: verdict.verdict === 'CLEAN' }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
