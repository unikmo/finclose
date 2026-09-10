# FinClose Auth Email Delivery Verification Record — v0.35.2

Pilot-activation blocker P0 #5 (`auth_email_human_delivery` certification gate) · issue #21

Project: `theantibalcony` (Firebase Auth)
Date: 2026-09-09
Performed by: Claude, on Tichi Mbanwie's instruction; pending Tichi countersignature
Policy reference: `docs/AUTH_EMAIL_DELIVERY_VERIFICATION_V1.md`
Runtime at time of test: `LAB` (pre-activation)
Bound to certification run `20260910100816_3d1f24a83c`, source SHA `6996db90439bc3889c51571cbd7981d621073e69`

## Sending configuration under test

Firebase Auth custom SMTP (Authentication → Templates → SMTP settings), enabled:
- Sender: `hello@antibalcony.com`
- SMTP host: `sxb1plzcpnl503971.prod.sxb1.secureserver.net` · port `465` · SSL
- Auth user: `hello@antibalcony.com` (GoDaddy/HostEurope cPanel mailbox, added as addon domain on the shared cPanel account)
- Server TLS verified independently: cert `CN=*.prod.sxb1.secureserver.net`, chain OK.

DNS for `antibalcony.com` (authoritative at GoDaddy):
- `mail.antibalcony.com` A → `92.205.12.15`
- MX → `mail.antibalcony.com` (pri 0)
- SPF TXT → `v=spf1 a mx ptr include:secureserver.net ~all`
- DMARC: not yet published (recommended follow-up: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:hello@antibalcony.com`)
- DKIM: cPanel "Email Deliverability" tool is disabled by the reseller on this account; DKIM is a documented follow-up via the HostEurope hosting panel. SPF alignment is in place.

## Controlled mailbox

`mbanwie@gmail.com` (= the connected `mbanwie@googlemail.com` inbox). A disposable Firebase Auth user was created for this address, used only for the delivery test, and deleted afterwards (`accounts:delete`, HTTP 200).

## Results

| Email type | Triggered (UTC) | Delivered | Placement | From | Renders |
|---|---|---|---|---|---|
| Password reset | 2026-09-09 07:08:17 | Yes | Inbox (not spam/junk) | `hello@antibalcony.com` | OK — "Reset your password for theantibalcony", body + action link intact |
| Email verification | 2026-09-09 07:10:45 | Yes | Inbox (not spam/junk) | `hello@antibalcony.com` | OK — "Verify your email for theantibalcony", body + action link intact |

A third password-reset email at 06:38:30 UTC also delivered to the inbox (earlier test cycle).

OOB links / codes were viewed only to confirm the template rendered and are **not** retained here, per policy.

Note: cPanel "Track Delivery" showed no records for these sends — GoDaddy/cPanel does not surface external SMTP-AUTH relays in that report. Delivery is evidenced by the actual recipient inbox.

## Conclusion

Both mandatory email types (verification, password reset) were delivered to a real external mailbox, landed in the inbox, and rendered correctly, sent from the branded `hello@antibalcony.com` sender.

`FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED=YES` set in the `finclose-lab-preview` Vercel project (Production), 2026-09-09.

## Open follow-ups (not blocking this record)

- Publish DKIM for `antibalcony.com` (HostEurope hosting panel → DKIM aktivieren → TXT at GoDaddy).
- Publish DMARC `_dmarc.antibalcony.com` (`p=none` to start).
- Gmail SMTP path abandoned (never delivered on the default Firebase sender or the interim Gmail app-password config) — superseded by this.
