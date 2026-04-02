import { describe, expect, it } from 'vitest';
import type { GuardSummary } from './performance-budgets-guard';
import {
  applyRouteOutcome,
  createEndUserLoopState,
  normalizeRawPageResults,
  refreshEndUserLoopStateConfig,
} from './performance-end-user-loop';
import {
  createDashboardMeasurement,
  createHomepageMeasurement,
  type PerfLoopCliOptions,
  type PerfMeasurement,
} from './performance-optimizer-lib';
import { getEndUserPerfRouteById } from './performance-route-manifest';

function requireRoute(routeId: string) {
  const route = getEndUserPerfRouteById(routeId);
  if (!route) {
    throw new Error(`Missing route ${routeId}`);
  }

  return route;
}

function createCliOptions(
  overrides: Partial<PerfLoopCliOptions> = {}
): PerfLoopCliOptions {
  return {
    baseUrl: 'http://127.0.0.1:4100',
    fresh: false,
    groupIds: [],
    maxNoProgress: 3,
    mode: 'route',
    optimizePassing: false,
    resume: false,
    runsPerSample: 3,
    scope: 'end-user',
    skipBuild: true,
    threshold: 100,
    ...overrides,
  };
}

function createSummary(): GuardSummary {
  return {
    baseUrl: 'http://127.0.0.1:4100',
    checkedAt: '2026-04-02T00:00:00.000Z',
    pages: [
      {
        auth: false,
        configuredPath: '/',
        group: 'home',
        id: 'home',
        primaryMetric: 'interactive-shell-ready',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 100,
          stylesheet: 20,
          total: 120,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 400,
          'first-input-delay': 0,
          'interactive-shell-ready': 180,
          'largest-contentful-paint': 700,
          'redirect-complete': 0,
          'skeleton-to-content': 0,
          'time-to-first-byte': 90,
          'warm-shell-response': 0,
        },
        resolvedPath: '/',
        resourceSizes: [],
        routeSurface: 'homepage',
        samples: [],
        timings: [
          {
            budget: 100,
            measured: 180,
            name: 'interactive-shell-ready',
            overshootPct: 80,
            passed: false,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/',
        violations: [
          {
            budget: 100,
            kind: 'timing',
            measured: 180,
            name: 'interactive-shell-ready',
            overshootPct: 80,
            passed: false,
            unit: 'ms',
          },
        ],
      },
      {
        auth: false,
        configuredPath: '/tim',
        group: 'public-profile-core',
        id: 'public-profile-main',
        primaryMetric: 'first-contentful-paint',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 300,
          stylesheet: 30,
          total: 330,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 500,
          'first-input-delay': 0,
          'interactive-shell-ready': 0,
          'largest-contentful-paint': 800,
          'redirect-complete': 0,
          'skeleton-to-content': 0,
          'time-to-first-byte': 110,
          'warm-shell-response': 0,
        },
        resolvedPath: '/tim',
        resourceSizes: [],
        routeSurface: 'public-profile',
        samples: [],
        timings: [
          {
            budget: 3000,
            measured: 500,
            name: 'first-contentful-paint',
            overshootPct: 0,
            passed: true,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/tim',
        violations: [],
      },
      {
        auth: true,
        configuredPath: '/app/dashboard/releases',
        group: 'creator-shell',
        id: 'creator-releases',
        primaryMetric: 'warm-shell-response',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 500,
          stylesheet: 40,
          total: 540,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 600,
          'first-input-delay': 0,
          'interactive-shell-ready': 0,
          'largest-contentful-paint': 900,
          'redirect-complete': 0,
          'skeleton-to-content': 120,
          'time-to-first-byte': 120,
          'warm-shell-response': 130,
        },
        resolvedPath: '/app/dashboard/releases',
        resourceSizes: [],
        routeSurface: 'creator-app',
        samples: [],
        timings: [
          {
            budget: 100,
            measured: 130,
            name: 'warm-shell-response',
            overshootPct: 30,
            passed: false,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/app/dashboard/releases',
        violations: [
          {
            budget: 100,
            kind: 'timing',
            measured: 130,
            name: 'warm-shell-response',
            overshootPct: 30,
            passed: false,
            unit: 'ms',
          },
        ],
      },
    ],
    status: 'fail',
    violationCount: 2,
  };
}

describe('performance end-user loop', () => {
  it('builds a failing-route queue while skipping passing routes by default', () => {
    const state = createEndUserLoopState({
      artifactDir: '/tmp/perf/end-user',
      authPath: '/tmp/auth.json',
      baselineSummary: createSummary(),
      cliOptions: createCliOptions(),
      promptPath: '/tmp/perf/end-user/optimizer-prompt.txt',
      routes: [
        requireRoute('home'),
        requireRoute('public-profile-main'),
        requireRoute('creator-releases'),
      ],
      routesDir: '/tmp/perf/end-user/routes',
    });

    expect(state.routeOrder).toEqual(['home', 'creator-releases']);
    expect(state.completedRoutes).toEqual(['public-profile-main']);
    expect(state.currentRouteId).toBe('home');
  });

  it('filters stale failing route ids that are outside the selected routes', () => {
    const summary = createSummary();
    const baselineSummary = {
      ...summary,
      pages: [
        ...summary.pages,
        {
          ...summary.pages[2]!,
          id: 'creator-earnings',
          configuredPath: '/app/dashboard/earnings',
          resolvedPath: '/app/dashboard/earnings',
          url: 'http://127.0.0.1:4100/app/dashboard/earnings',
        },
      ],
    } satisfies GuardSummary;
    const state = createEndUserLoopState({
      artifactDir: '/tmp/perf/end-user',
      authPath: '/tmp/auth.json',
      baselineSummary,
      cliOptions: createCliOptions(),
      promptPath: '/tmp/perf/end-user/optimizer-prompt.txt',
      routes: [requireRoute('home'), requireRoute('creator-releases')],
      routesDir: '/tmp/perf/end-user/routes',
    });

    expect(state.routeOrder).toEqual(['home', 'creator-releases']);
    expect(state.routeStates['creator-earnings']).toBeUndefined();
    expect(state.currentRouteId).toBe('home');
  });

  it('keeps passing routes in the queue when optimizePassing is enabled', () => {
    const state = createEndUserLoopState({
      artifactDir: '/tmp/perf/end-user',
      authPath: '/tmp/auth.json',
      baselineSummary: createSummary(),
      cliOptions: createCliOptions({ optimizePassing: true }),
      promptPath: '/tmp/perf/end-user/optimizer-prompt.txt',
      routes: [
        requireRoute('home'),
        requireRoute('public-profile-main'),
        requireRoute('creator-releases'),
      ],
      routesDir: '/tmp/perf/end-user/routes',
    });

    expect(state.routeOrder).toEqual([
      'home',
      'creator-releases',
      'public-profile-main',
    ]);
    expect(state.completedRoutes).toEqual([]);
  });

  it('tightens the homepage threshold when Lighthouse passes but the route guard still fails', () => {
    const state = createEndUserLoopState({
      artifactDir: '/tmp/perf/end-user',
      authPath: '/tmp/auth.json',
      baselineSummary: createSummary(),
      cliOptions: createCliOptions(),
      promptPath: '/tmp/perf/end-user/optimizer-prompt.txt',
      routes: [requireRoute('home')],
      routesDir: '/tmp/perf/end-user/routes',
    });
    const routeState = state.routeStates.home;
    routeState.perfState.bestMeasurement = createHomepageMeasurement(
      [
        {
          lighthouseScore: 95,
          accessibilityScore: 98,
          seoScore: 98,
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
    routeState.perfState.status = 'threshold-hit';

    applyRouteOutcome(state, routeState, createSummary().pages[0]!);

    expect(routeState.perfState.config.threshold).toBe(96);
    expect(routeState.status).toBe('running');
    expect(state.currentRouteId).toBe('home');
  });

  it('extracts the median raw page result for route-mode measurements', () => {
    const measurement = createDashboardMeasurement(
      [
        {
          warmShellResponseMs: 200,
          timeToFirstByteMs: 180,
          skeletonToContentMs: 240,
          firstContentfulPaintMs: 700,
          largestContentfulPaintMs: 1000,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
        {
          warmShellResponseMs: 150,
          timeToFirstByteMs: 170,
          skeletonToContentMs: 230,
          firstContentfulPaintMs: 680,
          largestContentfulPaintMs: 980,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
        {
          warmShellResponseMs: 100,
          timeToFirstByteMs: 160,
          skeletonToContentMs: 220,
          firstContentfulPaintMs: 660,
          largestContentfulPaintMs: 960,
          cumulativeLayoutShift: 0.01,
          finalUrl: '/app/dashboard/releases',
        },
      ],
      100,
      [
        {
          pages: [
            {
              ...createSummary().pages[2]!,
              rawTimings: {
                ...createSummary().pages[2]!.rawTimings,
                'warm-shell-response': 200,
              },
            },
          ],
        },
        {
          pages: [
            {
              ...createSummary().pages[2]!,
              rawTimings: {
                ...createSummary().pages[2]!.rawTimings,
                'warm-shell-response': 150,
              },
            },
          ],
        },
        {
          pages: [
            {
              ...createSummary().pages[2]!,
              rawTimings: {
                ...createSummary().pages[2]!.rawTimings,
                'warm-shell-response': 100,
              },
            },
          ],
        },
      ]
    ) as PerfMeasurement<unknown>;

    const page = normalizeRawPageResults(measurement, 'creator-releases');

    expect(page.rawTimings['warm-shell-response']).toBe(150);
  });

  it('refreshes persisted route configs from the current CLI on resume', () => {
    const state = createEndUserLoopState({
      artifactDir: '/tmp/perf/end-user',
      authPath: '/tmp/auth.json',
      baselineSummary: createSummary(),
      cliOptions: createCliOptions({ baseUrl: 'http://localhost:3000' }),
      promptPath: '/tmp/perf/end-user/optimizer-prompt.txt',
      routes: [requireRoute('home'), requireRoute('creator-releases')],
      routesDir: '/tmp/perf/end-user/routes',
    });

    const refreshed = refreshEndUserLoopStateConfig(
      state,
      createCliOptions({
        baseUrl: 'http://127.0.0.1:4010',
        authPath: 'apps/web/.auth/session.json',
        runsPerSample: 5,
        maxNoProgress: 7,
      })
    );

    expect(refreshed.routeStates.home.perfState.config.baseUrl).toBe(
      'http://127.0.0.1:4010'
    );
    expect(
      refreshed.routeStates['creator-releases'].perfState.config.baseUrl
    ).toBe('http://127.0.0.1:4010');
    expect(
      refreshed.routeStates['creator-releases'].perfState.config.authPath
    ).toContain('apps/web/.auth/session.json');
    expect(
      refreshed.routeStates['creator-releases'].perfState.config.runsPerSample
    ).toBe(5);
    expect(
      refreshed.routeStates['creator-releases'].perfState.config.maxNoProgress
    ).toBe(7);
  });
});
