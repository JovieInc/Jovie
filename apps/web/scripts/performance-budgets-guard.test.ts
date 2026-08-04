import type { Browser, BrowserContext, Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  applyAliasPhaseTimings,
  applyProfileWarmTransitionTimings,
  assertAliasPhaseTiming,
  buildConfirmedPageResult,
  confirmTimingViolations,
  createAliasPhaseProbeScript,
  createContextOptions,
  evaluateTimingConfirmation,
  loadGuardManifestRoutes,
  loadPerformanceProtectedOriginCookies,
  measureSameRouteInteraction,
  measureWarmNavigationRoute,
  parseGuardCliArgs,
  resolveWarmNavigationStartPath,
  runPerformanceBudgetsGuard,
  selectGuardRoutes,
  waitForWarmDestinationReady,
} from './performance-budgets-guard';
import type {
  PerfResourceMetricName,
  PerfRouteDefinition,
  PerfTimingMetricName,
} from './performance-route-manifest';

const PROTECTED_DEPLOYMENT_URL = 'https://jovie-build123-jovie.vercel.app';

function createProtectedOriginBrowserFixture(
  cookies: readonly {
    readonly domain: string;
    readonly httpOnly: boolean;
    readonly name: string;
    readonly path: string;
    readonly sameSite: 'Lax';
    readonly secure: boolean;
    readonly value: string;
  }[]
) {
  const context = {
    addCookies: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    cookies: vi.fn().mockResolvedValue(cookies),
  } as unknown as BrowserContext;
  const newContext = vi.fn().mockResolvedValue(context);
  const browser = { newContext } as unknown as Browser;
  return { browser, context, newContext };
}

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

function markElementVisible(element: Element) {
  vi.spyOn(element, 'getClientRects').mockReturnValue([
    { height: 1, width: 1 },
  ] as unknown as DOMRectList);
}

describe('browser-observed alias readiness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    delete (
      window as Window & {
        __perfAliasPhaseProbe?: unknown;
      }
    ).__perfAliasPhaseProbe;
  });

  it('records immediately visible phases in destination order', () => {
    const shell = document.createElement('div');
    shell.id = 'alias-shell';
    const content = document.createElement('div');
    content.id = 'alias-content';
    const destination = document.createElement('button');
    destination.id = 'alias-destination';
    for (const element of [shell, content, destination]) {
      markElementVisible(element);
      document.body.append(element);
    }

    const probeScript = createAliasPhaseProbeScript({
      contentSelectors: ['#alias-content'],
      destinationSelectors: ['#alias-destination'],
      expectedPaths: [`${window.location.pathname}${window.location.search}`],
      sampleKey: 'immediate-sample',
      shellSelectors: ['#alias-shell'],
    });
    new Function(probeScript)();

    const state = (
      window as Window & {
        __perfAliasPhaseProbe?: unknown;
      }
    ).__perfAliasPhaseProbe;
    const phases = assertAliasPhaseTiming(
      state,
      'immediate-sample',
      performance.now() + 1_000
    );

    expect(phases.redirectCompleteMs).toBeLessThanOrEqual(
      phases.shellVisibleMs
    );
    expect(phases.shellVisibleMs).toBeLessThanOrEqual(
      phases.interactiveReadyMs
    );
    expect(phases.interactiveReadyMs).toBeLessThanOrEqual(
      phases.destinationAffordanceMs
    );
  });

  it('uses the browser navigation clock instead of a controller epoch', () => {
    const shell = document.createElement('div');
    shell.id = 'alias-shell';
    const content = document.createElement('div');
    content.id = 'alias-content';
    const destination = document.createElement('button');
    destination.id = 'alias-destination';
    for (const element of [shell, content, destination]) {
      markElementVisible(element);
      document.body.append(element);
    }
    vi.spyOn(performance, 'now').mockReturnValue(137);

    const probeScript = createAliasPhaseProbeScript({
      contentSelectors: ['#alias-content'],
      destinationSelectors: ['#alias-destination'],
      expectedPaths: [`${window.location.pathname}${window.location.search}`],
      sampleKey: 'browser-clock-sample',
      shellSelectors: ['#alias-shell'],
    });
    new Function(probeScript)();

    const state = (
      window as Window & {
        __perfAliasPhaseProbe?: unknown;
      }
    ).__perfAliasPhaseProbe;
    const phases = assertAliasPhaseTiming(state, 'browser-clock-sample', 5_000);

    expect(phases).toEqual({
      destinationAffordanceMs: 137,
      interactiveReadyMs: 137,
      redirectCompleteMs: 137,
      shellVisibleMs: 137,
    });
    expect(probeScript).not.toContain('Date.now');
    expect(probeScript).not.toContain('timeOrigin');
  });

  it('records a destination that becomes visible after installation', async () => {
    const shell = document.createElement('div');
    shell.id = 'alias-shell';
    const content = document.createElement('div');
    content.id = 'alias-content';
    const destination = document.createElement('button');
    destination.id = 'alias-destination';
    destination.style.display = 'none';
    for (const element of [shell, content, destination]) {
      markElementVisible(element);
      document.body.append(element);
    }

    const probeScript = createAliasPhaseProbeScript({
      contentSelectors: ['#alias-content'],
      destinationSelectors: ['#alias-destination'],
      expectedPaths: [`${window.location.pathname}${window.location.search}`],
      sampleKey: 'mutation-sample',
      shellSelectors: ['#alias-shell'],
    });
    new Function(probeScript)();

    destination.style.display = 'block';
    destination.dataset.ready = 'true';

    await vi.waitFor(() => {
      const state = (
        window as Window & {
          __perfAliasPhaseProbe?: {
            destinationAffordanceMs?: number;
          };
        }
      ).__perfAliasPhaseProbe;
      expect(state?.destinationAffordanceMs).toEqual(expect.any(Number));
    });
  });

  it.each([
    {
      label: 'missing',
      state: {
        redirectCompleteMs: 10,
        sampleKey: 'phase-sample',
        shellVisibleMs: 20,
      },
    },
    {
      label: 'stale',
      state: {
        destinationAffordanceMs: 40,
        interactiveReadyMs: 30,
        redirectCompleteMs: 10,
        sampleKey: 'old-sample',
        shellVisibleMs: 20,
      },
    },
    {
      label: 'non-monotonic',
      state: {
        destinationAffordanceMs: 40,
        interactiveReadyMs: 15,
        redirectCompleteMs: 10,
        sampleKey: 'phase-sample',
        shellVisibleMs: 20,
      },
    },
  ])('fails closed on $label phase evidence', ({ state }) => {
    expect(() => assertAliasPhaseTiming(state, 'phase-sample', 500)).toThrow(
      /probe|phase/i
    );
  });

  it('keeps controller delay diagnostic without charging it to the user metric', () => {
    const phases = assertAliasPhaseTiming(
      {
        destinationAffordanceMs: 580,
        interactiveReadyMs: 540,
        redirectCompleteMs: 120,
        sampleKey: 'phase-sample',
        shellVisibleMs: 300,
      },
      'phase-sample',
      1600
    );

    const timings = createConfirmationSample(
      'usable-alias-result',
      0
    ).timingValues;
    applyAliasPhaseTimings(timings, phases);

    expect(timings['redirect-complete']).toBe(120);
    expect(timings['interactive-shell-ready']).toBe(540);
    expect(timings['usable-alias-result']).toBe(580);
  });

  it('rejects browser phases that exceed controller observation', () => {
    expect(() =>
      assertAliasPhaseTiming(
        {
          destinationAffordanceMs: 701,
          interactiveReadyMs: 600,
          redirectCompleteMs: 100,
          sampleKey: 'phase-sample',
          shellVisibleMs: 300,
        },
        'phase-sample',
        500
      )
    ).toThrow(/diverged/);
  });
});

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
    addInitScript: vi.fn().mockResolvedValue(undefined),
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

  it.each([
    'https://jov.ie',
    'http://127.0.0.1:3000',
    'https://foreign-project-foreign-team.vercel.app',
  ])('keeps non-protected measurement target %s free of origin state', async baseUrl => {
    const fixture = createProtectedOriginBrowserFixture([]);
    const bootstrapOrigin = vi.fn();

    await expect(
      loadPerformanceProtectedOriginCookies(fixture.browser, baseUrl, {
        bootstrapOrigin,
      })
    ).resolves.toEqual([]);

    expect(fixture.newContext).not.toHaveBeenCalled();
    expect(bootstrapOrigin).not.toHaveBeenCalled();
  });

  it('verifies staged access once and returns only exact-host infrastructure cookies', async () => {
    const cookie = {
      domain: 'jovie-build123-jovie.vercel.app',
      httpOnly: true,
      name: '__vercel_live_token',
      path: '/',
      sameSite: 'Lax' as const,
      secure: true,
      value: 'opaque-origin-cookie',
    };
    const fixture = createProtectedOriginBrowserFixture([cookie]);
    const originBoundCookie = {
      httpOnly: true,
      name: cookie.name,
      secure: true,
      url: PROTECTED_DEPLOYMENT_URL,
      value: cookie.value,
    };
    const bootstrapOrigin = vi.fn().mockResolvedValue([originBoundCookie]);

    await expect(
      loadPerformanceProtectedOriginCookies(
        fixture.browser,
        PROTECTED_DEPLOYMENT_URL,
        { bootstrapOrigin }
      )
    ).resolves.toEqual([cookie]);

    expect(fixture.newContext).toHaveBeenCalledWith({
      storageState: { cookies: [], origins: [] },
    });
    expect(bootstrapOrigin).toHaveBeenCalledWith(PROTECTED_DEPLOYMENT_URL);
    expect(fixture.context.addCookies).toHaveBeenCalledWith([
      originBoundCookie,
    ]);
    expect(fixture.context.cookies).toHaveBeenCalledWith(
      PROTECTED_DEPLOYMENT_URL
    );
    expect(fixture.context.close).toHaveBeenCalledOnce();
  });

  it('fails closed and disposes the bootstrap context on unsafe cookie scope', async () => {
    const fixture = createProtectedOriginBrowserFixture([
      {
        domain: '.jovie-build123-jovie.vercel.app',
        httpOnly: true,
        name: '__vercel_live_token',
        path: '/',
        sameSite: 'Lax',
        secure: true,
        value: 'unsafe-domain-cookie',
      },
    ]);

    await expect(
      loadPerformanceProtectedOriginCookies(
        fixture.browser,
        PROTECTED_DEPLOYMENT_URL,
        {
          bootstrapOrigin: vi.fn().mockResolvedValue([
            {
              httpOnly: true,
              name: '__vercel_live_token',
              secure: true,
              url: PROTECTED_DEPLOYMENT_URL,
              value: 'unsafe-domain-cookie',
            },
          ]),
        }
      )
    ).rejects.toThrow('escaped the exact deployment host');

    expect(fixture.context.close).toHaveBeenCalledOnce();
  });

  it('does not create a browser context when immutable-build verification fails', async () => {
    const fixture = createProtectedOriginBrowserFixture([]);

    await expect(
      loadPerformanceProtectedOriginCookies(
        fixture.browser,
        PROTECTED_DEPLOYMENT_URL,
        {
          bootstrapOrigin: vi
            .fn()
            .mockRejectedValue(new Error('wrong commit identity')),
        }
      )
    ).rejects.toThrow('wrong commit identity');

    expect(fixture.newContext).not.toHaveBeenCalled();
  });

  it('keeps public staged routes app-unauthenticated while attaching exact-host access', () => {
    const route = {
      requiresAuth: false,
      viewport: { height: 844, width: 390 },
    } as PerfRouteDefinition;
    const authCookie = {
      domain: 'jovie-build123-jovie.vercel.app',
      name: 'better-auth.session_token',
      path: '/',
      secure: true,
      value: 'app-session',
    };
    const protectedOriginCookie = {
      domain: 'jovie-build123-jovie.vercel.app',
      name: '__vercel_live_token',
      path: '/',
      secure: true,
      value: 'origin-access',
    };

    expect(
      createContextOptions(route, [authCookie], [protectedOriginCookie])
    ).toEqual({
      storageState: {
        cookies: [protectedOriginCookie],
        origins: [],
      },
      viewport: route.viewport,
    });
  });

  it('merges verified origin access into authenticated contexts without stale duplicates', () => {
    const route = {
      requiresAuth: true,
      viewport: { height: 844, width: 390 },
    } as PerfRouteDefinition;
    const authCookie = {
      domain: 'jovie-build123-jovie.vercel.app',
      name: 'better-auth.session_token',
      path: '/',
      secure: true,
      value: 'app-session',
    };
    const staleProtectedOriginCookie = {
      domain: 'jovie-20iadpkq2-jovie.vercel.app',
      name: '__vercel_live_token',
      path: '/',
      secure: true,
      value: 'stale-origin-access',
    };
    const protectedOriginCookie = {
      ...staleProtectedOriginCookie,
      value: 'verified-origin-access',
    };

    const options = createContextOptions(
      route,
      [authCookie, staleProtectedOriginCookie],
      [protectedOriginCookie]
    );

    expect(options.storageState?.cookies).toEqual([
      authCookie,
      protectedOriginCookie,
    ]);
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

  it('resolves dynamic profile starts and clicks the visible mobile tab', async () => {
    const triggerSelector =
      '[data-testid="profile-bottom-nav"] button[aria-label="Music"]';
    const fixture = createInteractivePage({
      contentSelector: '[data-testid="profile-primary-tab-listen"]',
      finalUrl: 'http://127.0.0.1:4100/dualipa?mode=listen',
      triggerSelector,
    });
    const route = {
      id: 'public-profile-mode-listen',
      path: '/[username]?mode=listen',
      warmNavigationStartPath: '/[username]',
      measureMode: 'profile-warm-transition',
      readySelectors: {
        content: [fixture.contentSelector],
        navTrigger: [triggerSelector],
      },
      timings: [
        { metric: 'interactive-shell-ready', budget: 100 },
        { metric: 'warm-shell-response', budget: 100 },
      ],
    } as PerfRouteDefinition;

    expect(resolveWarmNavigationStartPath(route, '/dualipa?mode=listen')).toBe(
      '/dualipa'
    );

    const result = await measureWarmNavigationRoute(
      fixture.page,
      route,
      'http://127.0.0.1:4100',
      'http://127.0.0.1:4100/dualipa?mode=listen'
    );

    expect(result).toEqual({
      warmShellResponse: 12,
      skeletonToContent: 64,
    });
    expect(fixture.page.addInitScript).toHaveBeenCalledOnce();
    expect(fixture.page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/dualipa',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
    expect(fixture.events).toContain('click');
  });

  it('maps warm profile readiness without replacing cold-load metrics', () => {
    const timingValues = {
      'cumulative-layout-shift': 0,
      'first-contentful-paint': 96,
      'first-input-delay': 1,
      'interactive-shell-ready': 0,
      'largest-contentful-paint': 96,
      'redirect-complete': 0,
      'skeleton-to-content': 0,
      'time-to-first-byte': 7,
      'warm-shell-response': 0,
    } satisfies Record<PerfTimingMetricName, number>;

    applyProfileWarmTransitionTimings(timingValues, {
      warmShellResponse: 12,
      skeletonToContent: 64,
    });

    expect(timingValues).toMatchObject({
      'first-contentful-paint': 96,
      'interactive-shell-ready': 64,
      'largest-contentful-paint': 96,
      'time-to-first-byte': 7,
      'warm-shell-response': 12,
    });
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
