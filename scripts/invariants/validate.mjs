#!/usr/bin/env node

import {
  buildHarnessReceipt,
  validateHarnessContract,
} from './harness-contract.mjs';
import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

// JOV-INV-024 composes the harness contract validator into this existing
// process: no new service, workflow, CI job, or process is added.
const harnessJson = process.argv.includes('--harness-json');

const registry = readInvariantRegistry();
const result = validateInvariantRegistry(registry);
const harnessErrors = validateHarnessContract(registry);
const errors = [
  ...result.errors,
  ...harnessErrors.map(error => `harness-contract: ${error}`),
];
const ok = errors.length === 0 && result.blockers.length === 0;

if (!ok) {
  for (const error of errors)
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
  const receipt = buildHarnessReceipt(registry);
  process.stdout.write(
    `Harness contract valid: ${receipt.principles} principles, ${receipt.partial} expiring exceptions.\n`
  );
  if (harnessJson) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }
}
