// Weekly policy-change monitor — checks every official source already
// cited in the payroll engines' own `evidence` arrays (see
// lib/policy-monitor-sources.ts, auto-generated from those same arrays so
// it can never list a source the engines don't actually rely on) for
// content changes and forward-looking language ("effective 2027",
// "proposed", "will increase", etc.).
//
// WHAT THIS DOES: fetches each source, computes a stable hash of its
// content, compares it against the hash from the last run, and flags
// anything that changed since last week plus anything containing signal
// phrases suggesting a planned/future change. This is real, no-LLM-
// required change detection — cheap, deterministic, and it will not miss
// a page that changed even if the change doesn't match any keyword.
//
// WHAT THIS DOES NOT DO: it does not understand WHAT changed, or whether
// a detected change actually affects a rate this engine uses (a page
// changing its "last reviewed" date triggers the same CHANGED flag as a
// real bracket update). Every flagged source needs a human — or a
// follow-up Claude session reading the page directly — to confirm whether
// the corresponding payroll-engine-*.ts file needs updating. This is
// designed to narrow 79 sources down to "here are the 3 that changed this
// week," not to auto-apply anything.
//
// PDFs and other binary sources are hashed at the byte level (no text
// extraction — this repo has no PDF-parsing dependency and adding one
// just for this would be its own separate piece of work); a PDF flips
// CHANGED the moment a single byte differs, which is a strong, honest
// signal even without being able to say what changed.

import crypto from 'node:crypto';
import { realtimeDatabase } from './finclose-backend';
import { POLICY_MONITOR_SOURCES, type PolicyMonitorSource } from './policy-monitor-sources';

const SIGNAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'effective-date language', re: /\beffective\s+(?:from\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})/i },
  { label: 'proposed/consultation language', re: /\b(proposed|consultation|draft (?:rule|regulation|bill)|under review)\b/i },
  { label: 'rate-change language', re: /\b(rate (?:will|is set to|to) (?:increase|decrease|rise|fall|change)|new rate|revised rate|updated rate)\b/i },
  { label: 'budget/finance-act language', re: /\b(budget 20\d{2}|finance act 20\d{2}|finance bill 20\d{2})\b/i },
  { label: 'threshold/wage-base change language', re: /\b(threshold (?:will|is set to|to) (?:increase|decrease|rise)|new (?:threshold|ceiling|wage base|cap))\b/i }
];

function forwardYearPattern(asOfYear: number) {
  // Matches any 20xx year strictly after the current engine year — a
  // page mentioning "2028" today (when the engines are built for 2026/27)
  // is very likely describing a planned future change, not the current
  // rule.
  return new RegExp('\\b20(?:' + Array.from({ length: 6 }, (_, i) => String(asOfYear + 1 + i).slice(2)).join('|') + ')\\b');
}

export type SourceCheckResult = {
  source_id: string;
  country: string;
  authority: string;
  url: string;
  status: 'NEW' | 'UNCHANGED' | 'CHANGED' | 'FETCH_FAILED' | 'SKIPPED';
  content_hash?: string;
  previous_hash?: string;
  signals: string[];
  forward_years_mentioned: string[];
  http_status?: number;
  error?: string;
  checked_at: number;
};

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAndHash(url: string, timeoutMs: number): Promise<{ hash: string; text: string; httpStatus: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'FinCloseComplianceMonitor/1.0 (weekly source-change check; contact via finclose product team)' }
    });
    const contentType = res.headers.get('content-type') || '';
    const buffer = Buffer.from(await res.arrayBuffer());
    const isText = /text\/html|text\/plain|application\/xhtml/i.test(contentType);
    const text = isText ? stripHtml(buffer.toString('utf8')) : '';
    // Hash the extracted text for HTML (so markup-only changes like a
    // rebuilt nav bar don't false-positive every week); hash the raw
    // bytes for anything else (PDFs etc.) since there's no extraction.
    const hashInput = isText ? text : buffer;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
    return { hash, text, httpStatus: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export function scanSignals(text: string, asOfYear: number) {
  const signals: string[] = [];
  for (const { label, re } of SIGNAL_PATTERNS) {
    if (re.test(text)) signals.push(label);
  }
  const yearRe = forwardYearPattern(asOfYear);
  const forwardYears = new Set<string>();
  const globalYearRe = /\b20\d{2}\b/g;
  let match;
  while ((match = globalYearRe.exec(text))) {
    if (yearRe.test(match[0])) forwardYears.add(match[0]);
  }
  return { signals, forward_years_mentioned: Array.from(forwardYears).sort() };
}

async function stateFor(sourceId: string) {
  const snap = await realtimeDatabase().ref('finclose_policy_monitor_state/' + sourceId).once('value');
  return snap.exists() ? (snap.val() as { content_hash: string; last_checked_at: number }) : null;
}

async function checkOneSource(source: PolicyMonitorSource, timeoutMs: number, asOfYear: number): Promise<SourceCheckResult> {
  const now = Date.now();
  const base = { source_id: source.id, country: source.country, authority: source.authority, url: source.url, checked_at: now };
  try {
    const { hash, text, httpStatus } = await fetchAndHash(source.url, timeoutMs);
    const previous = await stateFor(source.id);
    const { signals, forward_years_mentioned } = scanSignals(text, asOfYear);
    const status: SourceCheckResult['status'] = !previous ? 'NEW' : previous.content_hash === hash ? 'UNCHANGED' : 'CHANGED';
    return { ...base, status, content_hash: hash, previous_hash: previous?.content_hash, signals, forward_years_mentioned, http_status: httpStatus };
  } catch (error) {
    return { ...base, status: 'FETCH_FAILED', signals: [], forward_years_mentioned: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export type PolicyMonitorSweepOptions = {
  // Which engine-year this sweep is checking against, for the
  // forward-year signal (e.g. 2026 -> flags mentions of 2027+).
  asOfYear?: number;
  // Total wall-clock budget for this invocation. Serverless functions
  // have hard duration limits; when the budget runs out, remaining
  // sources are marked SKIPPED and left for the next scheduled run
  // rather than causing a timeout/500. Not a correctness issue: skipped
  // sources just get checked next Monday instead of this one.
  budgetMs?: number;
  perSourceTimeoutMs?: number;
  // Restrict to a subset (e.g. one country) for manual/ad-hoc runs;
  // omit for the full weekly sweep.
  sourceIds?: string[];
};

export async function runPolicyMonitorSweep(options: PolicyMonitorSweepOptions = {}) {
  const asOfYear = options.asOfYear ?? new Date().getFullYear();
  const budgetMs = options.budgetMs ?? 45_000;
  const perSourceTimeoutMs = options.perSourceTimeoutMs ?? 8_000;
  const restrictedRun = Boolean(options.sourceIds);
  const allSources = POLICY_MONITOR_SOURCES;
  const sources = options.sourceIds
    ? allSources.filter(s => options.sourceIds!.includes(s.id))
    : allSources;

  const db = realtimeDatabase();

  // Rotating cursor so a duration-limited environment (e.g. a Hobby-plan
  // serverless function that can't finish all 79 sources in one
  // invocation) still covers every source within a few weekly runs
  // instead of always checking the same early sources and never reaching
  // the later ones. Only used for the full (non-restricted) sweep.
  let startIndex = 0;
  if (!restrictedRun) {
    const cursorSnap = await db.ref('finclose_policy_monitor_cursor').once('value');
    const stored = Number(cursorSnap.val() || 0);
    startIndex = Number.isFinite(stored) && stored >= 0 && stored < sources.length ? stored : 0;
  }
  const orderedSources = restrictedRun
    ? sources
    : [...sources.slice(startIndex), ...sources.slice(0, startIndex)];

  const started = Date.now();
  const results: SourceCheckResult[] = [];
  let processedCount = 0;

  for (const source of orderedSources) {
    if (Date.now() - started > budgetMs) {
      results.push({
        source_id: source.id, country: source.country, authority: source.authority, url: source.url,
        status: 'SKIPPED', signals: [], forward_years_mentioned: [], checked_at: Date.now()
      });
      continue;
    }
    results.push(await checkOneSource(source, perSourceTimeoutMs, asOfYear));
    processedCount += 1;
  }

  if (!restrictedRun) {
    const nextCursor = (startIndex + processedCount) % sources.length;
    await db.ref('finclose_policy_monitor_cursor').set(nextCursor);
  }

  const runId = db.ref('finclose_policy_monitor_runs').push().key!;
  const now = Date.now();
  const updates: Record<string, unknown> = {};

  for (const result of results) {
    if (result.content_hash) {
      updates['finclose_policy_monitor_state/' + result.source_id] = {
        content_hash: result.content_hash,
        last_checked_at: result.checked_at,
        last_status: result.status,
        last_run_id: runId
      };
    }
    updates['finclose_policy_monitor_runs/' + runId + '/results/' + result.source_id] = result;
  }

  const changed = results.filter(r => r.status === 'CHANGED');
  const withSignals = results.filter(r => r.signals.length > 0 || r.forward_years_mentioned.length > 0);
  const failed = results.filter(r => r.status === 'FETCH_FAILED');
  const skipped = results.filter(r => r.status === 'SKIPPED');

  const summary = {
    run_id: runId,
    started_at: started,
    finished_at: now,
    duration_ms: now - started,
    sources_checked: results.length - skipped.length,
    sources_total: sources.length,
    changed_count: changed.length,
    signal_count: withSignals.length,
    failed_count: failed.length,
    skipped_count: skipped.length,
    changed_source_ids: changed.map(r => r.source_id),
    signal_source_ids: withSignals.map(r => r.source_id)
  };
  updates['finclose_policy_monitor_runs/' + runId + '/summary'] = summary;

  const auditKey = db.ref('finclose_audit_events').push().key!;
  updates['finclose_audit_events/' + auditKey] = {
    event: 'POLICY_MONITOR_SWEEP_COMPLETED',
    ...summary,
    created_at: now
  };

  await db.ref().update(updates);
  return { summary, results };
}

export async function latestPolicyMonitorRun() {
  const snap = await realtimeDatabase()
    .ref('finclose_policy_monitor_runs')
    .orderByChild('summary/finished_at')
    .limitToLast(1)
    .once('value');
  const val = snap.val() as Record<string, unknown> | null;
  if (!val) return null;
  const [runId, run] = Object.entries(val)[0];
  const { run_id: _ignoredRunId, ...rest } = run as Record<string, unknown>;
  return { run_id: runId, ...rest };
}

export function sourceCount() {
  return POLICY_MONITOR_SOURCES.length;
}
