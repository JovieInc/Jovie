import { describe, expect, it } from 'vitest';
import { primaryNavigation } from '../components/features/dashboard/dashboard-nav/config';
import { APP_ROUTES } from '../constants/routes';
import {
  assertResolvedPerfRoutePath,
  assertValidPerfRouteDefinition,
  assertValidPerfRouteManifest,
  END_USER_PERF_GROUP_ORDER,
  getEndUserPerfRouteManifest,
  getPrimaryTimingMetricName,
  getRouteResourceBudgets,
  getRouteTimingBudgets,
  type PerfRouteDefinition,
  selectPerfRoutes,
} from './performance-route-manifest';

describe('performance route manifest', () => {
  it('exports normalized route budgets for every end-user route', () => {
    const routes = getEndUserPerfRouteManifest();

    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes) {
      expect(getRouteTimingBudgets(route).length).toBeGreaterThan(0);
      expect(getRouteResourceBudgets(route).length).toBeGreaterThan(0);
      expect(getPrimaryTimingMetricName(route)).toBeTruthy();
    }
  });

  it('keeps the deterministic group execution order from the approved workflow', () => {
    expect(END_USER_PERF_GROUP_ORDER).toEqual([
      'home',
      'marketing-public',
      'legal-public',
      'public-profile-core',
      'public-profile-mode-shell',
      'public-profile-detail',
      'creator-shell',
      'creator-alias',
      'account-billing',
      'onboarding',
      'auth',
    ]);
  });

  it('selects routes by group in deterministic order', () => {
    const selected = selectPerfRoutes({
      groupIds: ['home', 'public-profile-mode-shell'],
    });

    expect(selected[0]?.id).toBe('home');
    expect(selected.every(route => route.group !== 'creator-shell')).toBe(true);
    expect(
      selected.some(route => route.id === 'public-profile-mode-listen')
    ).toBe(true);
  });

  it('selects explicit route ids without pulling in unrelated siblings', () => {
    const selected = selectPerfRoutes({
      routeIds: ['creator-releases', 'public-profile-main'],
    });

    expect(selected.map(route => route.id)).toEqual([
      'public-profile-main',
      'creator-releases',
    ]);
  });

  it('keeps the canonical six-item navigation in warm-measurement parity', () => {
    const routes = getEndUserPerfRouteManifest();
    const warmRoutesByNavigationItem = new Map(
      routes
        .filter(
          route =>
            route.measureMode === 'warm-navigation' &&
            route.navigationItemId &&
            route.navigationItemId !== 'profile'
        )
        .map(route => [route.navigationItemId, route])
    );

    expect([...warmRoutesByNavigationItem.keys()]).toEqual(
      primaryNavigation.map(item => item.id)
    );

    for (const item of primaryNavigation) {
      const route = warmRoutesByNavigationItem.get(item.id);
      expect(
        route,
        `canonical nav item "${item.id}" must have warm-navigation coverage`
      ).toBeDefined();
      expect(route?.path).toBe(item.href);
      expect(route?.warmupStrategy).toBe('authenticated-shell');
      expect(route?.warmNavigationStartPath).not.toBe(item.href);
      expect(route?.readySelectors.navTrigger).toContain(
        `a[href="${item.href}"]`
      );
      expect(route?.readySelectors.navTrigger).toContain(
        `a[href^="${item.href}?"]`
      );
      expect(route?.readySelectors.content?.length ?? 0).toBeGreaterThan(0);
      expect(
        getRouteTimingBudgets(route!).some(
          timing => timing.metric === 'skeleton-to-content'
        )
      ).toBe(true);
      expect(
        routes.some(
          candidate =>
            candidate.path === item.href && candidate.measureMode === 'redirect'
        ),
        `canonical nav path "${item.href}" must not also be modeled as a redirect`
      ).toBe(false);
    }
  });

  it('uses Inbox readiness for /app and treats Releases as a Library redirect', () => {
    const routes = getEndUserPerfRouteManifest();
    const appHome = routes.find(route => route.id === 'creator-app-home');
    const releases = routes.find(route => route.id === 'creator-releases');
    const releaseTasks = routes.find(
      route => route.id === 'creator-release-tasks'
    );

    expect(appHome?.path).toBe(APP_ROUTES.DASHBOARD);
    expect(appHome?.readySelectors.content).toEqual([
      '[data-testid="opportunity-inbox-page"]',
    ]);
    expect(appHome?.readySelectors.content).not.toContain(
      '[data-testid="chat-content"]'
    );
    expect(releases?.path).toBe('/app/releases');
    expect(releases?.measureMode).toBe('redirect');
    expect(releases?.readySelectors.redirectDestinations).toEqual([
      '/app/library?view=releases',
    ]);
    expect(releaseTasks?.path).toBe('/app/releases/[releaseId]/tasks');
  });

  it('accepts both Profiles workspace rollout destinations for Presence', () => {
    const presence = getEndUserPerfRouteManifest().find(
      route => route.id === 'creator-presence'
    );

    expect(presence?.measureMode).toBe('redirect');
    expect(presence?.readySelectors.redirectDestinations).toEqual([
      APP_ROUTES.PROFILES,
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`,
    ]);
  });

  it('measures the canonical profile rail control without inventing a link route', () => {
    const profile = getEndUserPerfRouteManifest().find(
      route => route.navigationItemId === 'profile'
    );

    expect(profile?.path).toBe(APP_ROUTES.DASHBOARD);
    expect(profile?.interactionStartPath).toBe(APP_ROUTES.DASHBOARD);
    expect(profile?.measureMode).toBe('same-route-interaction');
    expect(profile?.readySelectors.navTrigger).toEqual([
      '[data-testid="artist-profile-rail-toggle"]',
    ]);
    expect(profile?.readySelectors.shell).toEqual([
      '[data-testid="artist-profile-rail-toggle"][aria-pressed="true"]',
    ]);
    expect(profile?.readySelectors.content).toEqual([
      '[data-testid="profile-contact-sidebar"]',
    ]);
  });

  it('measures canonical chat onboarding at /start, not the legacy form shim', () => {
    const onboarding = getEndUserPerfRouteManifest().find(
      route => route.id === 'onboarding'
    );

    expect(onboarding?.path).toBe('/start');
    expect(onboarding?.requiresAuth).toBe(false);
    expect(onboarding?.readySelectors.content).toContain(
      '[data-testid="onboarding-chat"]'
    );
  });

  it('holds the brand page to the perceived-latency budget', () => {
    const brand = getEndUserPerfRouteManifest().find(
      route => route.id === 'marketing-brand'
    );

    expect(brand?.path).toBe('/brand');
    expect(brand?.requiresAuth).toBe(false);
    expect(brand?.measureMode).toBe('interactive-shell');
    expect(brand?.readySelectors.shell).toContain('main h1');
    expect(brand?.readySelectors.content).toContain('main h1');
    expect(getPrimaryTimingMetricName(brand!)).toBe('first-contentful-paint');
    expect(
      getRouteTimingBudgets(brand!).find(
        timing => timing.metric === 'first-contentful-paint'
      )?.budget
    ).toBe(100);
    expect(
      getRouteResourceBudgets(brand!).find(
        resource => resource.resourceType === 'font'
      )?.budget
    ).toBe(75);
  });

  it('rejects empty locators and redirect loops with route-specific errors', () => {
    const baseRoute = {
      id: 'fixture-route',
      group: 'creator-shell',
      surface: 'creator-app',
      path: '/app/fixture',
      requiresAuth: true,
      warmupStrategy: 'authenticated-route',
      measureMode: 'page-load',
      readySelectors: { content: ['main'] },
      timings: [{ metric: 'first-contentful-paint', budget: 100 }],
      resourceSizes: [{ resourceType: 'total', budget: 100 }],
      priority: 1,
    } as const satisfies PerfRouteDefinition;

    expect(() =>
      assertValidPerfRouteDefinition({
        ...baseRoute,
        readySelectors: { content: [''] },
      })
    ).toThrow('fixture-route" has an empty content selector at index 0');

    expect(() =>
      assertValidPerfRouteDefinition({
        ...baseRoute,
        measureMode: 'redirect',
        readySelectors: {
          content: ['main'],
          redirectDestinations: ['/app/fixture'],
        },
      })
    ).toThrow('fixture-route" loops back to its configured path');
  });

  it('rejects duplicate warm-navigation coverage before map construction', () => {
    const warmRoute = {
      id: 'fixture-warm-route',
      group: 'creator-shell',
      surface: 'creator-app',
      path: '/app/library',
      navigationItemId: 'library',
      warmNavigationStartPath: '/app',
      requiresAuth: true,
      warmupStrategy: 'authenticated-shell',
      measureMode: 'warm-navigation',
      readySelectors: {
        content: ['main'],
        navTrigger: ['a[href="/app/library"]'],
      },
      timings: [{ metric: 'warm-shell-response', budget: 100 }],
      resourceSizes: [{ resourceType: 'total', budget: 100 }],
      priority: 1,
    } as const satisfies PerfRouteDefinition;

    expect(() =>
      assertValidPerfRouteManifest([
        warmRoute,
        { ...warmRoute, id: 'duplicate-warm-route' },
      ])
    ).toThrow('duplicate warm-navigation item "library"');
  });

  it('requires dynamic fixtures to resolve every route token', () => {
    const dynamicRoute = {
      id: 'dynamic-fixture',
      group: 'creator-shell',
      surface: 'creator-app',
      path: '/app/chat/[id]',
      resolvePath: async () => '/app/chat/conversation-123',
      requiresAuth: true,
      warmupStrategy: 'authenticated-route',
      measureMode: 'page-load',
      readySelectors: { content: ['main'] },
      timings: [{ metric: 'first-contentful-paint', budget: 100 }],
      resourceSizes: [{ resourceType: 'total', budget: 100 }],
      priority: 1,
    } as const satisfies PerfRouteDefinition;

    expect(() => assertValidPerfRouteDefinition(dynamicRoute)).not.toThrow();
    expect(() =>
      assertResolvedPerfRoutePath(dynamicRoute, '/app/chat/conversation-123')
    ).not.toThrow();
    expect(() =>
      assertResolvedPerfRoutePath(dynamicRoute, '/app/chat/[id]')
    ).toThrow('dynamic-fixture" left dynamic tokens unresolved');
  });
});
