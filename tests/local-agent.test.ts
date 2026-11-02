import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Starts local/finclose-local.ts as a separate process and talks to it the way an AI app would.
async function connect(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--experimental-strip-types', '--import', './tests/register-ts-resolve.mjs', 'local/finclose-local.ts'],
    env: { ...(process.env as Record<string, string>), FINCLOSE_SA_APIKEY: '', FINCLOSE_SA_SECRET: '', ...env },
    stderr: 'ignore'
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

test('the local program offers exactly one tool and it is a review, not a write', async () => {
  const client = await connect({});
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['finclose_connect', 'finclose_review_books']);
    for (const t of tools) assert.match(String(t.description), /read-only|read access/i);
    assert.match(String(tools[1].description), /decides nothing and writes nothing/i);
  } finally { await client.close(); }
});

test('without keys on this computer it says so plainly and calls nothing', async () => {
  const client = await connect({});
  try {
    const result = await client.callTool({ name: 'finclose_review_books', arguments: { period_from: '2026-10-01', period_to: '2026-10-31' } }) as { isError?: boolean; content: { text: string }[] };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /FINCLOSE_SA_APIKEY is not set/);
  } finally { await client.close(); }
});

test('a bad period is refused before any request is made', async () => {
  const client = await connect({ FINCLOSE_SA_APIKEY: 'k', FINCLOSE_SA_SECRET: 's' });
  try {
    const result = await client.callTool({ name: 'finclose_review_books', arguments: { period_from: '2026-13-01', period_to: '2026-10-31' } }) as { isError?: boolean; content: { text: string }[] };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /period_from must be a real date/);
  } finally { await client.close(); }
});
