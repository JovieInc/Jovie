import { describe, expect, it } from 'vitest';
import {
  END_USER_PERF_GROUP_ORDER,
  getEndUserPerfRouteManifest,
  getPrimaryTimingMetricName,
  getRouteResourceBudgets,
  getRouteTimingBudgets,
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
});
