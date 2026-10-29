import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

// End-to-end test of the /packs screen in a real Chrome (or Edge) against a real running copy of the app in
// LAB mode. It drives the screen the way an owner would and checks the result on the page and in the saved data.
// Needs Google Chrome or Microsoft Edge installed; no browser is downloaded. Run with `npm run test:browser`.
// NOT covered: sign-in, real-data mode, uploads of receipts, a screen reader, a real phone.

const PORT = 3057;
const BASE = `http://localhost:${PORT}`;
const LAB_TOKEN = 'browser-test-lab-token';
const COMPANY = `browser-${Date.now()}`;
const STATEMENT = [
  'date,amount,counterparty,description',
  '2026-03-02,-124.00,Telia Eesti,Mobile plan',
  '2026-03-03,-20.00,Vercel Inc,Hosting',
  '2026-03-04,-2.50,LHV,Monthly fee',
  '2026-03-05,-42.00,Zxqv Trading,work',
  '2026-03-10,500.00,Client OU,Invoice 12'
].join('\n');

let server: ChildProcess;
let browser: Browser;
let context: BrowserContext;
let page: Page;
const problems: string[] = [];

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/packs`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('the app did not start in 120 seconds');
}

before(async () => {
  server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { shell: true, env: { ...process.env, FINCLOSE_LAB_TOKEN: LAB_TOKEN, FINCLOSE_RUNTIME_MODE: 'LAB' }, stdio: 'ignore' });
  await waitForServer();
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch({ channel: 'msedge' }); }
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-finclose-lab-token': LAB_TOKEN }, acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', e => problems.push(`page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console error: ${m.text()}`); });
  await page.goto(`${BASE}/packs`);
  await page.waitForLoadState('networkidle');
});

after(async () => {
  await browser?.close();
  if (server?.pid) { try { execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { server.kill(); } }
});

const body = () => page.locator('body');
const overflow = () => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll('body *')].filter(e => !e.closest('.pr-scroll') && e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== 'absolute').length;
});

test('the page loads with a skip link first in the tab order and a visible heading', async () => {
  assert.equal(await page.title(), 'Saved review packs | FinClose');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to the content');
  assert.ok(await page.getByRole('heading', { name: 'Saved review packs', level: 1 }).isVisible());
  await page.getByLabel('Company ID').fill(COMPANY);
  await page.getByRole('button', { name: 'Load saved packs' }).click();
  await page.getByText('No saved packs for this company yet').waitFor();
});

test('create a pack from a statement: the result, the issues list and the questions appear', async () => {
  await page.getByLabel('Company name').fill('Browser Test OU');
  await page.getByLabel('First day of the period').fill('2026-03-01');
  await page.getByLabel('Last day of the period').fill('2026-03-31');
  await page.locator('form input[type=file]').setInputFiles({ name: 'march.csv', mimeType: 'text/csv', buffer: Buffer.from(STATEMENT) });
  await page.getByText('Chosen: march.csv').waitFor();
  await page.getByRole('button', { name: 'Create and save pack' }).click();
  await page.getByRole('heading', { name: 'Version 1: Open' }).waitFor();
  assert.match(await body().innerText(), /Kept until \d+ \w+ \d{4}, then deleted automatically/);
  assert.equal(await page.locator('.pr-issues li').first().locator('.pr-pill').innerText(), 'Important');
  assert.ok(await page.getByText('Needs attention').isVisible());
  assert.equal(await page.locator('.pr-question').count(), 3);
  assert.equal(await page.locator('.pr-error').count(), 0);
  // The saved list now shows it, with a readable status.
  assert.match(await page.locator('table').first().innerText(), /2026-03-01 to 2026-03-31[\s\S]*Open/);
});

test('answer an owner question, then correct a category and keep it for next time', async () => {
  const before = await page.locator('.pr-question').count();
  await page.getByLabel('Your answer about Zxqv Trading').fill('Office chairs from a new supplier');
  const answered = page.waitForResponse(r => /\/api\/review-packs\/pk_/.test(r.url()) && r.request().method() === 'POST');
  await page.locator('.pr-question', { hasText: 'Zxqv Trading' }).getByRole('button', { name: 'Send answer' }).click();
  assert.equal((await answered).status(), 200);
  // A note is saved and shown back; it does not remove the question (only a receipt or "not a duplicate" changes the pack).
  await page.getByText("Saved: “Office chairs from a new supplier”").waitFor();
  assert.equal(await page.locator('.pr-question').count(), before);

  await page.getByLabel('Category for Zxqv Trading').selectOption({ label: 'Office supplies and equipment' });
  await page.getByLabel('Remember for this company').first().check();
  const corrected = page.waitForResponse(r => /\/api\/review-packs\/pk_/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Apply the change for Zxqv Trading' }).click();
  assert.equal((await corrected).status(), 200);
  // The row stays on screen and says it was saved, rather than vanishing from the "needs a look" list.
  assert.equal(await page.getByLabel('Category for Zxqv Trading').inputValue(), 'OFFICE_SUPPLIES');
  assert.match(await page.locator('tr', { hasText: 'Zxqv Trading' }).innerText(), /Saved/);
  assert.equal(await page.locator('.pr-error').count(), 0);

  // Reload the page: the correction is read back from storage, not kept in the browser.
  await page.reload();
  await page.getByLabel('Company ID').fill(COMPANY);
  await page.getByRole('button', { name: 'Load saved packs' }).click();
  await page.getByRole('button', { name: /Open the pack for 2026-03-01/ }).click();
  await page.getByRole('heading', { name: 'Version 1: Open' }).waitFor();
  await page.getByLabel(/Show only the \d+ that need a look/).uncheck().catch(() => undefined);
  assert.equal(await page.getByLabel('Category for Zxqv Trading').inputValue(), 'OFFICE_SUPPLIES');
  await page.getByText("Saved: “Office chairs from a new supplier”").waitFor(); // the answer was read back from storage too
});

test('the proposed journal adds up and downloads as a spreadsheet', async () => {
  assert.match(await page.getByRole('heading', { name: /Proposed journal/ }).innerText(), /adds up/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Download the journal/ }).click()]);
  assert.equal(download.suggestedFilename(), 'proposed-journal.csv');
  const text = (await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'));
  assert.match(text, /^"date","transaction_id","account_code"/);
  assert.match(text, /6130/); // Office supplies, from the correction above
});

test('account numbers: a clashing number is refused, a valid one is saved, reset restores the standard one', async () => {
  await page.getByRole('button', { name: 'Show account numbers' }).click();
  const code = page.getByLabel('Account number for Software and subscriptions');
  await code.waitFor();
  assert.equal(await code.inputValue(), '6100');
  await code.fill('6110');
  await page.getByRole('button', { name: 'Save account numbers' }).click();
  await page.locator('.pr-error').waitFor();
  assert.match(await page.locator('.pr-error').innerText(), /two different accounts/);
  await code.fill('6150');
  await page.getByLabel('Account name for Software and subscriptions').fill('Software licences');
  await page.getByRole('button', { name: 'Save account numbers' }).click();
  await page.getByText('Saved. New journals use these numbers.').waitFor();
  assert.equal(await page.locator('.pr-error').count(), 0);
  await page.getByRole('button', { name: 'Go back to standard numbers' }).click();
  await page.getByText('Back to the standard numbers.').waitFor();
  assert.equal(await code.inputValue(), '6100');
});

test('every control on the page has an accessible name and no id is used twice', async () => {
  const report = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll('input:not([type=hidden]):not([hidden]),select,button,textarea')].filter(el => {
      const e = el as HTMLInputElement;
      return !(e.getAttribute('aria-label') || e.labels?.length || (e.textContent || '').trim() || e.getAttribute('title'));
    }).map(e => e.outerHTML.slice(0, 90));
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    return { unnamed, dup: ids.filter((x, i) => ids.indexOf(x) !== i) };
  });
  assert.deepEqual(report, { unnamed: [], dup: [] });
});

test('the page does not scroll sideways on a phone-sized screen, with a pack open', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await overflow(), 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await overflow(), 0);
});

test('erase needs the company id typed exactly, then removes the packs', async () => {
  await page.getByRole('button', { name: 'Erase all company data' }).click();
  const confirm = page.getByRole('button', { name: 'Erase everything' });
  assert.equal(await confirm.isDisabled(), true);
  await page.getByLabel('Type the company ID to confirm').fill('not-the-id');
  assert.equal(await confirm.isDisabled(), true);
  await page.getByLabel('Type the company ID to confirm').fill(COMPANY);
  assert.equal(await confirm.isEnabled(), true);
  await confirm.click();
  await page.getByText('No saved packs for this company yet').waitFor();
  assert.equal(await page.locator('.pr-error').count(), 0);
  // The data is gone on the server too, not only on the screen.
  const res = await fetch(`${BASE}/api/review-packs?company_id=${COMPANY}`, { headers: { 'x-finclose-lab-token': LAB_TOKEN } });
  assert.deepEqual(((await res.json()) as { packs: unknown[] }).packs, []);
});

test('no script errors or console errors happened during the whole run', () => {
  assert.deepEqual(problems, []);
});
