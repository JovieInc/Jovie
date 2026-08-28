#!/usr/bin/env node

import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

const registry = readInvariantRegistry();
const result = validateInvariantRegistry(registry);
if (!result.ok) {
  for (const error of result.errors)
    process.stderr.write(`invariant-error: ${error}\n`);
  for (const blocker of result.blockers)
    process.stderr.write(`invariant-blocker: ${blocker}\n`);
  process.exitCode = 1;
} else {
  const adopted = registry.invariants.filter(
    item => item.lifecycle?.state === 'adopted'
  ).length;
  process.stdout.write(
    `Invariant registry valid: ${adopted} adopted, ${result.blockers.length} blocked.\n`
  );
}
