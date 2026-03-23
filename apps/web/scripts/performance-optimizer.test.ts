import { describe, expect, it } from 'vitest';
import {
  deriveRunStatus,
  filterChangedFiles,
  getThresholdRecommendation,
} from './performance-optimizer';
import {
  createDashboardMeasurement,
  createEmptyRunState,
} from './performance-optimizer-lib';

describe('performance optimizer helpers', () => {
  it('filters perf artifacts from the changed-files list', () => {
    expect(
      filterChangedFiles([
        'apps/web/scripts/performance-optimizer.ts',
        '.context/perf/dashboard-current.json',
        '.context/perf/example/state.json',
        '.context/perf/example/measurements/homepage-sample-01.json',
        '',
      ])
    ).toEqual(['apps/web/scripts/performance-optimizer.ts']);
  });

  it('recomputes status from the current threshold and best measurement', () => {
    const state = createEmptyRunState(
      {
        mode: 'dashboard',
        threshold: 100,
        baseUrl: 'http://localhost:3000',
        authPath: 'apps/web/.auth/session.json',
        maxNoProgress: 3,
        runsPerSample: 3,
        artifactsDir: '.context/perf/dashboard-test',
      },
      '.context/perf/dashboard-test/optimizer-prompt.txt'
    );
    const bestMeasurement = createDashboardMeasurement(
      [
        {
          warmShellResponseMs: 90,
          timeToFirstByteMs: 220,
          skeletonToContentMs: 260,
          firstContentfulPaintMs: 900,
          largestContentfulPaintMs: 1400,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
      ],
      100,
      null
    );

    expect(
      deriveRunStatus({
        bestMeasurement,
        config: state.config,
        noProgressCount: 0,
      })
    ).toBe('threshold-hit');

    expect(
      deriveRunStatus({
        bestMeasurement,
        config: { ...state.config, threshold: 75 },
        noProgressCount: 0,
      })
    ).toBe('running');

    expect(
      deriveRunStatus({
        bestMeasurement,
        config: { ...state.config, threshold: 75 },
        noProgressCount: 3,
      })
    ).toBe('stalled');
  });

  it('keeps the dashboard threshold recommendation moving past the 25ms floor', () => {
    expect(
      getThresholdRecommendation({
        mode: 'dashboard',
        threshold: 25,
      })
    ).toBe(1);
  });
});
