#!/usr/bin/env node

import {
  buildHarnessReceipt,
  validateHarnessContract,
} from './harness-contract.mjs';
import { validatePerformanceFactory } from './performance-factory.mjs';
import { validateQualityRatchet } from './quality-ratchet.mjs';
import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

// JOV-INV-024 composes the harness contract validator into this existing
// process: no new service, workflow, CI job, or process is added.
// JOV-INV-026 composes the performance factory the same way onto the
// existing weekday governance beat.
// JOV-INV-027 composes the continuous quality ratchet validator the same way.
const harnessJson = process.argv.includes('--harness-json');

const registry = readInvariantRegistry();
const result = validateInvariantRegistry(registry);
const harnessErrors = validateHarnessContract(registry);
const performanceErrors = validatePerformanceFactory(undefined, { registry });
const qualityErrors = validateQualityRatchet(registry);
const errors = [
  ...result.errors,
  ...harnessErrors.map(error => `harness-contract: ${error}`),
  ...performanceErrors.map(error => `performance-factory: ${error}`),
  ...qualityErrors.map(error => `quality-ratchet: ${error}`),
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
