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
});
