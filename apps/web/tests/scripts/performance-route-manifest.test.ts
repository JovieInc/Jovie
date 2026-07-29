import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../../constants/routes';
import {
  getEndUserPerfRouteById,
  getPrimaryTimingMetricName,
  getRouteResourceBudgets,
  getRouteTimingBudgets,
  type PerfMeasureMode,
  type PerfRouteDefinition,
  type PerfWarmupStrategy,
} from '../../scripts/performance-route-manifest';

interface CreatorShellRouteExpectation {
  readonly id: string;
  readonly path: string;
  readonly measureMode: PerfMeasureMode;
  readonly warmupStrategy: PerfWarmupStrategy;
  readonly primaryMetric: string;
  readonly navTrigger?: string;
  readonly resolvesDynamicPath?: boolean;
}

const CREATOR_SHELL_SLICE_ROUTES = [
  {
    id: 'creator-chat',
    path: APP_ROUTES.CHAT,
    measureMode: 'page-load',
    warmupStrategy: 'authenticated-route',
    primaryMetric: 'skeleton-to-content',
  },
  {
    id: 'creator-chat-thread',
    path: '/app/chat/[id]',
    measureMode: 'page-load',
    warmupStrategy: 'authenticated-route',
    primaryMetric: 'skeleton-to-content',
    resolvesDynamicPath: true,
  },
  {
    id: 'creator-inbox-nav',
    path: APP_ROUTES.DASHBOARD,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.DASHBOARD}"]`,
  },
  {
    id: 'creator-chat-nav',
    path: APP_ROUTES.CHAT,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.CHAT}"]`,
  },
  {
    id: 'creator-library',
    path: APP_ROUTES.LIBRARY,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.LIBRARY}"]`,
  },
  {
    id: 'creator-contacts',
    path: APP_ROUTES.CONTACTS,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.CONTACTS}"]`,
  },
  {
    id: 'creator-calendar',
    path: APP_ROUTES.CALENDAR,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.CALENDAR}"]`,
  },
  {
    id: 'creator-tasks',
    path: APP_ROUTES.TASKS,
    measureMode: 'warm-navigation',
    warmupStrategy: 'authenticated-shell',
    primaryMetric: 'warm-shell-response',
    navTrigger: `a[href="${APP_ROUTES.TASKS}"]`,
  },
  {
    id: 'creator-audience',
    path: APP_ROUTES.AUDIENCE,
    measureMode: 'page-load',
    warmupStrategy: 'authenticated-route',
    primaryMetric: 'skeleton-to-content',
  },
  {
    id: 'creator-lyrics',
    path: `${APP_ROUTES.LYRICS}/[trackId]`,
    measureMode: 'page-load',
    warmupStrategy: 'authenticated-route',
    primaryMetric: 'first-contentful-paint',
    resolvesDynamicPath: true,
  },
] as const satisfies readonly CreatorShellRouteExpectation[];

const RELEASE_BUDGET_CREATOR_SHELL_ROUTE_IDS = [
  'creator-releases',
  'creator-library-cold',
  'creator-library',
  'creator-tasks-cold',
  'creator-tasks',
  'creator-lyrics',
] as const;

const CANONICAL_SHELL_PERF_PAIRS = [
  {
    itemId: 'chat',
    coldRouteId: 'creator-chat',
    warmRouteId: 'creator-chat-nav',
  },
  {
    itemId: 'inbox',
    coldRouteId: 'creator-app-home',
    warmRouteId: 'creator-inbox-nav',
  },
  {
    itemId: 'library',
    coldRouteId: 'creator-library-cold',
    warmRouteId: 'creator-library',
  },
  {
    itemId: 'contacts',
    coldRouteId: 'creator-contacts-cold',
    warmRouteId: 'creator-contacts',
  },
  {
    itemId: 'calendar',
    coldRouteId: 'creator-calendar-cold',
    warmRouteId: 'creator-calendar',
  },
  {
    itemId: 'tasks',
    coldRouteId: 'creator-tasks-cold',
    warmRouteId: 'creator-tasks',
  },
] as const;

function requireRoute(id: string) {
  const route = getEndUserPerfRouteById(id);
  expect(route, `${id} should exist in the performance manifest`).toBeDefined();
  return route as PerfRouteDefinition;
}

function expectBudgetCoverage(route: PerfRouteDefinition) {
  expect(getRouteTimingBudgets(route).length).toBeGreaterThan(0);
  expect(
    getRouteResourceBudgets(route).map(entry => entry.resourceType)
  ).toEqual(expect.arrayContaining(['script', 'total']));
}

describe('performance route manifest shell slice coverage', () => {
  it.each(
    CREATOR_SHELL_SLICE_ROUTES
  )('defines $id with route, readiness, and budget coverage', expectation => {
    const route = requireRoute(expectation.id);

    expect(route.group).toBe('creator-shell');
    expect(route.surface).toBe('creator-app');
    expect(route.path).toBe(expectation.path);
    expect(route.requiresAuth).toBe(true);
    expect(route.seedProfile).toBe('active-user');
    expect(route.measureMode).toBe(expectation.measureMode);
    expect(route.warmupStrategy).toBe(expectation.warmupStrategy);
    expect(route.readySelectors.content?.length ?? 0).toBeGreaterThan(0);
    expect(getPrimaryTimingMetricName(route)).toBe(expectation.primaryMetric);
    expectBudgetCoverage(route);

    if ('navTrigger' in expectation) {
      expect(route.readySelectors.navTrigger).toContain(expectation.navTrigger);
    }

    if ('resolvesDynamicPath' in expectation) {
      expect(route.resolvePath).toEqual(expect.any(Function));
    }
  });

  it('keeps Slice 0 shell routes on the same resource budgets as releases', () => {
    const releases = requireRoute('creator-releases');
    const releaseResourceBudgets = getRouteResourceBudgets(releases);

    for (const routeId of RELEASE_BUDGET_CREATOR_SHELL_ROUTE_IDS) {
      const route = requireRoute(routeId);
      expect(getRouteResourceBudgets(route)).toEqual(releaseResourceBudgets);
    }
  });

  it.each(
    CANONICAL_SHELL_PERF_PAIRS
  )('measures $itemId with both cold-load and warm-navigation routes', expectation => {
    const coldRoute = requireRoute(expectation.coldRouteId);
    const warmRoute = requireRoute(expectation.warmRouteId);

    expect(coldRoute.path).toBe(warmRoute.path);
    expect(coldRoute.measureMode).toBe('page-load');
    expect(coldRoute.warmupStrategy).toBe('authenticated-route');
    expect(warmRoute.measureMode).toBe('warm-navigation');
    expect(warmRoute.warmupStrategy).toBe('authenticated-shell');
    expect(warmRoute.navigationItemId).toBe(expectation.itemId);
    expectBudgetCoverage(coldRoute);
    expectBudgetCoverage(warmRoute);
  });

  it('uses real profile-rail content rather than its skeleton as readiness', () => {
    const profileRail = requireRoute('creator-profile-rail');

    expect(profileRail.readySelectors.content).toEqual([
      '[data-testid="profile-contact-sidebar"]',
    ]);
    expect(profileRail.readySelectors.content).not.toContain(
      '[data-testid="profile-contact-sidebar-skeleton"]'
    );
  });
});
