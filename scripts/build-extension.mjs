// Builds dist/finclose.mcpb: one file a client double-clicks to install in Claude Desktop.
// Claude Desktop asks for the settings in extension/manifest.json (user_config) and keeps the
// sensitive ones in the operating system's secure storage.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = 'dist/extension';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/server`, { recursive: true });
cpSync('extension/manifest.json', `${out}/manifest.json`);

await build({
  entryPoints: ['local/finclose-local.ts'],
  outfile: `${out}/server/index.mjs`,
  bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }
});

execFileSync(process.execPath, ['node_modules/@anthropic-ai/mcpb/dist/cli/cli.js', 'pack', out, 'dist/finclose.mcpb'], { stdio: 'inherit' });
