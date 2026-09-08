#!/usr/bin/env node

import {
  buildHarnessReceipt,
  validateHarnessContract,
} from './harness-contract.mjs';
import { validateIosWebNoScrollJank } from './ios-web-no-scroll-jank.mjs';
import { validateLatencySensitiveExecution } from './latency-sensitive-execution.mjs';
import { validatePerformanceFactory } from './performance-factory.mjs';
import { validatePrLifecycleContract } from './pr-lifecycle-contract.mjs';
import { validateQualityRatchet } from './quality-ratchet.mjs';
// JOV-INV-029 is composed here so every CI invariant run checks the lifecycle.
// JOV-INV-031 is composed here so every CI invariant run checks thread-blocking.
// JOV-INV-032 is composed here so every CI invariant run checks iOS web scroll jank.

import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from './registry.mjs';

// JOV-INV-024 composes the harness contract validator into this existing
// process: no new service, workflow, CI job, or process is added.
// JOV-INV-026 composes the performance factory the same way onto the
// existing weekday governance beat.
// JOV-INV-027 composes the continuous quality ratchet validator the same way.
// JOV-INV-031 composes the latency-sensitive-execution thread-blocking gate
// the same way. It does not invent route-response-latency budgets.
// JOV-INV-032 composes the ios-web-no-scroll-jank public-web gate the same
// way. It does not invent scroll-FPS budgets or add an ESLint design lane.

const harnessJson = process.argv.includes('--harness-json');

const registry = readInvariantRegistry();
const result = validateInvariantRegistry(registry);
const harnessErrors = validateHarnessContract(registry);
const performanceErrors = validatePerformanceFactory(undefined, { registry });
const qualityErrors = validateQualityRatchet(registry);
const lifecycleErrors = validatePrLifecycleContract(registry);
const latencyErrors = validateLatencySensitiveExecution(undefined, {
  registry,
});
const iosScrollErrors = validateIosWebNoScrollJank(undefined, { registry });
const errors = [
  ...result.errors,
  ...harnessErrors.map(error => `harness-contract: ${error}`),
  ...performanceErrors.map(error => `performance-factory: ${error}`),
  ...qualityErrors.map(error => `quality-ratchet: ${error}`),
  ...lifecycleErrors.map(error => `pr-lifecycle: ${error}`),
  ...latencyErrors.map(error => `latency-sensitive: ${error}`),
  ...iosScrollErrors.map(error => `ios-web-no-scroll-jank: ${error}`),
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
