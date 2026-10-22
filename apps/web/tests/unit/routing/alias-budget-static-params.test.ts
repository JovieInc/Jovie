import { describe, expect, it } from 'vitest';
import { PROFILE_MODE_ALIAS_MARKER } from '@/lib/render-fixture-policy';
import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';
import { getEndUserPerfRouteById } from '../../../scripts/performance-route-manifest';

const HOSTED_ALIAS_ROUTE_IDS = [
  'public-profile-listen',
  'public-profile-music',
  'public-profile-subscribe',
  'public-profile-tip',
  'public-profile-tour',
  'public-profile-releases',
] as const;

describe('alias budget profile mode prerender', () => {
  it('prerenders every hosted alias destination the production gate measures', () => {
    const params = aliasBudgetProfileModeParams();

    for (const routeId of HOSTED_ALIAS_ROUTE_IDS) {
      const route = getEndUserPerfRouteById(routeId);
      if (!route || !('aliasUsableResult' in route) || !route.aliasUsableResult) {
        throw new Error(`${routeId} is missing its alias destination`);
      }
      if (!('seedProfile' in route) || !route.seedProfile) {
        throw new Error(`${routeId} is missing its seed profile`);
      }
      const mode = new URL(
        `https://jov.ie${route.aliasUsableResult.canonicalPath.replace(
          '[username]',
          route.seedProfile
        )}`
      ).searchParams.get('mode');
      expect(params).toContainEqual({
        username: route.seedProfile,
        profileMode: mode,
        marker: PROFILE_MODE_ALIAS_MARKER,
      });
    }

    expect(new Set(params.map(param => JSON.stringify(param))).size).toBe(
      params.length
    );
    expect(params).toHaveLength(5);
  });
});
