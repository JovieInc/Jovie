import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, vi } from 'vitest';
import { checkSyntheticCanary } from '../../synthetic-canary-liveness.mjs';
export const NOW = Date.parse('2026-10-23T13:17:00Z');
export const iso = minutes => new Date(NOW - minutes * 60_000).toISOString();
export const repo = 'JovieInc/Jovie';
export const root = resolve(import.meta.dirname, '../../..');
export const job = (conclusion = 'success') => ({
  name: 'Production Synthetic Tests',
  status: 'completed',
  conclusion,
});
export const run = (overrides = {}) => ({
  id: 100,
  run_attempt: 1,
  event: 'schedule',
  head_branch: 'main',
  created_at: iso(30),
  updated_at: iso(1),
  status: 'completed',
  conclusion: 'success',
  display_title: 'Production Synthetic Monitoring (17 */6 * * *)',
  ...overrides,
});
/**
 * @param {Array<ReturnType<typeof run>>} runs
 * @param {Record<string, Array<ReturnType<typeof job>>>} [jobs]
 */
export function githubFor(runs, jobs = { 100: [job()] }) {
  return {
    rest: vi.fn(async (_method, path) => ({
      status: 200,
      json: /** @returns {unknown} */ () =>
        path.includes('/workflows/')
          ? { workflow_runs: runs }
          : {
              jobs: jobs[path.match(/runs\/(\d+)/)[1]],
              total_count: jobs[path.match(/runs\/(\d+)/)[1]]?.length,
            },
    })),
  };
}
export const check = github => checkSyntheticCanary({ github, repo, now: NOW });
export function installSplitSuiteHooks() {
  // This lane's job logs are admin-gated, so a CI-only failure here is invisible
  // to the remote diagnoser. Echo suite progress and failures into the run's
  // step summary, which is publicly readable on the workflow run page.
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  const trace = message => {
    if (!stepSummary) return;
    try {
      appendFileSync(stepSummary, `synthetic-canary-liveness: ${message}\n`);
    } catch {
      // Diagnostics must never fail the suite.
    }
  };
  trace('suite loaded');
  afterEach(context => {
    const { result } = context.task;
    if (result?.state === 'fail') {
      trace(
        `FAILED ${context.task.name}: ${String(
          result.errors?.map(error => error.message).join(' || ') ?? ''
        ).slice(0, 2000)}`
      );
    }
  });
  afterEach(() => vi.restoreAllMocks());
}
