# FinClose Controlled Pilot Upload Review Procedure v1

Effective date: 2026-09-07
Scope: controlled PILOT only
Status: READY FOR OPERATOR ADOPTION; NOT A PRODUCTION MALWARE-SCANNING SUBSTITUTE

## Purpose

This procedure defines the human security control required before FinClose may use `FINCLOSE_UPLOAD_QUARANTINE_MODE=MANUAL_REVIEW` for a controlled real-data pilot. It is deliberately narrow. Manual review is permitted only for trusted pilot sources and does not replace an automated malware scanner for unrestricted production.

## Allowed pilot sources

A file may enter the controlled pilot only when its provenance is known and attributable to one of the following:

1. A direct export produced by the pilot customer's accounting, payroll or banking system.
2. A statement/document downloaded by the pilot customer directly from a known bank, tax authority, payroll provider or accounting platform.
3. A file prepared by the pilot customer from its own records and transferred directly to the FinClose controlled upload flow.

Do not accept files forwarded from unknown senders, public download links, unsolicited email attachments, third-party file-sharing links of uncertain provenance or files whose origin cannot be independently explained by the pilot customer.

## File boundary

The application already enforces:

- maximum size: 25 MB;
- allowlist: `.xlsx`, `.csv`, `.pdf`, `.png`, `.jpg`, `.jpeg`;
- filename sanitization;
- content-signature / magic-byte validation;
- no executable file types;
- no macro-enabled Office formats;
- SHA-256 fingerprinting;
- tenant/deployment-scoped private Firebase Storage path;
- quarantine status before operational use.

A file that fails application validation is rejected before manual review and must not be manually overridden.

## Reviewer authorization

Only a user authorized as `ADMIN` for the same FinClose organization/deployment may perform the manual review action. The reviewer must authenticate through the managed Firebase customer identity path in PILOT.

The review endpoint must verify deployment and organization ownership before the artifact can be downloaded or decided.

## Review procedure

For each quarantined artifact:

1. Confirm the expected customer, organization, company, deployment and upload purpose.
2. Confirm the customer expected this specific file and can identify its source.
3. Confirm the displayed filename, file type, size and SHA-256 fingerprint are consistent with the upload record.
4. Download only through the FinClose ADMIN review route. The response is forced as an attachment and uses `no-store` and `nosniff` controls.
5. Inspect the file only on a current, patched, non-privileged review workstation with active endpoint protection. Do not enable macros, scripts, external content, document links or embedded active content.
6. For spreadsheets, prefer structural/data inspection. `.xlsx` is permitted; macro-enabled Office formats are not.
7. For PDFs/images, confirm the document content matches the declared financial source and does not unexpectedly request execution, credentials, external downloads or active content.
8. If provenance, content or behavior is uncertain, choose `REJECTED`. Do not use CLEAN as a convenience override.
9. Choose `CLEAN` only when source provenance and content are consistent with the expected financial record and no security anomaly is observed.
10. Add a concise review note identifying the provenance checked; do not place passwords, account credentials, authentication tokens or unnecessary personal data in the note.

## Decision semantics

- `CLEAN`: the quarantined artifact becomes `RECEIVED` and may advance the relevant FinClose workflow.
- `REJECTED`: the artifact remains unusable for operational accounting/payroll processing.
- Decisions are immutable through the review endpoint. A previously cleared/rejected artifact must not be flipped by a later review request.
- Concurrent conflicting review attempts must resolve to one immutable decision; last-writer-wins behavior is not permitted.

## Audit evidence

Each decision records, at minimum:

- organization/company/deployment identifiers;
- artifact kind and artifact ID;
- reviewer user ID;
- decision;
- timestamp;
- review note;
- underlying upload SHA-256 fingerprint.

Storage metadata synchronization failure must create a separate audit event and must not erase the authoritative review decision.

## Pilot restrictions

During `MANUAL_REVIEW` pilot mode:

- use only trusted pilot customers/sources;
- keep pilot volume deliberately low enough for every file to receive human review;
- no quarantined file may unlock onboarding/source completeness or reach accounting/payroll processing;
- no file may be auto-cleared;
- no customer may be told that manual review equals malware scanning;
- any suspicious file or review-process failure pauses new real-data uploads until investigated.

## Production boundary

`MANUAL_REVIEW` is not sufficient for unrestricted PRODUCTION. Production upload activation requires `SCANNER` mode plus an independently verified automated scanning worker, including failure/timeout behavior, before `FINCLOSE_PRODUCTION_RELEASE_GATE` may be approved.

## Operator adoption gate

Set `FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED=YES` only after the pilot operator has reviewed this procedure, confirmed a suitable review workstation/process exists, and accepted responsibility for following it. Merely having this document in the repository is not sufficient to set the flag.
