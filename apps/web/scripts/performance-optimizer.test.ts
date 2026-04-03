import { describe, expect, it } from 'vitest';
import {
  deriveRunStatus,
  filterChangedFiles,
  getNextHypothesisIndex,
  getThresholdRecommendation,
  isStricterThreshold,
} from './performance-optimizer';
import {
  createDashboardMeasurement,
  createEmptyRunState,
} from './performance-optimizer-lib';
import { requiresDashboardAuth } from './performance-optimizer-shared';

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
        scope: 'route',
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

  it('requires stricter interactive thresholds relative to the current best measurement', () => {
    expect(isStricterThreshold({ mode: 'homepage' }, 95, 96)).toBe(true);
    expect(isStricterThreshold({ mode: 'homepage' }, 95, 94)).toBe(false);
    expect(isStricterThreshold({ mode: 'dashboard' }, 90, 80)).toBe(true);
    expect(isStricterThreshold({ mode: 'dashboard' }, 90, 95)).toBe(false);
  });

  it('clamps the next hypothesis index to the last valid slot', () => {
    expect(getNextHypothesisIndex(0, 4)).toBe(1);
    expect(getNextHypothesisIndex(3, 4)).toBe(3);
    expect(getNextHypothesisIndex(0, 0)).toBe(0);
  });

  it('does not require auth for manifest-backed public routes', () => {
    expect(requiresDashboardAuth(undefined, 'public-profile-main')).toBe(false);
    expect(requiresDashboardAuth('/[username]')).toBe(false);
    expect(requiresDashboardAuth('/app/dashboard/releases')).toBe(true);
  });
});
