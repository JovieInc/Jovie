import { describe, expect, it, vi } from 'vitest';
import {
  planSyntheticMonitoringAction,
  runSyntheticMonitoringIntake,
} from '../../synthetic-monitoring-intake.mjs';
import {
  captureWarnings,
  ISSUE,
  installRetryFixture,
} from './linear-rate-limit-retry.fixtures.mjs';

describe('planSyntheticMonitoringAction', () => {
  it('treats a passed rerun and flake-only results as flakes', () => {
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'passed',
        runAttempt: 2,
      })
    ).toMatchObject({ action: 'flake' });
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'passed',
        flakyCount: 1,
      })
    ).toMatchObject({ action: 'flake', reason: 'flake' });
  });

  it('files on an exhausted in-job retry or a second red run', () => {
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'failed',
        failedRetry: true,
      })
    ).toMatchObject({ action: 'upsert', reason: 'in_job_retry_failed' });
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'failed',
        previousConclusion: 'failure',
      })
    ).toMatchObject({ action: 'upsert', reason: 'consecutive_red' });
  });

  it('holds a single red and the first green, then resolves the second green', () => {
    expect(
      planSyntheticMonitoringAction({ testStatus: 'error' })
    ).toMatchObject({ action: 'hold', reason: 'need_second_red' });
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'passed',
        previousConclusion: 'failure',
      })
    ).toMatchObject({ action: 'hold', reason: 'need_second_green' });
    expect(
      planSyntheticMonitoringAction({
        testStatus: 'passed',
        previousConclusion: 'success',
      })
    ).toMatchObject({ action: 'resolve', reason: 'second_green' });
  });
});

describe('runSyntheticMonitoringIntake', () => {
  installRetryFixture();

  it('incomplete recovery evidence leaves Linear open without failing the canary', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            team: {
              states: { nodes: [{ id: 'done', type: 'completed' }] },
              labels: ISSUE.labels,
            },
            issues: { nodes: [ISSUE] },
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            issue: {
              comments: {
                nodes: [],
                pageInfo: { hasNextPage: true, endCursor: null },
              },
            },
          },
        })
      );

    const { result, warnings } = await captureWarnings(() =>
      runSyntheticMonitoringIntake({
        env: { TEST_STATUS: 'passed', PREVIOUS_CONCLUSION: 'success' },
        fetchImpl,
      })
    );

    expect(result).toEqual({
      ok: true,
      action: 'defer',
      reason: 'linear_comments_incomplete',
    });
    expect(warnings.join('\n')).toContain('Synthetic recovery deferred');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
