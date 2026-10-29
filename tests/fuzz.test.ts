import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAmountToCents, parseBankStatementCsv, parseCsv, parseStatementDate } from '../lib/statement-intake.ts';
import { decodeStatementBytes } from '../lib/statement-decode.ts';
import { prepareStatementReview } from '../lib/statement-prep.ts';
import { renderEntriesCsv } from '../lib/review-pack.ts';
import { buildAccountMap, buildJournal, journalCsv } from '../lib/chart-of-accounts.ts';
import { applyOverrides, parseAccountMapCsv, validateOverrides } from '../lib/account-map-custom.ts';
import { buildRulePack } from '../lib/categorisation-engine.ts';

// Seeded property and fuzz tests. Every run uses the same seeds, so a failure is reproducible:
// the failing case prints its seed and iteration. Raise ITERATIONS (FUZZ_ITERATIONS=20000) for a deeper run.
// These look for crashes and broken invariants; they do not prove the parsers read real bank files correctly.

const ITERATIONS = Math.max(50, Number(process.env.FUZZ_ITERATIONS) || 1500);

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p
  };
}
type Rng = ReturnType<typeof rng>;
const at = (seed: number, i: number) => `seed ${seed}, iteration ${i}`;

const NASTY = ['=', '+', '-', '@', '\t', '\r', '\n', '"', "'", ',', ';', '\u0000', '‮', 'é', 'õ', 'ü', '€', '日本', '\\', '|', '<b>', ' ', '  ', '0', '1,2,3', '..', ',,'];
const randomText = (r: Rng, max = 30) => Array.from({ length: r.int(0, max) }, () => (r.chance(0.5) ? r.pick(NASTY) : String.fromCharCode(r.int(32, 126)))).join('');

function formatAmount(r: Rng, cents: number): { text: string; value: number } {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const group = (sep: string) => String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const neg = cents < 0;
  const body = r.pick([
    () => `${whole}.${frac}`,
    () => `${whole},${frac}`,
    () => `${group(',')}.${frac}`,
    () => `${group('.')},${frac}`,
    () => `${group(' ')},${frac}`,
    () => `${group(' ')}.${frac}`,
    () => `${group("'")}.${frac}`
  ])();
  const symbol = r.pick(['', '', '€', '$', '£']);
  if (!neg) return { text: r.chance(0.2) ? `+${symbol}${body}` : `${symbol}${body}`, value: cents };
  return { text: r.pick([() => `-${symbol}${body}`, () => `${symbol}-${body}`, () => `(${symbol}${body})`, () => `${symbol}${body}-`])(), value: cents };
}

test('amounts: every formatting style round-trips to the same signed cents', () => {
  const seed = 101;
  const r = rng(seed);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const cents = (r.chance(0.5) ? -1 : 1) * r.int(1, r.chance(0.2) ? 999_999_999 : 99_999);
    const { text } = formatAmount(r, cents);
    assert.equal(parseAmountToCents(text), cents, `"${text}" should be ${cents} (${at(seed, i)})`);
  }
});

test('amounts: arbitrary text never throws and gives null or a safe integer', () => {
  const r = rng(102);
  for (let i = 0; i < ITERATIONS * 2; i += 1) {
    const text = randomText(r, 40);
    const out = parseAmountToCents(text);
    assert.ok(out === null || Number.isSafeInteger(out), `${JSON.stringify(text)} gave ${out}`);
  }
  for (const huge of ['9'.repeat(400), `${'9'.repeat(30)}.99`, '1e5', 'Infinity', 'NaN', '-', '()', '.', ',', '--5', '0.0.0']) {
    const out = parseAmountToCents(huge);
    assert.ok(out === null || Number.isSafeInteger(out), huge);
  }
});

test('dates: valid dates round-trip in ISO and day-first forms; impossible dates are refused', () => {
  const seed = 103;
  const r = rng(seed);
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < ITERATIONS; i += 1) {
    const y = r.int(1990, 2090);
    const m = r.int(1, 12);
    const d = r.int(1, new Date(Date.UTC(y, m, 0)).getUTCDate());
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const time = r.pick(['', ' 10:11:12', 'T09:00:00Z']);
    assert.equal(parseStatementDate(`${iso}${time}`, 'DMY').iso, iso, at(seed, i));
    const sep = r.pick(['.', '/', '-']);
    assert.equal(parseStatementDate(`${pad(d)}${sep}${pad(m)}${sep}${y}${time}`, 'DMY').iso, iso, at(seed, i));
    assert.equal(parseStatementDate(`${pad(m)}${sep}${pad(d)}${sep}${y}`, 'MDY').iso, iso, at(seed, i));
    // impossible: day past month end, month 13, day 0
    const bad = r.pick([`${y}-${pad(m)}-${new Date(Date.UTC(y, m, 0)).getUTCDate() + 1}`, `${y}-13-${pad(d)}`, `${y}-${pad(m)}-00`, `31.02.${y}`]);
    assert.equal(parseStatementDate(bad, 'DMY').iso, null, `${bad} (${at(seed, i)})`);
  }
  const r2 = rng(104);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const out = parseStatementDate(randomText(r2, 25), r2.pick(['DMY', 'MDY', 'auto'] as const));
    assert.ok(out.iso === null || /^\d{4}-\d{2}-\d{2}$/.test(out.iso));
  }
});

function validTransactions(result: ReturnType<typeof parseBankStatementCsv>, label: string) {
  const ids = new Set<string>();
  for (const tx of result.transactions) {
    assert.match(tx.date, /^\d{4}-\d{2}-\d{2}$/, label);
    const [y, m, d] = tx.date.split('-').map(Number);
    assert.equal(new Date(Date.UTC(y, m - 1, d)).getUTCDate(), d, `${tx.date} is not a real date (${label})`);
    assert.ok(Number.isSafeInteger(tx.amount_cents) && tx.amount_cents !== 0, `${tx.amount_cents} (${label})`);
    assert.ok(Number.isInteger(tx.source_row) && tx.source_row >= 1, label);
    assert.equal(typeof tx.currency, 'string', label);
    assert.ok(!ids.has(tx.transaction_id), `duplicate id (${label})`);
    ids.add(tx.transaction_id);
  }
}

function randomStatement(r: Rng): { csv: string; total: number; count: number } {
  const delimiter = r.pick([',', ';', '\t']);
  const header = r.pick([
    ['date', 'amount', 'counterparty', 'description'],
    ['Booking date', 'Amount', 'Name', 'Details', 'Currency'],
    ['Kuupäev', 'Summa', 'Saaja/Maksja', 'Selgitus']
  ]);
  const lines = [header.join(delimiter)];
  let total = 0;
  const rows = r.int(1, 25);
  for (let i = 0; i < rows; i += 1) {
    const cents = (r.chance(0.6) ? -1 : 1) * r.int(1, 500_000);
    total += cents;
    const date = `2026-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}`;
    const text = (s: string) => `"${s.replace(/"/g, '""')}"`;
    // Banks quote an amount that contains the delimiter ("1,234.56"); an unquoted one would simply be a different file.
    const amount = formatAmount(r, cents).text;
    const cells = [date, amount.includes(delimiter) ? text(amount) : amount, text(randomText(r, 12)), text(randomText(r, 20))];
    if (header.length === 5) cells.push('EUR');
    // A quoted cell may not hold the delimiter-free CSV newline in a way that shifts rows: allowed, parser must cope.
    lines.push(cells.join(delimiter));
  }
  return { csv: lines.join(r.pick(['\n', '\r\n'])), total, count: rows };
}

test('intake: generated statements keep every row, sum exactly, and parse the same way twice', () => {
  const seed = 105;
  const r = rng(seed);
  for (let i = 0; i < ITERATIONS / 5; i += 1) {
    const { csv, total, count } = randomStatement(r);
    const first = parseBankStatementCsv(csv);
    const label = at(seed, i);
    // Random text cells can hold quotes and newlines; the property is that nothing is lost or invented.
    assert.equal(first.transactions.length + first.rejected.length, count, `rows accounted for (${label}): ${JSON.stringify(csv.slice(0, 200))}`);
    if (first.rejected.length === 0) assert.equal(first.transactions.reduce((s, t) => s + t.amount_cents, 0), total, label);
    validTransactions(first, label);
    const second = parseBankStatementCsv(csv);
    assert.deepEqual(second.transactions.map(t => t.transaction_id), first.transactions.map(t => t.transaction_id), label);
    const known = parseBankStatementCsv(csv, { known_transaction_ids: new Set(first.transactions.map(t => t.transaction_id)) });
    assert.equal(known.transactions.length, 0, label);
    assert.equal(known.skipped_already_imported, first.transactions.length, label);
  }
});

const FIXTURES = fs.readdirSync(new URL('./fixtures/banks/', import.meta.url)).filter(f => f.endsWith('.csv')).map(f => fs.readFileSync(new URL(`./fixtures/banks/${f}`, import.meta.url), 'utf8'));

function mutate(r: Rng, text: string): string {
  let out = text;
  for (let k = r.int(1, 6); k > 0; k -= 1) {
    const p = r.int(0, out.length);
    switch (r.int(0, 5)) {
      case 0: out = out.slice(0, p) + out.slice(p + r.int(1, 40)); break;
      case 1: out = out.slice(0, p) + r.pick(NASTY) + out.slice(p); break;
      case 2: out = out.slice(0, p) + randomText(r, 60) + out.slice(p); break;
      case 3: { const lines = out.split('\n'); const a = r.int(0, lines.length - 1); const b = r.int(0, lines.length - 1); [lines[a], lines[b]] = [lines[b], lines[a]]; out = lines.join('\n'); break; }
      case 4: out = out + out.slice(0, r.int(0, out.length)); break;
      default: out = out.replace(/,/g, r.pick([';', '\t', ',,']));
    }
  }
  return out;
}

test('intake: mutated bank files never crash and never produce an invalid transaction', () => {
  const seed = 106;
  const r = rng(seed);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const text = mutate(r, r.pick(FIXTURES));
    const label = at(seed, i);
    let result: ReturnType<typeof parseBankStatementCsv>;
    assert.doesNotThrow(() => { result = parseBankStatementCsv(text, { date_order: r.pick(['DMY', 'MDY', 'auto'] as const) }); }, label);
    validTransactions(result!, label);
  }
});

test('intake: pure noise, empty input and a very long line are handled', () => {
  const r = rng(107);
  for (let i = 0; i < ITERATIONS / 5; i += 1) {
    const result = parseBankStatementCsv(Array.from({ length: r.int(0, 30) }, () => randomText(r, 60)).join(r.pick(['\n', '\r\n', ',', ''])));
    validTransactions(result, `noise ${i}`);
  }
  for (const input of ['', '\n', ',,,\n,,,', '"', '"\n"', 'date,amount\n"unterminated,5', `date,amount\n2026-01-01,${'9'.repeat(100_000)}`, `date,amount\n${'x'.repeat(200_000)},1`]) {
    validTransactions(parseBankStatementCsv(input), input.slice(0, 20));
  }
  assert.ok(parseCsv('a,b\n"x\ny",z', ',').rows.length === 2);
});

test('file decoding: random bytes always give a string and never throw', () => {
  const r = rng(108);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const bytes = Uint8Array.from({ length: r.int(0, 200) }, () => r.int(0, 255));
    const out = decodeStatementBytes(bytes);
    assert.equal(typeof out.text, 'string');
    assert.ok(out.encoding.length > 0);
  }
});

function randomRequest(r: Rng) {
  const { csv } = randomStatement(r);
  return { company_name: randomText(r, 20) || 'Co', jurisdiction: r.pick(['EE', 'GENERIC']), vat_registered: r.chance(0.5), period_start: '2026-01-01', period_end: '2026-12-31', csv_text: csv };
}

test('review pack: invariants hold for random statements; the hash is stable and sensitive', () => {
  const seed = 109;
  const r = rng(seed);
  for (let i = 0; i < ITERATIONS / 10; i += 1) {
    const request = randomRequest(r);
    const label = at(seed, i);
    let result: ReturnType<typeof prepareStatementReview>;
    try { result = prepareStatementReview(request, 1_700_000_000_000); } catch (error) {
      assert.ok([400, 413].includes((error as { status?: number }).status ?? 0), `unexpected failure ${(error as Error).message} (${label})`);
      continue;
    }
    const pack = result.pack;
    assert.equal(pack.entries.length, pack.summary.transaction_count, label);
    assert.ok(pack.summary.readiness_percent >= 0 && pack.summary.readiness_percent <= 100, label);
    assert.ok(pack.summary.inflow_cents >= 0 && pack.summary.outflow_cents >= 0, label);
    assert.equal(pack.posting, 'NO_EXTERNAL_POSTING', label);
    assert.equal(pack.status, 'PREPARED_NOT_APPROVED', label);
    if (pack.exceptions.some(e => e.severity === 'HIGH')) assert.equal(pack.summary.accountant_ready, false, label);
    assert.equal(prepareStatementReview(request, 1_700_000_000_000).pack.pack_hash, pack.pack_hash, `hash must be deterministic (${label})`);
    if (pack.entries.length) {
      const tampered = { ...request, csv_text: request.csv_text.replace(/(\d)(?!.*\d)/, d => String((Number(d) + 1) % 10)) };
      if (tampered.csv_text !== request.csv_text) {
        try { assert.notEqual(prepareStatementReview(tampered, 1_700_000_000_000).pack.pack_hash, pack.pack_hash, `hash must change when the data changes (${label})`); } catch (error) {
          if ((error as { code?: string }).code === 'ERR_ASSERTION') throw error;
        }
      }
    }
    // The proposed journal always balances, whatever the statement contains.
    const journal = buildJournal(pack);
    assert.equal(journal.balanced, true, `journal unbalanced (${label})`);
    // Output files never let bank text run as a spreadsheet formula.
    for (const csv of [renderEntriesCsv(pack), journalCsv(journal)]) {
      for (const row of parseCsv(csv, ',').rows.slice(1)) {
        for (const cell of row.filter((_, ci) => ci > 2 && ci < 5)) assert.ok(!/^[=+@\t\r]/.test(cell), `unguarded cell ${JSON.stringify(cell)} (${label})`);
      }
    }
    assert.equal(typeof result.markdown, 'string');
  }
});

test('formula guard: hostile counterparties are prefixed in every exported file', () => {
  for (const evil of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
    const csv = `date,amount,counterparty,description\n2026-03-03,-20.00,"${evil.replace(/"/g, '""')}","${evil.replace(/"/g, '""')}"`;
    const pack = prepareStatementReview({ company_name: 'Co', jurisdiction: 'EE', period_start: '2026-03-01', period_end: '2026-03-31', csv_text: csv }, 1).pack;
    const rows = parseCsv(renderEntriesCsv(pack), ',').rows.slice(1);
    for (const row of rows) for (const cell of [row[3], row[4]]) assert.ok(cell === '' || !/^[=+\-@\t\r]/.test(cell), JSON.stringify(cell));
    const journalRows = parseCsv(journalCsv(buildJournal(pack)), ',').rows.slice(1);
    for (const row of journalRows) assert.ok(!/^[=+\-@\t\r]/.test(row[6]), JSON.stringify(row[6]));
  }
});

test('account numbers: random input is either refused with a 400 or produces a map that still balances a journal', () => {
  const seed = 110;
  const r = rng(seed);
  const slots = [...Object.keys(buildAccountMap('EE').by_category), 'bank', 'vat_input', 'vat_output', 'suspense', 'NOPE'];
  const pack = prepareStatementReview({ company_name: 'Co', jurisdiction: 'EE', vat_registered: true, period_start: '2026-03-01', period_end: '2026-03-31', csv_text: 'date,amount,counterparty,description\n2026-03-03,-20.00,Vercel Inc,Hosting\n2026-03-10,500.00,Client OU,Invoice 12' }, 1).pack;
  let accepted = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const input: Record<string, unknown> = {};
    for (let k = r.int(0, 6); k > 0; k -= 1) input[r.pick(slots)] = r.chance(0.1) ? r.pick([null, 5, 'x', []]) : { code: r.chance(0.5) ? String(r.int(1000, 9999)) : randomText(r, 14), name: randomText(r, 30) || 'Account' };
    const label = at(seed, i);
    try {
      const clean = validateOverrides(input, 'EE');
      accepted += 1;
      const map = applyOverrides('EE', clean);
      assert.equal(buildJournal(pack, map).balanced, true, label);
      for (const o of Object.values(clean)) assert.match(o.code, /^[A-Za-z0-9][A-Za-z0-9._-]{0,11}$/);
    } catch (error) {
      assert.equal((error as { status?: number }).status, 400, `${(error as Error).message} (${label})`);
    }
  }
  assert.ok(accepted > 20, 'the generator should produce some valid inputs too');
  for (const csv of ['', 'x', 'slot,account_code,account_name\n"unterminated', 'slot,account_code,account_name\nbank,1,' + 'x'.repeat(200)]) {
    try { parseAccountMapCsv(csv, 'EE'); } catch (error) { assert.equal((error as { status?: number }).status, 400); }
  }
  assert.ok(buildRulePack('EE').categories.length > 0);
});
