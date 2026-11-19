import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STRUCTURAL_PYTEST_SHARD_COMMANDS } from '../../ci-fast-lanes.mjs';
import {
  BLOG_VITEST_MAX_WORKERS,
  CI_RUNNER_WORKER_POLICY,
  CI_WORKER_FLIP_REVERT_THRESHOLD,
  CI_WORKER_LIVE_REVERT_ISSUE,
  CI_WORKER_REVERT_TO,
  STORYBOOK_PLAYWRIGHT_WORKERS,
  STRUCTURAL_PYTEST_OVERLAPPING_SHARDS,
  STRUCTURAL_PYTEST_XDIST_N,
  shouldRevertCiWorkerCounts,
} from '../ci-runner-worker-policy.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CI_YML = readFileSync(
  join(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

function jobBlock(jobId) {
  const start = CI_YML.search(new RegExp(`^  ${jobId}:`, 'm'));
  expect(start, jobId).toBeGreaterThan(-1);
  const rest = CI_YML.slice(start + 1);
  const endMatch = rest.search(/^  [A-Za-z0-9_-]+:/m);
  return CI_YML.slice(
    start,
    endMatch === -1 ? undefined : start + 1 + endMatch
  );
}

function evaluateXdistN(nproc) {
  return Number(
    execFileSync(
      'bash',
      [
        '-lc',
        `nproc() { echo ${Number(nproc)}; }; echo ${STRUCTURAL_PYTEST_XDIST_N}`,
      ],
      { encoding: 'utf8' }
    ).trim()
  );
}

describe('JOV-13107 runner worker policy', () => {
  it('reverts only when a finite flip rate strictly exceeds 2%', () => {
    expect(CI_WORKER_FLIP_REVERT_THRESHOLD).toBe(0.02);
    expect(CI_WORKER_REVERT_TO).toBe(2);
    expect(CI_RUNNER_WORKER_POLICY.liveRevert).toEqual({
      status: 'LATER',
      issue: CI_WORKER_LIVE_REVERT_ISSUE,
      blockedOn: 'JOV-13105',
    });
    expect(CI_WORKER_LIVE_REVERT_ISSUE).toBe('JOV-13120');
    expect(shouldRevertCiWorkerCounts(0)).toBe(false);
    expect(shouldRevertCiWorkerCounts(0.02)).toBe(false);
    expect(shouldRevertCiWorkerCounts(0.021)).toBe(true);
    expect(shouldRevertCiWorkerCounts(1)).toBe(true);
    expect(shouldRevertCiWorkerCounts(Number.NaN)).toBe(false);
    expect(shouldRevertCiWorkerCounts(Infinity)).toBe(false);
    expect(shouldRevertCiWorkerCounts(-0.1)).toBe(false);
    expect(shouldRevertCiWorkerCounts(undefined)).toBe(false);
    expect(shouldRevertCiWorkerCounts(null)).toBe(false);
  });

  it('documents nproc derivation or a written exception for every job', () => {
    for (const [jobId, job] of Object.entries(CI_RUNNER_WORKER_POLICY.jobs)) {
      expect(job.reason, jobId).toMatch(/\S/);
      if (job.derivation === 'documented-exception') {
        expect(job.value, jobId).toBe(STORYBOOK_PLAYWRIGHT_WORKERS);
      } else {
        expect(job.derivation, jobId).toMatch(/^nproc/);
        expect(job.commandExpr, jobId).toMatch(/nproc/);
      }
    }
  });

  it('derives structural pytest xdist N from nproc / overlapping shards', () => {
    expect(STRUCTURAL_PYTEST_OVERLAPPING_SHARDS).toBe(2);
    expect(STRUCTURAL_PYTEST_XDIST_N).toContain('$(nproc)');
    expect(STRUCTURAL_PYTEST_XDIST_N).not.toContain('auto');
    expect(STRUCTURAL_PYTEST_SHARD_COMMANDS).toHaveLength(2);
    for (const command of STRUCTURAL_PYTEST_SHARD_COMMANDS) {
      expect(command).toContain(`-m pytest -n ${STRUCTURAL_PYTEST_XDIST_N} `);
      expect(command).not.toMatch(/-n auto\b/);
      expect(command).not.toMatch(/-n 2\b/);
    }
    expect(evaluateXdistN(4)).toBe(2);
    expect(evaluateXdistN(8)).toBe(4);
    expect(evaluateXdistN(2)).toBe(1);
    expect(evaluateXdistN(1)).toBe(1);
  });

  it('runs Storybook Playwright at 3 workers with the existing 3 shards', () => {
    const storybook = jobBlock('ci-storybook-surfaces');
    expect(storybook).toMatch(/runs-on: ubuntu-(?:latest|24\.04)/);
    expect(storybook).toContain(`--workers=${STORYBOOK_PLAYWRIGHT_WORKERS} `);
    expect(storybook).toContain('--shard="$STORYBOOK_SHARD/3"');
    expect(storybook).not.toContain('--workers=2');
    expect(storybook).not.toContain('--workers=4');
    expect(storybook).not.toContain('--shard="$STORYBOOK_SHARD/6"');
    expect(
      CI_RUNNER_WORKER_POLICY.jobs['ci-storybook-surfaces'].derivation
    ).toBe('documented-exception');
  });

  it('derives Blog vitest workers from nproc and leaves unit-test caps alone', () => {
    const blog = jobBlock('ci-blog-content');
    expect(blog).toMatch(/runs-on: ubuntu-(?:latest|24\.04)/);
    expect(blog).toContain(`--maxWorkers=${BLOG_VITEST_MAX_WORKERS}`);
    expect(blog).not.toContain('--maxWorkers 2');
    expect(blog).not.toContain('--maxWorkers auto');
    // Unit Tests already use nproc; the quarantined unit lane stays at 2.
    expect(CI_YML).toContain('"--maxWorkers=$(nproc)"');
    expect(CI_YML).toContain(
      'pnpm turbo test:fast --affected -- --pool=forks --maxWorkers=2 --retry='
    );
  });
});
