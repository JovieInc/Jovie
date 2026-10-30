#!/usr/bin/env tsx
/**
 * Live agent-path certification for the Jovie agent MCP.
 *
 *   pnpm --filter @jovie/web agent-path:cert -- --base https://jov.ie [--query "Tim White"] [--release-url <url>] [--out receipt.json]
 *
 * Exit 1 on any FAIL, 75 when only RATE_LIMITED stopped the run, 2 on a fatal error.
 */
import { writeFile } from 'node:fs/promises';
import { runCert } from '@/lib/agent-distribution/cert-run';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main() {
  const { receipt, exitCode } = await runCert({
    base: arg('base', 'https://jov.ie'),
    query: arg('query', 'Tim White'),
    releaseUrl: arg(
      'release-url',
      'https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3'
    ),
  });
  const out = arg('out', '');
  if (out) await writeFile(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  return exitCode;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(JSON.stringify({ fatal: String(error) }));
    process.exit(2);
  }
);
