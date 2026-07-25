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

import {
  loadGuardManifestRoutes,
  measureSameRouteInteraction,
  measureWarmNavigationRoute,
  parseGuardCliArgs,
  runPerformanceBudgetsGuard,
  selectGuardRoutes,
  waitForWarmDestinationReady,
} from './performance-budgets-guard';
import type { PerfRouteDefinition } from './performance-route-manifest';

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
