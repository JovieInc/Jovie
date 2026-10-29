#!/usr/bin/env node
/**
 * Fails when the legacy Cache Components surface exceeds its ratchet in the
 * checkout it runs from (the same assertion the structural lane runs in merge
 * groups). Run on a PR merged with base so combined growth fails at PR time.
 */
import { assertStackPatternRatchet } from '../capability-benchmark/capability-reconciliation.mjs';

try {
  const result = assertStackPatternRatchet(process.cwd());
  process.stdout.write(`stack-pattern-ratchet: ${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`stack-pattern-ratchet: ${error.message}\n`);
  process.exitCode = 1;
}
