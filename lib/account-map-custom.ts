import { buildAccountMap, type Account, type AccountMap } from './chart-of-accounts';

// A company's own account numbers, layered over FinClose's default map. Only the code and name
// can change: the account type stays with the default, so an expense can't be turned into an
// asset by a typo. Overrides are validated before they are stored and again before they are used.

export type AccountOverride = { code: string; name: string };
export type AccountOverrides = Record<string, AccountOverride>; // key: a category code, or one of FIXED_KEYS

export const FIXED_KEYS = ['bank', 'vat_input', 'vat_output', 'suspense'] as const;
const MAX_OVERRIDES = 80;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,11}$/;

function bad(message: string) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = 400;
  return error;
}

function slots(map: AccountMap): Record<string, Account> {
  return { ...map.by_category, bank: map.bank, vat_input: map.vat_input, vat_output: map.vat_output, suspense: map.suspense };
}

export function validateOverrides(input: unknown, jurisdiction: string): AccountOverrides {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('overrides must be an object keyed by category');
  const base = slots(buildAccountMap(jurisdiction));
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_OVERRIDES) throw bad(`at most ${MAX_OVERRIDES} overrides`);
  const clean: AccountOverrides = {};
  for (const [key, raw] of entries) {
    if (!(key in base)) throw bad(`unknown category or slot: ${key.slice(0, 40)}`);
    const o = raw as Partial<AccountOverride> | null;
    const code = String(o?.code ?? '').trim();
    const name = String(o?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!CODE.test(code)) throw bad(`${key}: account code must be 1-12 letters, digits, dot, dash or underscore`);
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw bad(`${key}: account name must be 1-80 plain characters`);
    clean[key] = { code, name };
  }
  // One code must mean one account: the same code with two different names would post to the wrong place.
  const merged = effectiveSlots(base, clean);
  const names = new Map<string, string>();
  for (const [slot, account] of Object.entries(merged)) {
    const seen = names.get(account.code);
    if (seen !== undefined && seen !== account.name) throw bad(`code ${account.code} is used for two different accounts ("${seen}" and "${account.name}"; see ${slot})`);
    names.set(account.code, account.name);
  }
  // Only real changes are kept, so a screen can send the whole table and still store just the differences.
  return Object.fromEntries(Object.entries(clean).filter(([key, o]) => o.code !== base[key].code || o.name !== base[key].name));
}

function effectiveSlots(base: Record<string, Account>, overrides: AccountOverrides): Record<string, Account> {
  const out: Record<string, Account> = {};
  for (const [key, account] of Object.entries(base)) out[key] = overrides[key] ? { ...account, ...overrides[key] } : account;
  return out;
}

export function applyOverrides(jurisdiction: string, overrides: AccountOverrides | null | undefined): AccountMap {
  const base = buildAccountMap(jurisdiction);
  if (!overrides || !Object.keys(overrides).length) return base;
  const valid = validateOverrides(overrides, jurisdiction);
  const eff = effectiveSlots(slots(base), valid);
  const { bank, vat_input, vat_output, suspense, ...byCategory } = eff;
  return { ...base, id: `${base.id}+company`, status: 'COMPANY_CUSTOMISED_NOT_STATUTORY', bank, vat_input, vat_output, suspense, by_category: byCategory };
}

// Same layout for export and import so an accountant can edit it in a spreadsheet and send it back.
const HEADER = ['slot', 'account_code', 'account_name', 'account_type'];

export function accountMapCsv(map: AccountMap): string {
  const cell = (v: string) => {
    const text = String(v).replace(/"/g, '""');
    return `"${/^[=+\-@\t\r]/.test(text) ? "'" + text : text}"`;
  };
  const rows = [HEADER.map(cell).join(',')];
  const all = slots(map);
  for (const [slot, a] of Object.entries(all)) rows.push([slot, a.code, a.name, a.type].map(cell).join(','));
  return rows.join('\n') + '\n';
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// Reads the exported layout back. Rows that match the default are dropped so only real changes are stored.
export function parseAccountMapCsv(text: string, jurisdiction: string): AccountOverrides {
  if (typeof text !== 'string' || text.length > 100_000) throw bad('csv missing or too large');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw bad('csv is empty');
  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const [iSlot, iCode, iName] = [at('slot'), at('account_code'), at('account_name')];
  if (iSlot < 0 || iCode < 0 || iName < 0) throw bad('csv needs the columns slot, account_code, account_name');
  const base = slots(buildAccountMap(jurisdiction));
  const overrides: AccountOverrides = {};
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const slot = (cells[iSlot] || '').trim();
    // Undo the spreadsheet-safety apostrophe added on export.
    const code = (cells[iCode] || '').trim().replace(/^'/, '');
    const name = (cells[iName] || '').trim().replace(/^'/, '');
    if (!(slot in base)) throw bad(`unknown slot in csv: ${slot.slice(0, 40)}`);
    if (code === base[slot].code && name === base[slot].name) continue;
    overrides[slot] = { code, name };
  }
  return validateOverrides(overrides, jurisdiction);
}
