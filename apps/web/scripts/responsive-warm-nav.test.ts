import { describe, expect, it } from 'vitest';
import {
  canonicalSidebarNavigation,
  chatNavItem,
  inboxNavItem,
  mobileExpandedNavigation,
} from '../components/features/dashboard/dashboard-nav/config';
import { APP_ROUTES } from '../constants/routes';
import {
  getEndUserPerfRouteById,
  type PerfRouteDefinition,
} from './performance-route-manifest';
import {
  hrefNavTriggers,
  resolveResponsiveWarmNavMeasurement,
} from './responsive-warm-nav';

const desktopVisibleHrefs = [
  inboxNavItem.href,
  chatNavItem.href,
  ...canonicalSidebarNavigation.map(item => item.href),
];

const mobileMoreHrefs = mobileExpandedNavigation.map(item => item.href);

describe('resolveResponsiveWarmNavMeasurement', () => {
  it('keeps the desktop root rail job-based and ordered', () => {
    expect(canonicalSidebarNavigation.map(item => item.id)).toEqual([
      'home',
      'presence',
      'library',
      'audience',
    ]);
    expect(canonicalSidebarNavigation.map(item => item.href)).toEqual([
      APP_ROUTES.DASHBOARD,
      APP_ROUTES.PRESENCE,
      APP_ROUTES.LIBRARY,
      APP_ROUTES.CONTACTS_AUDIENCE,
    ]);
  });

  it('measures desktop-visible Presence via the real rail link', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.PRESENCE,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });

    expect(measurement.reason).toBe('desktop-visible-link');
    expect(measurement.measureMode).toBe('warm-navigation');
    expect(measurement.warmupStrategy).toBe('authenticated-shell');
    expect(measurement.navTrigger).toEqual(
      hrefNavTriggers(APP_ROUTES.PRESENCE)
    );
  });

  it('keeps Audience desktop-visible even when mobile places it in More', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.CONTACTS_AUDIENCE,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });

    expect(mobileMoreHrefs).toContain(APP_ROUTES.CONTACTS_AUDIENCE);
    expect(measurement.reason).toBe('desktop-visible-link');
    expect(measurement.measureMode).toBe('warm-navigation');
  });

  it('rejects destinations that are on neither the desktop rail nor mobile More', () => {
    expect(() =>
      resolveResponsiveWarmNavMeasurement({
        destinationHref: '/app/does-not-exist',
        desktopVisibleHrefs,
        mobileMoreHrefs,
      })
    ).toThrow(/does-not-exist/);
  });

  it('keeps Calendar reachable under its non-root route-load contract', () => {
    const route = getEndUserPerfRouteById(
      'creator-calendar'
    ) as PerfRouteDefinition;

    expect(route.path).toBe(APP_ROUTES.CALENDAR);
    expect(route.measureMode).toBe('page-load');
    expect(route.warmupStrategy).toBe('authenticated-route');
    expect(route.readySelectors.navTrigger).toBeUndefined();
    expect(route.warmNavigationStartPath).toBeUndefined();
  });

  it('keeps Tasks reachable under its non-root route-load contract', () => {
    const route = getEndUserPerfRouteById(
      'creator-tasks-warm'
    ) as PerfRouteDefinition;

    expect(route.path).toBe(APP_ROUTES.TASKS);
    expect(route.measureMode).toBe('page-load');
    expect(route.warmupStrategy).toBe('authenticated-route');
    expect(route.readySelectors.navTrigger).toBeUndefined();
    expect(route.warmNavigationStartPath).toBeUndefined();
  });

  it('keeps Links reachable under its non-root route-load contract', () => {
    const route = getEndUserPerfRouteById(
      'creator-links'
    ) as PerfRouteDefinition;

    expect(route.path).toBe(APP_ROUTES.CHAT_PROFILE_PANEL);
    expect(route.measureMode).toBe('page-load');
    expect(route.warmupStrategy).toBe('authenticated-route');
    expect(route.readySelectors.navTrigger).toBeUndefined();
    expect(route.warmNavigationStartPath).toBeUndefined();
  });
});
