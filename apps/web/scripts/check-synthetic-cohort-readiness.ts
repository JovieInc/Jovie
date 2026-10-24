#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { checkSyntheticCohortConfiguration } from '@/lib/readiness/synthetic-cohort';

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0]?.startsWith('--binding-file=')) {
    throw new Error('binding-file-required');
  }
  const binding = JSON.parse(
    readFileSync(args[0].slice('--binding-file='.length), 'utf8')
  );
  const result = checkSyntheticCohortConfiguration({
    binding,
    env: process.env,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.configurationReady ? 0 : 2;
}

try {
  main();
} catch {
  // Never print parser/IO messages: their contents can include private values.
  process.stdout.write(
    `${JSON.stringify({
      ...checkSyntheticCohortConfiguration({ binding: null, env: process.env }),
      issues: ['binding_input_unavailable'],
    })}\n`
  );
  process.exitCode = 2;
}
