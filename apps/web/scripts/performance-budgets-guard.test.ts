import type { Page } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightMocks = vi.hoisted(() => ({
  browserClose: vi.fn(),
  chromiumLaunch: vi.fn(),
}));

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: playwrightMocks.chromiumLaunch,
  },
}));

import type {
  GuardSample,
  MetricResult,
  PageResult,
  ViolationResult,
} from './performance-budgets-guard';
import {
  buildConfirmedPageResult,
  confirmTimingViolations,
  evaluateTimingConfirmation,
  loadGuardManifestRoutes,
  measureSameRouteInteraction,
  measureWarmNavigationRoute,
  parseGuardCliArgs,
  runPerformanceBudgetsGuard,
  selectGuardRoutes,
  waitForWarmDestinationReady,
} from './performance-budgets-guard';
import type {
  PerfResourceMetricName,
  PerfRouteDefinition,
  PerfTimingMetricName,
} from './performance-route-manifest';

function createConfirmationSample(
  metric: PerfTimingMetricName,
  measured: number,
  resourceMeasured = 0
): GuardSample {
  return {
    finalUrl: 'http://127.0.0.1:4100/app/confirmed',
    resolvedPath: '/app/confirmed',
    resourceValues: {
      font: 0,
      image: 0,
      script: resourceMeasured,
      stylesheet: 0,
      total: resourceMeasured,
    } satisfies Record<PerfResourceMetricName, number>,
    timingValues: {
      'cumulative-layout-shift': 0,
      'first-contentful-paint': 0,
      'first-input-delay': 0,
      'interactive-shell-ready': 0,
      'largest-contentful-paint': 0,
      'redirect-complete': 0,
      'skeleton-to-content': 0,
      'time-to-first-byte': 0,
      'warm-shell-response': 0,
      [metric]: measured,
    } satisfies Record<PerfTimingMetricName, number>,
  };
}

function createMetric(
  name: string,
  measured: number,
  budget: number,
  unit: 'KB' | 'ms' = 'ms'
): MetricResult {
  return {
    budget,
    measured,
    name,
    overshootPct: measured > budget ? ((measured - budget) / budget) * 100 : 0,
    passed: measured <= budget,
    unit,
  };
}

function createTimingViolation(
  routeId = 'creator-library',
  metric = 'warm-shell-response' as PerfTimingMetricName
): ViolationResult {
  return {
    ...createMetric(metric, 210, 100),
    kind: 'timing',
    routeId,
  };
}

function createConfirmationPage(options: {
  readonly id: string;
  readonly metric?: PerfTimingMetricName;
  readonly measured?: number;
  readonly resourceMeasured?: number;
  readonly includeMetric?: boolean;
}) {
  const metric = options.metric ?? 'warm-shell-response';
  const measured = options.measured ?? 65;
  const resourceMeasured = options.resourceMeasured ?? 0;
  return {
    id: options.id,
    resourceSizes: [createMetric('script', resourceMeasured, 100, 'KB')],
    samples: [createConfirmationSample(metric, measured, resourceMeasured)],
    timings:
      options.includeMetric === false
        ? []
        : [createMetric(metric, measured, 100)],
  };
}

function createPageResultFixture(options: {
  readonly id?: string;
  readonly primaryMeasured?: number;
  readonly primaryMetric?: PerfTimingMetricName;
  readonly rawTimings?: Partial<Record<PerfTimingMetricName, number>>;
  readonly samples?: readonly GuardSample[];
  readonly timings?: readonly MetricResult[];
  readonly violations?: readonly ViolationResult[];
}): PageResult {
  const id = options.id ?? 'creator-library';
  const primaryMetric = options.primaryMetric ?? 'warm-shell-response';
  const primaryMeasured = options.primaryMeasured ?? 65;
  const samples = options.samples ?? [
    createConfirmationSample(primaryMetric, primaryMeasured),
  ];
  const rawTimings = {
    ...samples[0]!.timingValues,
    ...options.rawTimings,
  } satisfies Record<PerfTimingMetricName, number>;
  const timings = options.timings ?? [
    createMetric(primaryMetric, primaryMeasured, 100),
  ];
  const violations =
    options.violations ??
    timings
      .filter(metric => !metric.passed)
      .map(metric => ({
        ...metric,
        kind: 'timing' as const,
        routeId: id,
      }));

  return {
    auth: true,
    configuredPath: '/app/library',
    group: 'creator-shell',
    id,
    initialViolations: violations,
    primaryMetric,
    rawResourceSizes: {
      font: 0,
      image: 0,
      script: 0,
      stylesheet: 0,
      total: 0,
    },
    rawTimings,
    resolvedPath: '/app/library',
    resourceSizes: [createMetric('script', 0, 100, 'KB')],
    routeSurface: 'creator-app',
    samples,
    timingConfirmations: [],
    timings,
    terminalStatus: violations.length > 0 ? 'fail' : 'pass',
    url: samples[0]!.finalUrl,
    violations,
  };
}

function createInteractivePage({
  contentSelector,
  finalUrl,
  triggerSelector,
}: {
  readonly contentSelector: string;
  readonly finalUrl: string;
  readonly triggerSelector: string;
}) {
  const events: string[] = [];
  const elapsedValues = [12, 64];
  let clicked = false;

  const trigger = {
    click: vi.fn(async () => {
      clicked = true;
      events.push('click');
    }),
    count: vi.fn().mockResolvedValue(1),
    evaluate: vi.fn(async () => {
      events.push('arm');
    }),
    isVisible: vi.fn().mockResolvedValue(true),
    nth: vi.fn(),
  };
  trigger.nth.mockReturnValue(trigger);

  const page = {
    evaluate: vi.fn(async () => {
      const elapsed = elapsedValues.shift();
      if (elapsed === undefined) {
        throw new Error('Unexpected elapsed-time evaluation');
      }
      events.push(`elapsed:${elapsed}`);
      return elapsed;
    }),
    goto: vi.fn(async () => {
      events.push('goto');
    }),
    locator: vi.fn((selector: string) => {
      if (selector === triggerSelector) return trigger;
      const candidate = {
        isVisible: vi.fn(async () => {
          events.push(`visible:${selector}`);
          return clicked;
        }),
      };
      return {
        count: vi.fn().mockResolvedValue(1),
        first: vi.fn(),
        nth: vi.fn().mockReturnValue(candidate),
      };
    }),
    url: vi.fn(() => finalUrl),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn(async (predicate: (url: URL) => boolean) => {
      events.push('url-ready');
      if (!predicate(new URL(finalUrl))) {
        throw new Error(`Unexpected final URL: ${finalUrl}`);
      }
    }),
  } as unknown as Page;

  return {
    contentSelector,
    events,
    page,
  };
}

describe('performance budgets guard', () => {
  beforeEach(() => {
    playwrightMocks.browserClose.mockReset();
    playwrightMocks.chromiumLaunch.mockReset();
    playwrightMocks.chromiumLaunch.mockResolvedValue({
      close: playwrightMocks.browserClose,
    });
  });

  it('passes an isolated timing outlier after a clean same-route confirmation', async () => {
    const initialViolation = createTimingViolation();
    const confirmationPage = createConfirmationPage({
      id: 'creator-library',
      measured: 65,
    });
    const measureConfirmation = vi.fn().mockResolvedValue(confirmationPage);

    const confirmations = await confirmTimingViolations({
      initialViolations: [initialViolation],
      measureConfirmation,
    });

    expect(measureConfirmation).toHaveBeenCalledOnce();
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]).toMatchObject({
      reason: 'clean-confirmation',
      routeId: 'creator-library',
      terminalStatus: 'pass',
    });
    expect(
      confirmations[0]?.samples[0]?.timingValues['warm-shell-response']
    ).toBe(65);
  });

  it('fails when the same route and metric remain over budget', async () => {
    const confirmations = await confirmTimingViolations({
      initialViolations: [createTimingViolation()],
      measureConfirmation: async () =>
        createConfirmationPage({
          id: 'creator-library',
          measured: 210,
        }),
    });

    expect(confirmations[0]).toMatchObject({
      reason: 'persistent-timing-violation',
      terminalStatus: 'fail',
    });
  });

  it('uses confirmation measurements for terminal fields and preserves initial evidence', async () => {
    const initialPage = createPageResultFixture({ primaryMeasured: 210 });
    const confirmationPage = createPageResultFixture({ primaryMeasured: 65 });
    const timingConfirmations = await confirmTimingViolations({
      initialViolations: initialPage.violations,
      measureConfirmation: async () => confirmationPage,
    });

    const terminalPage = buildConfirmedPageResult(
      initialPage,
      confirmationPage,
      timingConfirmations
    );

    expect(terminalPage.terminalStatus).toBe('pass');
    expect(terminalPage.rawTimings['warm-shell-response']).toBe(65);
    expect(terminalPage.timings[0]?.measured).toBe(65);
    expect(terminalPage.samples[0]?.timingValues['warm-shell-response']).toBe(
      65
    );
    expect(
      terminalPage.initialMeasurement?.rawTimings['warm-shell-response']
    ).toBe(210);
    expect(terminalPage.initialMeasurement?.timings[0]?.measured).toBe(210);
    expect(
      terminalPage.initialMeasurement?.samples[0]?.timingValues[
        'warm-shell-response'
      ]
    ).toBe(210);
  });

  it('keeps terminal failure when a different confirmation timing metric fails', async () => {
    const initialPage = createPageResultFixture({ primaryMeasured: 210 });
    const confirmationSample = createConfirmationSample(
      'warm-shell-response',
      65
    );
    const confirmationPage = createPageResultFixture({
      rawTimings: {
        'skeleton-to-content': 210,
      },
      samples: [
        {
          ...confirmationSample,
          timingValues: {
            ...confirmationSample.timingValues,
            'skeleton-to-content': 210,
          },
        },
      ],
      timings: [
        createMetric('warm-shell-response', 65, 100),
        createMetric('skeleton-to-content', 210, 100),
      ],
    });
    const timingConfirmations = await confirmTimingViolations({
      initialViolations: initialPage.violations,
      measureConfirmation: async () => confirmationPage,
    });

    const terminalPage = buildConfirmedPageResult(
      initialPage,
      confirmationPage,
      timingConfirmations
    );

    expect(timingConfirmations[0]?.terminalStatus).toBe('pass');
    expect(terminalPage.terminalStatus).toBe('fail');
    expect(terminalPage.violations).toEqual(confirmationPage.violations);
    expect(terminalPage.rawTimings['skeleton-to-content']).toBe(210);
  });

  it('fails on resource evidence and refuses to confirm an initial resource violation', async () => {
    const confirmationPage = createConfirmationPage({
      id: 'creator-library',
      measured: 65,
      resourceMeasured: 101,
    });
    const confirmations = await confirmTimingViolations({
      initialViolations: [createTimingViolation()],
      measureConfirmation: async () => confirmationPage,
    });

    expect(confirmations[0]).toMatchObject({
      reason: 'resource-violation',
      terminalStatus: 'fail',
    });

    await expect(
      confirmTimingViolations({
        initialViolations: [
          {
            ...createMetric('script', 101, 100, 'KB'),
            kind: 'resource',
            routeId: 'creator-library',
          },
        ],
        measureConfirmation: async () => confirmationPage,
      })
    ).rejects.toThrow('cannot launder resource violations');
  });

  it('fails closed for thrown execution and missing metric inspection errors', async () => {
    await expect(
      confirmTimingViolations({
        initialViolations: [createTimingViolation()],
        measureConfirmation: async () => {
          throw new Error('inspection failed');
        },
      })
    ).rejects.toThrow('inspection failed');

    await expect(
      confirmTimingViolations({
        initialViolations: [createTimingViolation()],
        measureConfirmation: async () =>
          createConfirmationPage({
            id: 'creator-library',
            includeMetric: false,
          }),
      })
    ).rejects.toThrow('metric mismatch');
  });

  it('does not replace a route or metric violation with another route or metric success', () => {
    const initialViolation = createTimingViolation();

    expect(() =>
      evaluateTimingConfirmation(
        initialViolation,
        createConfirmationPage({
          id: 'creator-chat-nav',
          measured: 65,
        })
      )
    ).toThrow('route mismatch');

    expect(() =>
      evaluateTimingConfirmation(
        initialViolation,
        createConfirmationPage({
          id: 'creator-library',
          metric: 'skeleton-to-content',
          measured: 65,
        })
      )
    ).toThrow('metric mismatch');
  });

  it('parses group and route-id selectors from the CLI', () => {
    const parsed = parseGuardCliArgs([
      '--group',
      'public-profile-core',
      '--route-id',
      'home',
      '--base-url',
      'http://127.0.0.1:4100',
    ]);

    expect(parsed.groupIds).toEqual(['public-profile-core']);
    expect(parsed.routeIds).toEqual(['home']);
    expect(parsed.baseUrl).toBe('http://127.0.0.1:4100');
  });

  it('selects grouped routes from the manifest without loading unrelated surfaces', async () => {
    const routes = await loadGuardManifestRoutes();
    const selected = selectGuardRoutes(
      routes,
      parseGuardCliArgs(['--group', 'creator-shell'])
    );

    expect(selected.length).toBeGreaterThan(1);
    expect(selected.every(route => route.group === 'creator-shell')).toBe(true);
    expect(selected.some(route => route.id === 'creator-releases')).toBe(true);
  });

  it('selects manifest routes by route id even when the path contains placeholders', async () => {
    const routes = await loadGuardManifestRoutes();
    const selected = selectGuardRoutes(
      routes,
      parseGuardCliArgs(['--route-id', 'onboarding-resume-spotify'])
    );

    expect(selected.map(route => route.id)).toEqual([
      'onboarding-resume-spotify',
    ]);
    expect(selected[0]?.path).toContain('resume=spotify');
  });

  it('fails before browser measurement when a manifest has an empty nav locator', async () => {
    await expect(
      loadGuardManifestRoutes(
        'apps/web/scripts/fixtures/performance-route-manifest.invalid.fixture.ts'
      )
    ).rejects.toThrow(
      'invalid-warm-nav-fixture" has an empty navTrigger selector at index 0'
    );
  });

  it('fails loudly when an authenticated route is measured without auth state', async () => {
    await expect(
      runPerformanceBudgetsGuard({
        authPath: '.context/perf/auth/does-not-exist.json',
        baseUrl: 'http://127.0.0.1:4100',
        groupIds: [],
        json: true,
        manifestPath: undefined,
        paths: [],
        routeIds: ['creator-chat'],
        runs: 3,
      })
    ).rejects.toThrow('requires auth');

    expect(playwrightMocks.chromiumLaunch).toHaveBeenCalledOnce();
    expect(playwrightMocks.browserClose).toHaveBeenCalledOnce();
  });

  it('does not pass a stalled warm destination from a persistent source shell', async () => {
    const queriedSelectors: string[] = [];
    const route = {
      id: 'stalled-destination',
      readySelectors: {
        shell: ['[data-testid="persistent-shell"]'],
        content: ['[data-testid="destination-content"]'],
      },
    } as PerfRouteDefinition;
    const page = {
      locator: vi.fn((selector: string) => {
        queriedSelectors.push(selector);
        return {
          count: vi.fn().mockResolvedValue(1),
          nth: vi.fn(() => ({
            isVisible: vi.fn().mockResolvedValue(false),
          })),
        };
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await expect(
      waitForWarmDestinationReady(page, route, Date.now(), false, 10)
    ).rejects.toThrow('destination-content');

    expect(queriedSelectors).toContain('[data-testid="destination-content"]');
    expect(queriedSelectors).not.toContain('[data-testid="persistent-shell"]');
  });

  it('records warm shell response before waiting for destination content', async () => {
    const fixture = createInteractivePage({
      contentSelector: '[data-testid="destination-content"]',
      finalUrl: 'http://127.0.0.1:4100/app/library',
      triggerSelector: 'a[href="/app/library"]',
    });
    const route = {
      id: 'warm-navigation-fixture',
      path: '/app/library',
      warmNavigationStartPath: '/app',
      measureMode: 'warm-navigation',
      readySelectors: {
        content: [fixture.contentSelector],
        navTrigger: ['a[href="/app/library"]'],
      },
      timings: [
        { metric: 'warm-shell-response', budget: 100 },
        { metric: 'skeleton-to-content', budget: 1000 },
      ],
    } as PerfRouteDefinition;

    const result = await measureWarmNavigationRoute(
      fixture.page,
      route,
      'http://127.0.0.1:4100',
      'http://127.0.0.1:4100/app/library'
    );

    expect(result).toEqual({
      warmShellResponse: 12,
      skeletonToContent: 64,
    });
    expect(fixture.events.indexOf('goto')).toBeLessThan(
      fixture.events.indexOf('click')
    );
    expect(fixture.events.indexOf('elapsed:12')).toBeLessThan(
      fixture.events.indexOf(`visible:${fixture.contentSelector}`)
    );
  });

  it('executes a same-route profile-rail interaction through deterministic markers', async () => {
    const triggerSelector = '[data-testid="artist-profile-rail-toggle"]';
    const responseSelector = `${triggerSelector}[aria-pressed="true"]`;
    const fixture = createInteractivePage({
      contentSelector: '[data-testid="profile-contact-sidebar"]',
      finalUrl: 'http://127.0.0.1:4100/app',
      triggerSelector,
    });
    const route = {
      id: 'same-route-fixture',
      path: '/app',
      interactionStartPath: '/app',
      measureMode: 'same-route-interaction',
      readySelectors: {
        shell: [responseSelector],
        content: [fixture.contentSelector],
        navTrigger: [triggerSelector],
      },
      timings: [
        { metric: 'warm-shell-response', budget: 100 },
        { metric: 'skeleton-to-content', budget: 1000 },
      ],
    } as PerfRouteDefinition;

    const result = await measureSameRouteInteraction(
      fixture.page,
      route,
      'http://127.0.0.1:4100'
    );

    expect(result).toEqual({
      warmShellResponse: 12,
      skeletonToContent: 64,
    });
    expect(fixture.events).toContain(`visible:${responseSelector}`);
    expect(fixture.events.indexOf(`visible:${responseSelector}`)).toBeLessThan(
      fixture.events.indexOf('elapsed:12')
    );
    expect(fixture.events.indexOf('elapsed:12')).toBeLessThan(
      fixture.events.indexOf(`visible:${fixture.contentSelector}`)
    );
  });
});
