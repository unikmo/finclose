import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../../lib/finclose-backend';
import { authorisePackCall, documentStore, httpError, readJsonBody } from '../../../../lib/pack-route-support';
import { defaultSecurityState, readDocument, reviewDocument, scanDocument, uploadDocument } from '../../../../lib/document-intake';
import { configuredOcr } from '../../../../lib/receipt-extract';
import { extractPdfPlainText } from '../../../../lib/pdf-text';
import { configuredScanner } from '../../../../lib/malware-scan';
import { FINANCIAL_UPLOAD_SECURITY } from '../../../../lib/file-security';
import { uploadQuarantineMode } from '../../../../lib/runtime-mode';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// Receipts and invoices for a company's review packs.
//   GET  ?company_id=            list (VIEWER)
//   POST multipart: company_id, file   upload (ACCOUNTANT); real-data uploads start QUARANTINED
//   PUT  json: company_id, document_id, decision CLEAN|REJECTED, note?   (ADMIN, a different person than the uploader)
//   PUT  json: company_id, document_id, action "scan"   (ACCOUNTANT; SCANNER mode only, retries a scan that could not decide)

const publicView = (r: { document_id: string; filename: string; content_type: string; bytes: number; sha256: string; status: string; security_review_status: string; uploaded_at: number; extracted?: unknown; read_note?: string }) => ({
  document_id: r.document_id, filename: r.filename, content_type: r.content_type, bytes: r.bytes, sha256: r.sha256, status: r.status, security_review_status: r.security_review_status, uploaded_at: r.uploaded_at, extracted: r.extracted ?? null, read_note: r.read_note ?? null
});

// Reads a clean receipt for suggested details. Never allowed to fail the upload that triggered it.
async function tryRead(documentId: string, companyId: string) {
  try {
    return await readDocument(await documentStore(), documentId, companyId, configuredOcr(), extractPdfPlainText);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = await authorisePackCall(req, req.nextUrl.searchParams.get('company_id'), 'VIEWER');
    const list = await (await documentStore()).listByCompany(caller.company_id);
    return NextResponse.json({ documents: list.map(publicView) }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > FINANCIAL_UPLOAD_SECURITY.max_bytes + 100_000) throw httpError('file exceeds the 25 MB upload limit', 413);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw httpError('a file is required', 400);
    const caller = await authorisePackCall(req, form.get('company_id'), 'ACCOUNTANT', 30);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadDocument(await documentStore(), { company_id: caller.company_id, organization_id: caller.organization_id, actor: { user_id: caller.user_id }, filename: file.name, bytes }, await defaultSecurityState());
    // SCANNER mode: scan straight away. A scanner that is down leaves the file quarantined; PUT action=scan retries.
    let record = !result.duplicate && result.record.status === 'QUARANTINED' && uploadQuarantineMode() === 'SCANNER'
      ? await scanDocument(await documentStore(), result.record.document_id, caller.company_id, configuredScanner(), 'SCANNER')
      : result.record;
    if (!result.duplicate && record.status === 'CLEAN') record = (await tryRead(record.document_id, caller.company_id)) || record;
    return NextResponse.json({ document: publicView(record), duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 5_000);
    if (body.action === 'scan') {
      const scanCaller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT', 30);
      let scanned = await scanDocument(await documentStore(), String(body.document_id || ''), scanCaller.company_id, configuredScanner(), uploadQuarantineMode());
      if (scanned.status === 'CLEAN' && !scanned.extracted && !scanned.read_note) scanned = (await tryRead(scanned.document_id, scanCaller.company_id)) || scanned;
      return NextResponse.json({ document: publicView(scanned) }, { headers: NO_STORE });
    }
    if (body.action === 'read') {
      const readCaller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT', 30);
      const read = await readDocument(await documentStore(), String(body.document_id || ''), readCaller.company_id, configuredOcr(), extractPdfPlainText);
      return NextResponse.json({ document: publicView(read) }, { headers: NO_STORE });
    }
    const caller = await authorisePackCall(req, body.company_id, 'ADMIN');
    const record =await reviewDocument(await documentStore(), String(body.document_id || ''), caller.company_id, { user_id: caller.user_id }, body.decision as 'CLEAN' | 'REJECTED', String(body.note || ''), uploadQuarantineMode());
    const reviewed = record.status === 'CLEAN' ? (await tryRead(record.document_id, caller.company_id)) || record : record;
    return NextResponse.json({ document: publicView(reviewed) }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
