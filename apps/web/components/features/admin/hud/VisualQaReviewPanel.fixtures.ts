import type {
  VisualQaReviewRun,
  VisualQaReviewSurface,
} from '@/lib/agent-os/visual-qa/review';

export function visualQaSurface(
  overrides: Partial<VisualQaReviewSurface> = {}
): VisualQaReviewSurface {
  return {
    surfaceId: 'home',
    title: 'Home',
    baselinePath: 'baseline/home.png',
    afterPath: 'after/home.png',
    overlayPath: 'overlay/home.png',
    rawDiffRatio: 0.02,
    weightedDriftScore: 0.0231,
    threshold: 0.01,
    status: 'drift_detected',
    regionScores: [],
    review: null,
    ...overrides,
  };
}

export function visualQaRun(
  overrides: Partial<VisualQaReviewRun> = {}
): VisualQaReviewRun {
  return {
    runId: 'run-1',
    computedAt: '2026-10-02T12:00:00Z',
    passed: false,
    surfaces: [visualQaSurface()],
    ...overrides,
  };
}
