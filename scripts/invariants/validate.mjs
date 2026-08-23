#!/usr/bin/env node
import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

const registry = readInvariantRegistry();
const result = validateInvariantRegistry(registry);
if (!result.ok) {
  for (const kind of ['errors', 'blockers']) {
    for (const item of result[kind])
      process.stderr.write(`invariant-${kind.slice(0, -1)}: ${item}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`ok ${registry.invariants.length} adopted invariants\n`);
}
