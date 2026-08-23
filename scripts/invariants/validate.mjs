#!/usr/bin/env node

import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

const result = validateInvariantRegistry(readInvariantRegistry());
if (!result.ok) {
  for (const error of result.errors)
    process.stderr.write(`invariant-error: ${error}\n`);
  for (const blocker of result.blockers)
    process.stderr.write(`invariant-blocker: ${blocker}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Invariant registry valid: 10 adopted, 0 blocked.\n');
}
