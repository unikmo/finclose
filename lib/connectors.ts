import crypto from 'node:crypto';
import type { JournalView } from './chart-of-accounts';

// Accounting-package connectors. Two things live here:
//  1. an honest status for each provider (what works, what is off and why);
//  2. file exports that need no credentials, so a journal can reach a package today.
// The one coded live connector (Xero) is in xero-connector.ts. It is off unless an operator sets
// credentials AND FINCLOSE_CONNECTORS_ENABLED=true, and it has only been run against a mock of
// Xero, never the real service.

export type ProviderId = 'xero' | 'quickbooks' | 'freshbooks' | 'zohobooks' | 'datev' | 'smartaccounts' | 'file_export';

export type ProviderStatus = {
  id: ProviderId;
  name: string;
  state: 'WORKING_FILE_EXPORT' | 'CODED_NOT_ENABLED' | 'CODED_NEEDS_CREDENTIALS' | 'CODED_UNTESTED_LIVE' | 'READ_ADAPTER_UNTESTED_LIVE' | 'FILE_EXPORT_UNVERIFIED' | 'NOT_BUILT';
  can_push: boolean;
  detail: string;
};

export function connectorsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return String(env.FINCLOSE_CONNECTORS_ENABLED || '').trim().toLowerCase() === 'true';
}

export function xeroConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(String(env.XERO_CLIENT_ID || '').trim() && String(env.XERO_CLIENT_SECRET || '').trim() && String(env.XERO_REDIRECT_URI || '').trim() && String(env.FINCLOSE_TOKEN_KEY || '').trim().length >= 32);
}

// Read-only providers that sign in with the shared OAuth flow (oauth-connect.ts).
function oauthReader(id: ProviderId, name: string, prefix: string, env: NodeJS.ProcessEnv, source: string): ProviderStatus {
  const configured = Boolean(String(env[`${prefix}_CLIENT_ID`] || '').trim() && String(env[`${prefix}_CLIENT_SECRET`] || '').trim() && String(env[`${prefix}_REDIRECT_URI`] || '').trim() && String(env.FINCLOSE_TOKEN_KEY || '').length >= 32);
  const tail = `Read-only review coded ${source}; run only against a stand-in, never the real service. Never writes.`;
  if (!connectorsEnabled(env)) return { id, name, state: 'CODED_NOT_ENABLED', can_push: false, detail: `Switched off. Set FINCLOSE_CONNECTORS_ENABLED=true. ${tail}` };
  if (!configured) return { id, name, state: 'CODED_NEEDS_CREDENTIALS', can_push: false, detail: `Needs ${prefix}_CLIENT_ID, ${prefix}_CLIENT_SECRET, ${prefix}_REDIRECT_URI and a 32+ character FINCLOSE_TOKEN_KEY. ${tail}` };
  return { id, name, state: 'READ_ADAPTER_UNTESTED_LIVE', can_push: false, detail: tail };
}

export function providerStatuses(env: NodeJS.ProcessEnv = process.env): ProviderStatus[] {
  const enabled = connectorsEnabled(env);
  const xero: ProviderStatus = !enabled
    ? { id: 'xero', name: 'Xero', state: 'CODED_NOT_ENABLED', can_push: false, detail: 'Coded, switched off. Set FINCLOSE_CONNECTORS_ENABLED=true to turn connectors on.' }
    : !xeroConfigured(env)
      ? { id: 'xero', name: 'Xero', state: 'CODED_NEEDS_CREDENTIALS', can_push: false, detail: 'Needs XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI and a 32+ character FINCLOSE_TOKEN_KEY.' }
      : { id: 'xero', name: 'Xero', state: 'CODED_UNTESTED_LIVE', can_push: true, detail: 'Creates DRAFT manual journals only. Tested against a mock of Xero, never the real service.' };
  return [
    { id: 'file_export', name: 'Journal file (CSV)', state: 'WORKING_FILE_EXPORT', can_push: false, detail: 'Download the proposed journal and import it by hand.' },
    { ...xero },
    oauthReader('quickbooks', 'QuickBooks Online', 'QUICKBOOKS', env, 'from recalled documentation'),
    oauthReader('freshbooks', 'FreshBooks', 'FRESHBOOKS', env, 'from FreshBooks\' pages for bills, invoices and expenses; paging parameters assumed'),
    oauthReader('zohobooks', 'Zoho Books', 'ZOHO', env, 'from memory (Zoho\'s documentation would not load)'),
    { id: 'datev', name: 'DATEV', state: 'FILE_EXPORT_UNVERIFIED', can_push: false, detail: 'File export of the proposed journal only (Buchungsstapel layout as recalled, not imported by any DATEV yet). No live DATEV connection: that needs DATEV partner registration.' },
    { id: 'smartaccounts', name: 'SmartAccounts (Estonia)', state: 'READ_ADAPTER_UNTESTED_LIVE', can_push: false, detail: 'Read-only review coded from the provider\'s API specification (v1.7). Not yet run against a real SmartAccounts company. Never writes.' }
  ];
}

const cell = (v: string | number) => {
  const text = String(v).replace(/"/g, '""');
  return `"${/^[=+\-@\t\r]/.test(text) ? "'" + text : text}"`;
};

// Xero's manual-journal CSV import: one row per journal line, debits positive and credits negative,
// lines of one journal sharing a narration and date. Column names follow Xero's published template
// as recalled, and have NOT been checked against the current template or imported into Xero.
// AccountCode is the company's own account number, so the codes must exist in the Xero chart first.
export function xeroManualJournalCsv(journal: JournalView, narration: string): string {
  const header = ['*Narration', '*Date', 'Description', '*AccountCode', 'TaxRate', '*Amount'];
  const rows = [header.map(cell).join(',')];
  // One Xero journal per day keeps each balanced even if a day's lines are posted separately.
  const byDay = new Map<string, typeof journal.lines>();
  for (const l of journal.lines) byDay.set(l.date, [...(byDay.get(l.date) || []), l]);
  for (const [day, lines] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const l of lines) {
      const signed = (l.debit_cents - l.credit_cents) / 100;
      const [y, m, d] = day.split('-');
      // Text cells get the formula guard; the amount is a number the package must read as a number.
      rows.push([cell(`${narration} ${day}`), cell(`${d}/${m}/${y}`), cell(l.memo), cell(l.account_code), cell('Tax Exempt'), `"${signed.toFixed(2)}"`].join(','));
    }
  }
  return rows.join('\n') + '\n';
}

// ---- token vault -------------------------------------------------------------------------------
// Provider tokens are stored encrypted (AES-256-GCM) with a key only the server holds, so a leaked
// database copy does not leak access to anyone's books. The key is FINCLOSE_TOKEN_KEY; changing it
// makes stored tokens unreadable (the user reconnects).

function vaultKey(env: NodeJS.ProcessEnv): Buffer {
  const raw = String(env.FINCLOSE_TOKEN_KEY || '');
  if (raw.length < 32) throw new Error('FINCLOSE_TOKEN_KEY must be at least 32 characters');
  return crypto.createHash('sha256').update(raw).digest();
}

export function sealSecret(plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(env), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function openSecret(sealed: string, env: NodeJS.ProcessEnv = process.env): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('stored token is not in a known format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(env), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

export type Connection = {
  company_id: string;
  provider: ProviderId;
  tenant_id: string; // the provider's id for the organisation the user picked
  tenant_name: string;
  sealed_refresh_token: string;
  sealed_access_token: string;
  access_expires_at: number;
  connected_by: string;
  connected_at: number;
};

export interface ConnectionStore {
  get(companyId: string, provider: ProviderId): Promise<Connection | null>;
  put(connection: Connection): Promise<void>;
  delete(companyId: string, provider: ProviderId): Promise<void>;
  listPushed(companyId: string, provider: ProviderId): Promise<{ pack_hash: string; external_id: string; pushed_at: number }[]>;
  recordPush(companyId: string, provider: ProviderId, push: { pack_hash: string; external_id: string; pushed_at: number }): Promise<void>;
}

export class InMemoryConnectionStore implements ConnectionStore {
  private connections = new Map<string, Connection>();
  private pushes = new Map<string, { pack_hash: string; external_id: string; pushed_at: number }[]>();
  private key = (c: string, p: string) => `${c}|${p}`;
  async get(c: string, p: ProviderId) { const hit = this.connections.get(this.key(c, p)); return hit ? { ...hit } : null; }
  async put(connection: Connection) { this.connections.set(this.key(connection.company_id, connection.provider), { ...connection }); }
  async delete(c: string, p: ProviderId) { this.connections.delete(this.key(c, p)); this.pushes.delete(this.key(c, p)); }
  async listPushed(c: string, p: ProviderId) { return [...(this.pushes.get(this.key(c, p)) || [])]; }
  async recordPush(c: string, p: ProviderId, push: { pack_hash: string; external_id: string; pushed_at: number }) { this.pushes.set(this.key(c, p), [...(this.pushes.get(this.key(c, p)) || []), push]); }
}
