#!/usr/bin/env node
/**
 * CI helper for apps/web/tests/quarantine.json ledger.
 *
 * Usage:
 *   node .github/scripts/quarantine-ledger.mjs validate
 *   node .github/scripts/quarantine-ledger.mjs emit-github-output
 */

import { execSync } from 'node:child_process';

const command = process.argv[2] ?? 'validate';
const root = process.cwd();

const run = script => {
  execSync(`pnpm --filter @jovie/web exec tsx ${script}`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
};

if (command === 'validate') {
  run('scripts/check-quarantine-ledger.ts');
} else if (command === 'emit-github-output') {
  run('scripts/emit-quarantine-github-output.ts');
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
