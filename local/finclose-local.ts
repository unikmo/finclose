import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SmartAccountsClient } from '../lib/smartaccounts';
import { reviewLedger } from '../lib/ledger-review';
import type { LedgerSource } from '../lib/ledger';
import { XeroLedgerSource } from '../lib/xero-ledger';
import { ZohoLedgerSource } from '../lib/zoho-ledger';
import { beginSignIn, isLocalProvider, localAccess, signInError, signInState, LOCAL_PROVIDERS } from './oauth-local';
import { spawn } from 'node:child_process';

// FinClose running on the CLIENT'S OWN computer, inside the client's own AI app (Claude Desktop or
// any app that speaks MCP). Nothing here runs on our servers:
//  - the accounting-system keys are read from this computer's environment and go only to the
//    accounting provider, never to us;
//  - the review is computed here, and the result goes only to the AI app the client signed in to
//    with their own account;
//  - the one thing sent to us is the partner's activation count: partner id, partner code, country
//    and company registry number (public information).
// It never writes to the accounting system. Every finding is a proposal for a person.

// When installed as an extension, a setting the client left blank can arrive as its unreplaced
// placeholder text. Treat that as not set.
for (const [k, v] of Object.entries(process.env)) if (String(v).startsWith('${user_config.')) delete process.env[k];

const need = (name: string) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not set. See docs/CLIENT_SETUP.md.`);
  return value;
};

const day = (value: string, field: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const probe = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !probe || probe.getUTCMonth() !== Number(m[2]) - 1) throw new Error(`${field} must be a real date like 2026-12-31`);
  return value;
};

// Counting only. A failure here is reported to the person, never hidden, but does not hide the review.
async function countActivation(): Promise<string> {
  const server = String(process.env.FINCLOSE_SERVER || 'https://www.antibalcony.com').replace(/\/+$/, '');
  try {
    const res = await fetch(`${server}/api/activations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partner_id: need('FINCLOSE_PARTNER_ID'), partner_code: need('FINCLOSE_PARTNER_CODE'), country: need('FINCLOSE_COMPANY_COUNTRY'), reg_code: need('FINCLOSE_COMPANY_REG') })
    });
    return res.ok ? 'Counted for your partner.' : `Not counted for your partner (server said ${res.status}). The review itself is unaffected.`;
  } catch {
    return 'Not counted for your partner (could not reach the FinClose server). The review itself is unaffected.';
  }
}

const plainFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => fetch(url, { method: init?.method, headers: init?.headers, body: init?.body, cache: 'no-store' });

const openInBrowser = (url: string) => {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
  } catch { /* the link is also returned to the person */ }
};

const server = new McpServer({ name: 'finclose-local', version: '0.1.0' });

server.registerTool(
  'finclose_connect',
  {
    title: 'Sign in to Xero or Zoho Books on this computer',
    description: 'Starts a sign-in to the client\'s own Xero or Zoho Books account. It opens the provider\'s sign-in page in the browser on this computer; the client approves read access there. Tokens are kept on this computer only. SmartAccounts needs no sign-in (it uses API keys). Read-only; nothing is written to the accounting system.',
    inputSchema: { provider: z.enum(['xero', 'zohobooks']) }
  },
  async ({ provider }) => {
    try {
      const { url } = await beginSignIn(provider, plainFetch);
      openInBrowser(url);
      return { content: [{ type: 'text' as const, text: `Sign-in to ${LOCAL_PROVIDERS[provider].name} started. A browser tab should have opened; if not, open this link: ${url}\nAfter approving, tell me and I will run the review.` }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: `FinClose could not start the sign-in: ${(error as Error).message}` }] };
    }
  }
);

server.registerTool(
  'finclose_review_books',
  {
    title: 'Review the books for a period',
    description: 'Reads the client\'s own accounting company (SmartAccounts, Xero or Zoho Books; read-only) for a period and returns proposals for the accountant: questions, checks and data gaps. It decides nothing and writes nothing. Present the result as proposals for a person to check, never as a finding that the books are correct.',
    inputSchema: { period_from: z.string().describe('First day, like 2026-10-01'), period_to: z.string().describe('Last day, like 2026-10-31'), provider: z.enum(['smartaccounts', 'xero', 'zohobooks']).optional().describe('Accounting system; default smartaccounts') }
  },
  async ({ period_from, period_to, provider }) => {
    try {
      const from = day(period_from, 'period_from'), to = day(period_to, 'period_to');
      const span = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000;
      if (span < 0 || span > 430) throw new Error('the period must run forward and be at most about 14 months');
      const which = provider || 'smartaccounts';
      let source: LedgerSource;
      if (which === 'smartaccounts') {
        source = new SmartAccountsClient({ creds: { apikey: need('FINCLOSE_SA_APIKEY'), secret: need('FINCLOSE_SA_SECRET') }, fetchFn: plainFetch });
      } else if (isLocalProvider(which)) {
        if (signInState(which) === 'waiting') throw new Error(`the ${LOCAL_PROVIDERS[which].name} sign-in is not finished yet. Finish it in the browser tab, then ask again`);
        if (signInState(which) === 'failed') throw new Error(`the ${LOCAL_PROVIDERS[which].name} sign-in failed: ${signInError(which)}. Run finclose_connect again`);
        const auth = () => localAccess(which, plainFetch);
        source = which === 'xero'
          ? new XeroLedgerSource({ fetchFn: plainFetch, auth, country: process.env.FINCLOSE_COMPANY_COUNTRY })
          : new ZohoLedgerSource({ fetchFn: plainFetch, auth, api_base: process.env.FINCLOSE_ZOHO_API_URL, country: process.env.FINCLOSE_COMPANY_COUNTRY });
      } else throw new Error('provider must be smartaccounts, xero or zohobooks');
      const review = reviewLedger(await source.snapshot({ from, to }));
      const counted = await countActivation();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ review, activation_note: counted }, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: `FinClose could not run the review: ${(error as Error).message}` }] };
    }
  }
);

await server.connect(new StdioServerTransport());
