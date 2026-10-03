import { describe, expect, it } from 'vitest';
import { planSyntheticMonitoringAction } from '../../synthetic-monitoring-intake.mjs';

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
