/**
 * Wall-clock budget coverage for the Linear validation lifecycle sweep
 * (JOV-7887), split out of linear-sync-on-merge.test.mjs so that file stays
 * inside its size-500 ceiling. The clock is faked for every test here: the
 * guard (scripts/wall-clock-test-guard.mjs) fails a test that reads the real
 * clock while holding fixed calendar dates and never controlling the clock.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncLinearIssueOnMerge } from '../linear-sync-on-merge.mjs';
import {
  reportSweepDeferral,
  SWEEP_MIN_BATCH_WINDOW_MS,
  sweepBudgetRemainingMs,
} from '../sweep-wall-clock.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  NO_UI_MATRIX,
} from './fixtures/validation-world.mjs';

const BASE_ENV = {
  LINEAR_API_KEY: 'lin_test',
  GITHUB_TOKEN: 'gh_test',
  GITHUB_REPOSITORY: 'JovieInc/Jovie',
};
const CLOCK = '2026-11-19T12:00:00Z';

describe('sweep wall-clock budget (JOV-7887)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CLOCK);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the batch window a constant the loop actually compares against', () => {
    expect(SWEEP_MIN_BATCH_WINDOW_MS).toBe(90_000);
  });

  it('reads the exported deadline only when it parses', () => {
    expect(sweepBudgetRemainingMs(undefined)).toBe(null);
    expect(sweepBudgetRemainingMs('')).toBe(null);
    expect(sweepBudgetRemainingMs('not-a-timestamp')).toBe(null);
    expect(sweepBudgetRemainingMs('2026-11-19T12:05:00Z')).toBe(300_000);
    expect(sweepBudgetRemainingMs('2026-11-19T11:55:00Z')).toBe(-300_000);
  });

  it('pauses a full sweep at an expired deadline without any lifecycle write', async () => {
    const { world, fetchImpl } = createWorld();
    const cursorDir = mkdtempSync(join(tmpdir(), 'linear-budget-cursor-'));
    try {
      const result = await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          LIFECYCLE_MODE: 'sweep',
          LINEAR_SYNC_CURSOR_DIR: cursorDir,
          // The clock reads 12:00; this deadline is already behind it.
          LINEAR_SYNC_DEADLINE_AT: '2026-11-19T11:59:59Z',
        },
        fetchImpl,
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
        verifyMarker: () => true,
        log: () => {},
      });
      expect(result.action).toBe('budget_deferred');
      expect(result.deferred).toBeGreaterThanOrEqual(1);
      expect(world.updates).toEqual([]);
      expect(
        JSON.parse(readFileSync(join(cursorDir, 'cursor.json'), 'utf8'))
          .nextIdentifier
      ).toBe('JOV-1');
      // A wall-clock pause is not a quota event: the summary keeps it
      // visible, but the GitHub-quota hold and its retry must not run.
      const stepSummary = join(cursorDir, 'summary');
      const stepOutput = join(cursorDir, 'output');
      expect(
        reportSweepDeferral(result, {
          GITHUB_STEP_SUMMARY: stepSummary,
          GITHUB_OUTPUT: stepOutput,
        })
      ).toBe(true);
      expect(readFileSync(stepSummary, 'utf8')).toContain('wall-clock budget');
      expect(existsSync(stepOutput)).toBe(false);
    } finally {
      rmSync(cursorDir, { recursive: true, force: true });
    }
  });

  it('evaluates the sweep normally when the exported deadline is far away', async () => {
    const { fetchImpl } = createWorld();
    const result = await syncLinearIssueOnMerge({
      env: {
        ...BASE_ENV,
        LIFECYCLE_MODE: 'sweep',
        LINEAR_SYNC_DEADLINE_AT: '2026-11-19T12:30:00Z',
      },
      fetchImpl,
      harnessManifest: HARNESS_MANIFEST,
      assuranceMatrix: NO_UI_MATRIX,
      verifyMarker: () => true,
      log: () => {},
    });
    expect(result.action).not.toBe('budget_deferred');
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });
});
