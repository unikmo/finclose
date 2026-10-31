import { NextRequest, NextResponse } from 'next/server';
import { statusFor } from '../../../lib/finclose-backend';
import { authorisePackCall, connectionStore, httpError, readJsonBody } from '../../../lib/pack-route-support';
import { activateCompany, checkPartnerCode, validPartnerId } from '../../../lib/activation';
import { activationStore, clientIp, reviewPeriod } from '../../../lib/ledger-route-support';
import { reviewLedger } from '../../../lib/ledger-review';
import type { LedgerSource } from '../../../lib/ledger';
import { SmartAccountsClient } from '../../../lib/smartaccounts';
import { QuickBooksLedgerSource } from '../../../lib/quickbooks-ledger';
import { XeroLedgerSource } from '../../../lib/xero-ledger';
import { xeroAccess } from '../../../lib/xero-connector';
import { connectorsEnabled } from '../../../lib/connectors';
import { OAUTH_PROVIDERS, oauthAccess } from '../../../lib/oauth-connect';
import { FreshBooksLedgerSource } from '../../../lib/freshbooks-ledger';
import { ZohoLedgerSource } from '../../../lib/zoho-ledger';
import { checkRateLimit } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// POST  -> a read-only review of a client's own accounting system. Output is PROPOSALS for a person;
// nothing is written to the accounting system and nothing the system returned is stored here.
//
//   SmartAccounts: { provider:"smartaccounts", partner_id, partner_code, country, reg_code,
//                    period_from, period_to, apikey, secret }
//     The keys are used for this one request and are not stored or logged. They pass through this
//     server (the provider's CORS rules for direct browser calls are unchecked).
//   Xero, QuickBooks, FreshBooks, Zoho Books:
//                  { provider, company_id, partner_id, partner_code, country, reg_code, period_* }
//                  and a signed-in user with access to that company; uses the sealed connection made
//                  through /api/connectors/xero or /api/connectors/oauth/<provider>.
//                  (QuickBooks also accepts { access_token, realm_id, sandbox? } with no company_id.)
//
// A company is counted for its partner only after the read succeeded (see lib/activation.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 20_000);
    const provider = String(body.provider || '');
    const partnerId = validPartnerId(body.partner_id);
    if (!checkPartnerCode(partnerId, body.partner_code)) throw httpError('the partner code is not valid', 403);
    checkRateLimit(`ledger:partner:${partnerId}`, 60, 60_000);
    checkRateLimit(`ledger:ip:${clientIp(req.headers)}`, 20, 60_000);
    const period = reviewPeriod(body.period_from, body.period_to);

    let source: LedgerSource;
    if (provider === 'smartaccounts') {
      source = new SmartAccountsClient({
        creds: { apikey: String(body.apikey || ''), secret: String(body.secret || '') },
        fetchFn: (url, init) => fetch(url, { method: init?.method, headers: init?.headers, body: init?.body, cache: 'no-store' })
      });
    } else if (provider === 'quickbooks' || provider === 'freshbooks' || provider === 'zohobooks') {
      const fetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => fetch(url, { method: init?.method, headers: init?.headers, body: init?.body, cache: 'no-store' });
      const oauth = OAUTH_PROVIDERS[provider];
      if (provider === 'quickbooks' && body.access_token && !body.company_id) {
        // A token supplied by hand, e.g. from Intuit's sandbox tools. The sign-in flow is the normal route.
        source = new QuickBooksLedgerSource({ fetchFn, access_token: String(body.access_token), realm_id: String(body.realm_id || ''), sandbox: body.sandbox === true, country: String(body.country || 'US') });
      } else {
        const caller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT', 20);
        const store = await connectionStore();
        const auth = () => oauthAccess(oauth, store, fetchFn, caller.company_id);
        if (provider === 'quickbooks') {
          const live = await auth();
          source = new QuickBooksLedgerSource({ fetchFn, access_token: live.token, realm_id: live.tenantId, sandbox: String(process.env.QUICKBOOKS_SANDBOX || '') === 'true', country: String(body.country || 'US') });
        } else if (provider === 'freshbooks') {
          source = new FreshBooksLedgerSource({ fetchFn, auth });
        } else {
          source = new ZohoLedgerSource({ fetchFn, auth, api_base: process.env.ZOHO_API_URL, country: String(body.country || 'US') });
        }
      }
    } else if (provider === 'xero') {
      if (!connectorsEnabled()) throw httpError('connectors are switched off on this server', 403);
      const caller = await authorisePackCall(req, body.company_id, 'ACCOUNTANT', 20);
      const store = await connectionStore();
      const fetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => fetch(url, { method: init?.method, headers: init?.headers, body: init?.body, cache: 'no-store' });
      source = new XeroLedgerSource({ fetchFn, auth: () => xeroAccess(store, fetchFn, caller.company_id), country: String(body.country || 'GB') });
    } else {
      throw httpError('provider must be smartaccounts, xero, quickbooks, freshbooks or zohobooks', 400);
    }

    const snapshot = await source.snapshot(period);
    const review = reviewLedger(snapshot);
    const activation = await activateCompany(await activationStore(), { partner_id: partnerId, partner_code: body.partner_code, country: body.country, reg_code: body.reg_code });
    return NextResponse.json({ review, activation: { token: activation.token, month: activation.month, counted_as_new_account_this_month: activation.first_run_this_month } }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: statusFor(error) });
  }
}
