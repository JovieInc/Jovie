import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../constants/routes';
import {
  buildDashboardBudgetGuardArgs,
  buildOptimizerPrompt,
  createDashboardMeasurement,
  createEmptyRunState,
  createHomepageMeasurement,
  evaluateMeasurement,
  extractDashboardSample,
  extractHomepageSample,
  getRankedHypotheses,
  parsePerfLoopArgs,
} from './performance-optimizer-lib';

describe('performance optimizer lib', () => {
  it('ignores the literal pnpm argument separator when parsing cli flags', () => {
    const parsed = parsePerfLoopArgs([
      '--mode',
      'dashboard',
      '--',
      '--threshold',
      '100',
    ]);

    expect(parsed.mode).toBe('dashboard');
    expect(parsed.scope).toBe('route');
    expect(parsed.threshold).toBe(100);
  });

  it('preserves an explicit threshold even when mode is parsed later', () => {
    const parsed = parsePerfLoopArgs([
      '--threshold',
      '90',
      '--mode',
      'dashboard',
    ]);

    expect(parsed.mode).toBe('dashboard');
    expect(parsed.scope).toBe('route');
    expect(parsed.threshold).toBe(90);
  });

  it('parses end-user scope, route ids, and group filters', () => {
    const parsed = parsePerfLoopArgs([
      '--scope',
      'end-user',
      '--group',
      'creator-shell',
      '--route-id',
      'creator-earnings',
      '--resume',
      '--optimize-passing',
    ]);

    expect(parsed.scope).toBe('end-user');
    expect(parsed.groupIds).toEqual(['creator-shell']);
    expect(parsed.routeId).toBe('creator-earnings');
    expect(parsed.resume).toBe(true);
    expect(parsed.optimizePassing).toBe(true);
  });

  it('rejects even runs-per-sample values so median selection stays unbiased', () => {
    expect(() =>
      parsePerfLoopArgs([
        '--mode',
        'homepage',
        '--threshold',
        '95',
        '--runs-per-sample',
        '4',
      ])
    ).toThrow('Expected a positive odd integer for --runs-per-sample');
  });

  it('accepts --runs as an alias for --runs-per-sample', () => {
    const parsed = parsePerfLoopArgs(['--scope', 'end-user', '--runs', '1']);

    expect(parsed.runsPerSample).toBe(1);
  });

  it('uses the package-relative budget guard script path', () => {
    const args = buildDashboardBudgetGuardArgs();

    expect(args).toContain('scripts/performance-budgets-guard.ts');
    expect(args).not.toContain('apps/web/scripts/performance-budgets-guard.ts');
  });

  it('forwards the auth path to the budget guard command', () => {
    const args = buildDashboardBudgetGuardArgs('/tmp/session.json');

    expect(args).toEqual(
      expect.arrayContaining(['--auth-path', '/tmp/session.json'])
    );
  });

  it('prefers route ids over paths when building budget guard args', () => {
    const args = buildDashboardBudgetGuardArgs(
      '/tmp/session.json',
      '/app/dashboard/releases',
      'creator-releases'
    );

    expect(args).toEqual(
      expect.arrayContaining(['--route-id', 'creator-releases'])
    );
    expect(args).not.toEqual(expect.arrayContaining(['--path']));
  });

  it('aggregates homepage lighthouse samples around the median score', () => {
    const samples = [
      extractHomepageSample({
        finalDisplayedUrl: 'http://localhost:3000/',
        categories: {
          performance: { score: 0.92 },
          accessibility: { score: 0.98 },
          seo: { score: 0.97 },
        },
        audits: {
          'largest-contentful-paint': { numericValue: 2200 },
          'first-contentful-paint': { numericValue: 1500 },
          'total-blocking-time': { numericValue: 120 },
          'cumulative-layout-shift': { numericValue: 0.02 },
        },
      }),
      extractHomepageSample({
        finalDisplayedUrl: 'http://localhost:3000/',
        categories: {
          performance: { score: 0.94 },
          accessibility: { score: 0.99 },
          seo: { score: 0.96 },
        },
        audits: {
          'largest-contentful-paint': { numericValue: 2100 },
          'first-contentful-paint': { numericValue: 1400 },
          'total-blocking-time': { numericValue: 100 },
          'cumulative-layout-shift': { numericValue: 0.01 },
        },
      }),
      extractHomepageSample({
        finalDisplayedUrl: 'http://localhost:3000/',
        categories: {
          performance: { score: 0.96 },
          accessibility: { score: 0.99 },
          seo: { score: 0.98 },
        },
        audits: {
          'largest-contentful-paint': { numericValue: 2000 },
          'first-contentful-paint': { numericValue: 1300 },
          'total-blocking-time': { numericValue: 90 },
          'cumulative-layout-shift': { numericValue: 0.01 },
        },
      }),
    ];

    const measurement = createHomepageMeasurement(samples, 95, samples);

    expect(measurement.primaryMetric).toBe(94);
    expect(measurement.medianSample.largestContentfulPaintMs).toBe(2100);
    expect(
      measurement.guardrails.find(g => g.key === 'total-blocking-time')?.value
    ).toBe(100);
  });

  it('extracts dashboard warm shell timings from raw budget guard output', () => {
    const sample = extractDashboardSample({
      pages: [
        {
          url: 'http://localhost:3000/app/dashboard/releases',
          rawTimings: {
            'warm-shell-response': 88,
            'time-to-first-byte': 220,
            'skeleton-to-content': 240,
            'first-contentful-paint': 800,
            'largest-contentful-paint': 1200,
            'cumulative-layout-shift': 0.01,
          },
        },
      ],
    });

    expect(sample.warmShellResponseMs).toBe(88);
    expect(sample.skeletonToContentMs).toBe(240);
  });

  it('accepts a homepage optimization when the lighthouse score clears noise without regressions', () => {
    const baseline = createHomepageMeasurement(
      [
        {
          lighthouseScore: 93,
          accessibilityScore: 98,
          seoScore: 97,
          largestContentfulPaintMs: 2200,
          firstContentfulPaintMs: 1500,
          totalBlockingTimeMs: 140,
          cumulativeLayoutShift: 0.02,
          finalUrl: '/',
        },
      ],
      95,
      null
    );
    const candidate = createHomepageMeasurement(
      [
        {
          lighthouseScore: 95,
          accessibilityScore: 98,
          seoScore: 97,
          largestContentfulPaintMs: 2100,
          firstContentfulPaintMs: 1450,
          totalBlockingTimeMs: 120,
          cumulativeLayoutShift: 0.02,
          finalUrl: '/',
        },
      ],
      95,
      null
    );

    const decision = evaluateMeasurement(baseline, candidate);

    expect(decision.accepted).toBe(true);
    expect(decision.thresholdReached).toBe(true);
  });

  it('rejects a dashboard optimization when a guardrail regresses materially', () => {
    const baseline = createDashboardMeasurement(
      [
        {
          warmShellResponseMs: 150,
          timeToFirstByteMs: 200,
          skeletonToContentMs: 240,
          firstContentfulPaintMs: 900,
          largestContentfulPaintMs: 1400,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
      ],
      100,
      null
    );
    const candidate = createDashboardMeasurement(
      [
        {
          warmShellResponseMs: 120,
          timeToFirstByteMs: 260,
          skeletonToContentMs: 250,
          firstContentfulPaintMs: 920,
          largestContentfulPaintMs: 1420,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
      ],
      100,
      null
    );

    const decision = evaluateMeasurement(baseline, candidate);

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toContain('TTFB');
  });

  it('treats low-absolute TBT movement as noise when the primary metric improves', () => {
    const baseline = createHomepageMeasurement(
      [
        {
          lighthouseScore: 78,
          accessibilityScore: 96,
          seoScore: 100,
          largestContentfulPaintMs: 5771,
          firstContentfulPaintMs: 1511,
          totalBlockingTimeMs: 5,
          cumulativeLayoutShift: 0,
          finalUrl: '/',
        },
      ],
      95,
      null
    );
    const candidate = createHomepageMeasurement(
      [
        {
          lighthouseScore: 80,
          accessibilityScore: 96,
          seoScore: 100,
          largestContentfulPaintMs: 5391,
          firstContentfulPaintMs: 1516,
          totalBlockingTimeMs: 21,
          cumulativeLayoutShift: 0,
          finalUrl: '/',
        },
      ],
      95,
      null
    );

    const decision = evaluateMeasurement(baseline, candidate);

    expect(decision.accepted).toBe(true);
    expect(decision.reason).toContain('no material guardrail regression');
  });

  it('builds a repo-specific optimizer prompt with the next ranked hypothesis', () => {
    const state = createEmptyRunState(
      {
        mode: 'dashboard',
        scope: 'route',
        threshold: 100,
        baseUrl: 'http://localhost:3000',
        authPath: 'apps/web/.auth/session.json',
        maxNoProgress: 3,
        runsPerSample: 5,
        artifactsDir: '.context/perf/dashboard-test',
      },
      '.context/perf/dashboard-test/optimizer-prompt.txt'
    );
    state.bestMeasurement = createDashboardMeasurement(
      [
        {
          warmShellResponseMs: 110,
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

    const prompt = buildOptimizerPrompt({
      state,
      nextHypothesis: getRankedHypotheses('dashboard')[0],
      changedFiles: [
        'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
      ],
    });

    expect(prompt).toContain('Mode: dashboard');
    expect(prompt).toContain('DashboardNav.tsx');
    expect(prompt).toContain('Route performance for /app/dashboard/releases');
    expect(prompt).toContain(APP_ROUTES.DASHBOARD_RELEASES);
    expect(prompt).toContain('Measure a 5-run baseline and use the median.');
    expect(prompt).toContain('Rebuild and remeasure 5 times.');
  });
});
