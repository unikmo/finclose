# Scanner, PDF and receipt reading, VAT worksheet, connectors, partner layer

Added 2026-10-31. Each item says what it does, how to switch it on, and what has NOT been checked.

## 1. Malware scanner (`lib/malware-scan.ts`)
- Two layers. A ClamAV daemon (`clamd`) over TCP is the only thing that can mark a file CLEAN. Built-in checks can only reject: the EICAR test file, script/launch actions in a PDF, and executables or scripts hidden in an image.
- Switch on: run clamd, set `FINCLOSE_UPLOAD_QUARANTINE_MODE=SCANNER` and `FINCLOSE_CLAMD_HOST` (and `FINCLOSE_CLAMD_PORT`, default 3310). The existing release gate also needs `FINCLOSE_UPLOAD_SCANNER_VERIFIED=YES`; that stays the operator's statement, not something the code sets.
- Fail closed: scanner down, timed out, unconfigured or giving an odd answer leaves the file QUARANTINED. `PUT /api/review-packs/documents {action:"scan"}` retries.
- Statement PDFs (`/api/statement-text`) are scanned first and are never stored.
- NOT checked: a real clamd. Tested only against a stand-in that speaks the INSTREAM protocol. Signatures are only as good as the clamd database you keep updated.

## 2. PDF statements (`lib/pdf-text.ts`) and receipts (`lib/receipt-extract.ts`)
- Text-based PDF statements are turned into CSV (column headings found from the table, or a flagged guess without headings) and then go through the normal intake. Opening/closing balance lines are offered as suggestions. Scanned PDFs are refused with the reason.
- Receipts: text PDFs are read directly. Photos need the Tesseract program on the server: set `FINCLOSE_TESSERACT_PATH` (and `FINCLOSE_OCR_LANGS`, e.g. `eng+est`). It runs locally; the image does not leave the server. Without it, photos are not read and the owner types the answer.
- Read values (vendor, date, total, VAT, invoice number) are suggestions shown beside the receipt. Nothing is booked from them.
- New dependency: `pdfjs-dist` 4.10.38 (exact), loaded only when a PDF is read, listed as an external package in `next.config.mjs`.
- NOT checked: any real bank PDF, any real receipt, Tesseract itself (the adapter was tested with a stand-in), scanned PDFs (no OCR for PDF pages), non-Latin scripts.

## 3. VAT (`lib/vat-summary.ts`, `lib/vat-return.ts`, `lib/jurisdictions.ts`)
- Sales VAT: a reviewer sets the treatment "VAT charged on a local sale" and a rate; it counts only with a linked sales invoice. The journal then splits output VAT out of the sale.
- VAT return WORKSHEET: output VAT, input VAT, reverse charge, net payable or refundable, what was not counted and why, CSV download. It is not a filing and uses no form-box numbers (`kmd_mapping: NOT_MAPPED`).
- Countries: EE, LV, LT, FI, DE, GB, US, GENERIC. Only the Estonian standard rate is confirmed. All others are UNVERIFIED and every pack for them says so. The US has no VAT; sales tax is not handled.
- NOT checked: reduced-rate scope anywhere, Estonian KMD box layout, any filing deadline other than the Estonian 20th (also unchecked), EU B2B/export treatment (listed as "sales with no VAT charged", for the accountant to classify).

## 4. Connectors (`lib/connectors.ts`, `lib/xero-connector.ts`)
- Works today with no credentials: journal CSV, and a Xero manual-journal import CSV.
- Xero live connector coded: OAuth 2.0 with PKCE, sealed token storage (AES-256-GCM), token refresh with rotation, and push of the proposed journal as DRAFT manual journals (never posted), one per day, once per pack content.
- Switch on: `FINCLOSE_CONNECTORS_ENABLED=true`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` (must point at `/api/connectors/xero`), `FINCLOSE_TOKEN_KEY` (32+ characters, keep it safe: losing it means everyone reconnects), optionally `XERO_SCOPES`.
- Erasing a company's data deletes its stored tokens. The user should also revoke FinClose inside Xero.
- NOT checked: the real Xero (endpoints, scopes and field names are from recollection of its public docs), the Xero import template columns, QuickBooks, DATEV and SmartAccounts (not built).

## 5. Partner layer (`lib/partner-layer.ts`, routes `app/api/firm-*`, pages `/firm/partner` and `/firm/join`)
- Staff invitations: one-time link (FinClose sends no email), stored hashed, accepted only by the invited and verified email, seven-day expiry, nobody can invite above their own role.
- Client invitations and staffing routes over the existing consent model, with the plan's client limit.
- Plan and usage: price per client per month, client and staff limits, a monthly usage statement and CSV. No payment provider: nothing is charged.
- Branding: name, colour, https logo, support email, footer. Clients see only that, on their pack and in the pack's Markdown.
- Close calendar and deadlines, cross-client exception queue, staff workload. Month-close due day is a firm setting. A generated VAT-return deadline exists only for VAT-registered Estonian clients, from an unchecked rule. Firms can add custom deadlines.
- Security fix found on the way: `/api/firm-portfolio` showed every client to every firm member. Below PARTNER it now shows only assigned clients, as every other firm action already required.
- Needs real-data mode (firm membership lives in the Realtime Database). In LAB mode these routes answer 409 with a clear message.
- NOT checked: the partner pages in a browser, any flow against a real Firebase project, accept-by-client UI (the API exists; there is no screen for the client's admin to accept), Stripe or any invoicing, revenue share.

## 6. Review inside the client's own accounting system (added 2026-10-31, second pass)
Direction agreed with the owner: FinClose works inside the system the client already uses, reads it with the client's own access, and **proposes only**. It decides nothing and writes nothing to the client's books. The client registers nothing with FinClose.

- **Common shape** (`lib/ledger.ts`): every system is read into one snapshot (accounts, VAT codes, bank accounts, invoices, payments, ledger entries). Only GET requests are made.
- **Review** (`lib/ledger-review.ts`): eight checks (unbalanced entries, missing documents, duplicate supplier invoices, VAT arithmetic, VAT rate not in the country's list, long-overdue invoices, unmatched payments, entries outside the period). Output is proposals with the rule, the records, and a suggested action for a person. The headline is never "books are correct": the best it says is "the N checks run found nothing", with a list of what was not checked. Anything the adapter could not read makes the status DATA_INCOMPLETE.
- **SmartAccounts** (`lib/smartaccounts.ts`): built from the provider's own API specification v1.7 (28.04.2025): HEX HMAC-SHA256 signing over the URL parameters plus body, ddMMyyyyHHmmss Estonian-time timestamp, limits of 60/minute and 1000/day (the reader stops at 300 requests per run), paging by `hasMoreEntries`. The client creates an API key in SmartAccounts (Settings > Connected services > API) and should narrow the API user group to read-only rights there. **Not checked:** any real SmartAccounts company (a call with a fake key reached the real host and got 401, which proves the host and path exist, not that the signature is right); the names of the arrays in real responses (the reader accepts several names and falls back to the first array); whether a read-only group works for every call; the account-balance endpoint (not described in the specification, left unread).
- **Xero** (`lib/xero-ledger.ts`) reads with the existing Xero sign-in; **QuickBooks** (`lib/quickbooks-ledger.ts`) reads from an access token (no QuickBooks sign-in is built; attachments and payments are not read, so two checks cannot run on it). Both from recalled documentation, run only against stand-ins.
- **DATEV** (`lib/datev-export.ts`): file export of the proposed journal (Buchungsstapel layout as recalled, first 14 columns only). No German accountant has imported one. No live DATEV connection exists.
- **Counting** (`lib/activation.ts`, `/api/ledger-review`, `/api/activations`): a company is counted for a partner when a review run succeeds. The count is distinct companies (country + registry number) per partner per month, with the number of runs. A partner needs a partner code that only the operator can issue (operator bearer token, `GET /api/activations?partner_id=...&issue_code=1`), so nobody can inflate a partner's count. A failed read is not counted. Each count returns a signed token. **Limits:** whoever holds a modified copy of the code can skip the call, so the contract has to back the count; the registry number is typed by the user and cannot be checked against the key (SmartAccounts has no company-profile endpoint in the specification); the request limiter is per server process.
- **Where keys go:** in this version the key and secret travel to our server for one request and are neither stored nor logged. Whether SmartAccounts allows browser calls directly (which would keep the keys on the client's machine) is not known; the reader is plain code that could run in a browser.
- **Switch on:** set `FINCLOSE_ACTIVATION_KEY` (32+ characters) and `CRON_SECRET` or `FINCLOSE_CRON_TOKEN` (the operator token). In real-data mode counts are kept in Firestore (`finclose_prod_activations`; needs a composite index on `partner_id` + `month`, not yet created or tested against the emulator).
- **Not built:** a screen for any of this (it is API only), merging a review with an uploaded bank statement, Merit/Directo/Fortnox/other systems, writing drafts back into SmartAccounts.

## 7. United States systems (added 2026-10-31, third pass)
The owner's requirement: at least three US systems. Now present, all READ-ONLY reviews that propose and never write, all sharing one sign-in implementation (`lib/oauth-connect.ts`) and sealed token storage:

| System | Reader | Sign-in | How well it is sourced |
|---|---|---|---|
| QuickBooks Online | `quickbooks-ledger.ts` (accounts, tax rates, bills, invoices, journal entries) | `/api/connectors/oauth/quickbooks` | URLs, scopes, query syntax, field names all from memory |
| FreshBooks | `freshbooks-ledger.ts` (bills, invoices, expenses) | `/api/connectors/oauth/freshbooks` | Endpoints, bill/invoice/expense fields, authorize and token URLs, one-time refresh tokens and the bills scope were read from FreshBooks' own pages. Paging parameter names, response envelope, the call that finds the account id and the other scope names are assumed |
| Zoho Books | `zoho-ledger.ts` (chart of accounts, taxes, bills, invoices) | `/api/connectors/oauth/zohobooks` | All from memory: Zoho's documentation returned HTTP 403 |
| Xero (also used in the US) | `xero-ledger.ts` | `/api/connectors/xero` | from memory |

- Switch on per provider: `FINCLOSE_CONNECTORS_ENABLED=true`, `<PREFIX>_CLIENT_ID`, `<PREFIX>_CLIENT_SECRET`, `<PREFIX>_REDIRECT_URI` (prefixes QUICKBOOKS, FRESHBOOKS, ZOHO), `FINCLOSE_TOKEN_KEY`. Optional: `*_SCOPES`, `QUICKBOOKS_SANDBOX=true`, `ZOHO_ACCOUNTS_URL` / `ZOHO_API_URL` for a non-US Zoho data centre.
- A sign-in that returns more than one business or organisation is refused; the user reconnects with the one for the company.
- US limits: the United States has no VAT, so the VAT checks do nothing there; state sales tax is not handled. FreshBooks and Zoho readers cannot run the entry-balance, VAT-code or unmatched-payment checks (they do not read those records), and the review lists that under "not checked". QuickBooks does not read attachments or payments.
- NOT checked for any of them: a real sandbox or account, the developer-app registration and review each vendor requires before real customers can connect (QuickBooks and Xero run app review; terms and any per-connection fees were not looked up), rate limits, response shapes. Which US systems are actually the most used by the target partners' clients is the owner's market knowledge; it was not verified here. Wave, Sage, NetSuite and others are not built.
