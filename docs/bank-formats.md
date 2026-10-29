# Bank and service export formats

Checked 2026-10-29. This records how well each export layout is sourced. **No real export from any of these has been parsed yet.** The files in `tests/fixtures/banks/` are invented rows in the documented layout, so they show the parser handles that layout, not that a real file parses.

| Source | Headers sourced from | Status |
|---|---|---|
| LHV (English CSV) | LHV "Formats for internet bank" page, section for the account statement CSV, valid from 25.02.2026 | Headers confirmed from the bank. Delimiter, date format and the D/C values are not specified there (the page says users set separators themselves). The fixture assumes comma, ISO dates and `D`/`C`. |
| Stripe balance report | Stripe docs, "Balance report type" (columns `balance_transaction_id`, `created_utc`, `currency`, `gross`, `fee`, `net`, ...) | Column names confirmed from Stripe. `fee` is "fees paid" in major units; `net` is net. The parser books `gross` as the amount and `fee` as a separate outgoing row, so the rows sum to the report's net. |
| Wise | Open-source `ledger-autosync` Wise plugin (reads `TransferWise ID`, `Date`, `Amount`, `Currency`, `Description`, `Payer Name`, `Payee Name`, `Merchant`, `Total fees`; dates `%d-%m-%Y`) | Secondary source (code written against real exports). Wise says column sets vary and business accounts add columns. `Total fees` is not booked again, because it is not confirmed that `Amount` excludes it. Check on a real file. |
| Revolut | Not confirmed. Public pages found describe other Revolut exports and say the CSV has changed over time | **Unverified.** The fixture uses the commonly cited `Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`. Treat as a guess until a real file passes. |
| Swedbank Estonia | Not confirmed. No public document found | **Unverified.** The fixture is "Estonian-style", with a title block above the header, `Reatüüp` row-type codes (10 opening, 20 payment, 82 turnover, 86 closing) and decimal commas. The row-type codes come from memory and are not sourced. |

## What the parser does with them
- Looks for the column names in the first 25 lines, so account details above the header are skipped (and reported).
- Picks columns by name, not position. For each field the first matching name in its alias list wins.
- Rejects, with a reason, rows whose state is pending, declined, reverted, failed, cancelled or rejected, and rows with row-type 10, 82 or 86. Rejected rows are listed in the result, never dropped silently.
- A `fee` column becomes a separate outgoing row described "Bank fee: ...", so the categoriser sends it to bank and payment fees.
- Wise payer and payee names: the payee is the other party for money out, the payer for money in.
- File encoding: UTF-8, UTF-8 with BOM, UTF-16 and, when the bytes are not valid UTF-8, Windows-1257 (assumed). The upload screens read files through this.

## Not handled
- Multi-currency statements are read but not converted.
- Excel files (.xlsx) are refused. Bank PDFs are not read.
- Camt.053 / MT940 / ISO 20022 XML, which Estonian banks also offer, are not parsed.

## To move a row from "unverified" to "verified"
Parse one real export from that bank, add it (with names and account numbers removed) as a fixture, and change its status here. Do this for at least three exports per bank, covering a month with a fee, a refund and a foreign-currency payment.
