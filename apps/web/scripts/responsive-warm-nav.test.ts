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
  it('keeps the OqZTF desktop rail as Library, Contacts, and Presence', () => {
    expect(canonicalSidebarNavigation.map(item => item.id)).toEqual([
      'library',
      'contacts',
      'profiles',
    ]);
    expect(canonicalSidebarNavigation.map(item => item.href)).not.toContain(
      APP_ROUTES.CALENDAR
    );
  });

  it.each([
    ['Calendar', APP_ROUTES.CALENDAR],
    ['Tasks', APP_ROUTES.TASKS],
  ])('keeps %s in the mobile More menu, not on the desktop rail', (_, href) => {
    expect(mobileMoreHrefs).toContain(href);
    expect(desktopVisibleHrefs).not.toContain(href);
  });

  it('measures desktop-visible Library via the real rail link', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.LIBRARY,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });

    expect(measurement.reason).toBe('desktop-visible-link');
    expect(measurement.measureMode).toBe('warm-navigation');
    expect(measurement.warmupStrategy).toBe('authenticated-shell');
    expect(measurement.navTrigger).toEqual(hrefNavTriggers(APP_ROUTES.LIBRARY));
  });

  it('measures Calendar as a documented route-load because More is not desktop-visible', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.CALENDAR,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });

    expect(measurement.reason).toBe('mobile-more-route-load');
    expect(measurement.measureMode).toBe('page-load');
    expect(measurement.warmupStrategy).toBe('authenticated-route');
    expect(measurement.navTrigger).toBeUndefined();
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

  it('keeps the shipped creator-calendar route on the Calendar measurement contract', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.CALENDAR,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });
    const route = getEndUserPerfRouteById(
      'creator-calendar'
    ) as PerfRouteDefinition;

    expect(route.path).toBe(APP_ROUTES.CALENDAR);
    expect(route.measureMode).toBe(measurement.measureMode);
    expect(route.warmupStrategy).toBe(measurement.warmupStrategy);
    expect(route.readySelectors.navTrigger).toBeUndefined();
    expect(route.warmNavigationStartPath).toBeUndefined();
  });

  it('keeps the shipped creator-tasks-warm route on the Tasks measurement contract', () => {
    const measurement = resolveResponsiveWarmNavMeasurement({
      destinationHref: APP_ROUTES.TASKS,
      desktopVisibleHrefs,
      mobileMoreHrefs,
    });
    const route = getEndUserPerfRouteById(
      'creator-tasks-warm'
    ) as PerfRouteDefinition;

    expect(route.path).toBe(APP_ROUTES.TASKS);
    expect(route.measureMode).toBe(measurement.measureMode);
    expect(route.warmupStrategy).toBe(measurement.warmupStrategy);
    expect(route.readySelectors.navTrigger).toBeUndefined();
    expect(route.warmNavigationStartPath).toBeUndefined();
  });
});
