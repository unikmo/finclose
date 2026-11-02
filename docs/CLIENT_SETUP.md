# FinClose on the client's own computer

FinClose runs on the client's computer, inside the client's own Claude account. The client activates
their own Claude (a paid plan on the Claude desktop app). We host nothing for them and see none of
their books.

## What goes where

| What | Where it goes |
|---|---|
| SmartAccounts API key and secret | Stay on the client's computer (Claude Desktop keeps them in the system's secure storage). Sent only to SmartAccounts. |
| Xero / Zoho Books sign-in tokens | Kept in a file only for that user, in `~/.finclose/connections.json`. Sent only to Xero or Zoho. |
| The books read from the accounting system | Read on the client's computer. Shown to the client's own Claude. |
| The review (proposals for the accountant) | Computed on the client's computer. |
| Partner id, partner code, country, company registry number | Sent to FinClose, once per review, to count the partner's client companies. Nothing else. |

FinClose never writes to the accounting system and decides nothing.

## Build the installer (partner or operator, once per release)

```
npm install
npm run build:extension
```

This makes `dist/finclose.mcpb`, one file of about 250 kB. Give it to the client.

## Install (client)

1. Install the Claude desktop app and sign in with the client's own account.
2. Double-click `finclose.mcpb` (or drag it into Claude Desktop, Settings, Extensions). No Node.js or
   folder is needed.
3. Fill in the form it shows: partner id, partner code, country, registry number, and either the
   SmartAccounts keys or the Xero / Zoho app id your partner gives you.
4. SmartAccounts: create an API key with read-only rights, and paste it in step 3.
5. Xero or Zoho Books: ask Claude "Connect FinClose to Xero". A browser tab opens; approve read access.
6. Ask Claude: "Use FinClose to review my books for October 2026."

## Developer route (no installer)

Run from a checkout: add `local/finclose-local.ts` to Claude Desktop's `mcpServers` with
`node --experimental-strip-types --import ./tests/register-ts-resolve.mjs local/finclose-local.ts`
and the `FINCLOSE_*` variables listed in `extension/manifest.json`.

## Limits, stated plainly

- **QuickBooks Online and FreshBooks stay on the hosted path.** Their token step needs a client
  secret and nothing we could read says either offers a secretless (PKCE) flow. Putting our secret
  on client computers would leak it. They connect through FinClose's server, read-only. Ask Intuit
  and FreshBooks in writing whether a public-client flow exists; if yes, add them to
  `local/oauth-local.ts`.
- **ChatGPT cannot run this.** ChatGPT does not start programs on the user's computer; it only
  connects to servers reachable over HTTPS. A hosted server would break the rule that nothing runs
  on ours. Claude Desktop is the supported route.
- **Not yet run against real services.** The SmartAccounts, Xero and Zoho readers and the sign-in
  have only run against test doubles. The Xero and Zoho app registrations (a public client with the
  redirect `http://localhost:8731/callback`) still have to be created by the operator.
- **The `.mcpb` has not been installed in a real Claude Desktop yet.** The bundled server starts and
  answers over the protocol; the install form is from the extension format's published manifest.
- Certification of the hosted service is done last, before merging to main.
