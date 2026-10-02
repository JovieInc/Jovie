#!/usr/bin/env node

import { validateAssuranceMatrixPolicy } from './assurance-matrix.mjs';
import { validateDeliveryModelPolicy } from './delivery-model.mjs';
import { evaluateDesignCiJudgeRouterContract } from './design-ci-judge-router-contract.mjs';
import {
  designSurfacesCertification,
  formatCertificationSummary,
  validateDesignSurfaces,
} from './design-surfaces.mjs';
import { validateDoneSprintInvariants } from './done-sprint-invariants.mjs';
import { auditFeedbackLinkage } from './feedback-linkage.mjs';
import { validateGateIntegrityPolicy } from './gate-integrity.mjs';
import {
  buildHarnessReceipt,
  validateHarnessContract,
} from './harness-contract.mjs';
import { validateIosWebNoScrollJank } from './ios-web-no-scroll-jank.mjs';
import { validateLatencySensitiveExecution } from './latency-sensitive-execution.mjs';
import { validateOverlayLayerContract } from './overlay-layer-contract.mjs';
import { validatePerformanceFactory } from './performance-factory.mjs';
import { validatePrLifecycleContract } from './pr-lifecycle-contract.mjs';
import { validateQualityRatchet } from './quality-ratchet.mjs';
import { validateSonarRepairContract } from './sonar-repair-contract.mjs';
import {
  readWritingSurfacesRegistry,
  validateWritingSurfaces,
} from './writing-surfaces.mjs';
// JOV-INV-029 is composed here so every CI invariant run checks the lifecycle.
// JOV-INV-031 is composed here so every CI invariant run checks thread-blocking.
// JOV-INV-032 is composed here so every CI invariant run checks iOS web scroll jank.
// JOV-INV-033 is composed here so every CI invariant run rescans Done-sprint sources.
// JOV-INV-034 is composed here so the required Structural Contract proves
// representative defects block certification and promotion.
// JOV-INV-035 is composed here so every invariant run checks the
// outcome-first delivery-model contract.
// JOV-INV-036 is composed here so Sonar repairs retain executable prevention.
// JOV-INV-037 is composed here so the canonical assurance matrix stays bound
// to its exact revision and reports uncovered objects and missing layers.
// JOV-INV-038 is composed here so every invariant run checks the founder
// design invariants against the deterministic marketing/app surface gates.
// JOV-INV-039 is composed here so every invariant run checks the overlay
// layer order and primitive bindings. Its raw z-index ratchet runs in the
// web lane (pnpm design:overlay-layers:check) because it walks all web source.
// JOV-INV-040 is composed here as a structural wiring check only: the
// Design CI judge router itself is TypeScript under apps/web/scripts and
// runs via `pnpm design-ci:judge-matrix`, not from this plain-node process.

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
// JOV-INV-033 composes Done-sprint source locks the same way. Production HTML
// rescan stays on the existing production-controller job (release mode).

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
const doneSprintErrors = await validateDoneSprintInvariants({
  registry,
  mode: 'source',
});
const gateIntegrityErrors = validateGateIntegrityPolicy(registry);
const assuranceErrors = validateAssuranceMatrixPolicy(registry);
const deliveryModelErrors = validateDeliveryModelPolicy(registry);
const sonarRepairErrors = validateSonarRepairContract(registry);
const designSurfaceErrors = validateDesignSurfaces(undefined, { registry });
const overlayLayerErrors = validateOverlayLayerContract(undefined, {
  registry,
});
const designCiJudgeRouterErrors = evaluateDesignCiJudgeRouterContract();
// JOV-6475 composes the writing-surface coverage registry the same way: it
// validates that every named delivery surface maps to a contract and owner.
const writingErrors = validateWritingSurfaces(readWritingSurfacesRegistry());
const errors = [
  ...result.errors,
  ...harnessErrors.map(error => `harness-contract: ${error}`),
  ...performanceErrors.map(error => `performance-factory: ${error}`),
  ...qualityErrors.map(error => `quality-ratchet: ${error}`),
  ...lifecycleErrors.map(error => `pr-lifecycle: ${error}`),
  ...latencyErrors.map(error => `latency-sensitive: ${error}`),
  ...iosScrollErrors.map(error => `ios-web-no-scroll-jank: ${error}`),
  ...doneSprintErrors.map(error => `done-sprint: ${error}`),
  ...gateIntegrityErrors.map(error => `gate-integrity: ${error}`),
  ...assuranceErrors.map(error => `assurance-matrix: ${error}`),
  ...deliveryModelErrors.map(error => `delivery-model: ${error}`),
  ...sonarRepairErrors.map(error => `sonar-repair: ${error}`),
  ...designSurfaceErrors.map(error => `design-surfaces: ${error}`),
  ...overlayLayerErrors.map(error => `overlay-layer-contract: ${error}`),
  ...designCiJudgeRouterErrors.map(error => `design-ci-judge-router: ${error}`),
  ...writingErrors.map(error => `writing-surfaces: ${error}`),
];

// H-06 ships in shadow under ENGINEERING.md; findings never join gate errors.
process.stdout.write(
  `feedback-linkage-qualification: ${JSON.stringify(auditFeedbackLinkage())}\n`
);

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
  // Visual founder rules without an evaluator receipt stay explicitly
  // not-certified in the receipt, even while their dated record is valid.
  process.stdout.write(
    `${formatCertificationSummary(designSurfacesCertification(registry))}\n`
  );
  if (harnessJson) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }
}
