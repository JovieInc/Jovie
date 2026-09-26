/**
 * Vitest phase-timing reporter.
 *
 * Writes absolute per-phase duration sums (ms) for a run to a JSON file so the
 * test performance profiler does not have to scrape Vitest's human summary.
 * Vitest 5 prints the Duration breakdown as percentages of the summed phases
 * ("Duration 1.86s (environment 34%, transform 21%, setup 17%, ...)"), which
 * cannot be converted back to absolute times.
 *
 * Phase semantics match Vitest 4's absolute summary (sums across files):
 * - setup: TestModule setupDuration (setupFiles, including transform waits)
 * - tests: TestModule duration
 * - environment: environmentSetupDuration
 * - collect: collectDuration
 * - prepare: prepareDuration
 * - transform: worker time waiting on module transforms during setup/collect
 *   (Vitest 5's "transform" phase)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { Reporter, TestModule } from 'vitest/node';

export const PHASE_TIMINGS_OUTPUT_FILE = '.cache/vitest-phase-timings.json';

export interface PhaseTimingModuleInput {
  environmentSetupDuration: number;
  prepareDuration: number;
  collectDuration: number;
  setupDuration: number;
  duration: number;
  setupFetchDuration?: number;
  collectFetchDuration?: number;
}

export interface PhaseTimings {
  source: 'vitest-phase-timing-reporter';
  moduleCount: number;
  setup: number;
  tests: number;
  environment: number;
  transform: number;
  collect: number;
  prepare: number;
}

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function summarizePhaseTimings(
  modules: readonly PhaseTimingModuleInput[]
): PhaseTimings {
  const timings: PhaseTimings = {
    source: 'vitest-phase-timing-reporter',
    moduleCount: modules.length,
    setup: 0,
    tests: 0,
    environment: 0,
    transform: 0,
    collect: 0,
    prepare: 0,
  };
  for (const entry of modules) {
    timings.setup += finite(entry.setupDuration);
    timings.tests += finite(entry.duration);
    timings.environment += finite(entry.environmentSetupDuration);
    timings.collect += finite(entry.collectDuration);
    timings.prepare += finite(entry.prepareDuration);
    timings.transform +=
      finite(entry.setupFetchDuration) + finite(entry.collectFetchDuration);
  }
  return timings;
}

function toPhaseInput(testModule: TestModule): PhaseTimingModuleInput {
  const diagnostic = testModule.diagnostic();
  // Transform wait times are only tracked on the runner task. Read them
  // defensively so a Vitest internals change degrades to a zero transform
  // time, which the profiler rejects (fail closed) instead of guessing.
  const task = (
    testModule as unknown as {
      task?: { setupFetchDuration?: number; collectFetchDuration?: number };
    }
  ).task;
  return {
    environmentSetupDuration: diagnostic.environmentSetupDuration,
    prepareDuration: diagnostic.prepareDuration,
    collectDuration: diagnostic.collectDuration,
    setupDuration: diagnostic.setupDuration,
    duration: diagnostic.duration,
    setupFetchDuration: task?.setupFetchDuration,
    collectFetchDuration: task?.collectFetchDuration,
  };
}

export default class PhaseTimingReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const outputFile = resolve(process.cwd(), PHASE_TIMINGS_OUTPUT_FILE);
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(
      outputFile,
      JSON.stringify(summarizePhaseTimings(testModules.map(toPhaseInput)))
    );
  }
}
