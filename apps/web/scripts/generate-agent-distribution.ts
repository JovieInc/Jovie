#!/usr/bin/env tsx
/**
 * Regenerates apps/web/lib/agent-distribution/generated from the live agent MCP
 * registry. `--check` exits 1 on drift. Generates files only; submits nothing.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderDistribution,
  runGenerate,
} from '@/lib/agent-distribution/distribution-io';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function main() {
  const output = await renderDistribution(
    join(WEB, 'plugins/jovie-artists/assets')
  );
  return runGenerate({
    check: process.argv.includes('--check'),
    strict: process.argv.includes('--strict'),
    dir: join(WEB, 'lib/agent-distribution/generated'),
    output,
    log: line => process.stderr.write(`${line}\n`),
  });
}

main().then(
  code => process.exit(code),
  error => {
    console.error(String(error));
    process.exit(2);
  }
);
