import { describe, expect, it } from 'vitest';
import { PROFILE_MODE_ALIAS_MARKER } from '@/lib/render-fixture-policy';
import { END_USER_PERF_ROUTE_MANIFEST } from '../../scripts/performance-route-manifest';
import { aliasBudgetProfileModeParams } from './alias-budget-static-params';

describe('alias budget profile mode prerender', () => {
  it('prerenders every hosted alias destination the production gate measures', () => {
    const params = aliasBudgetProfileModeParams();
    const hosted = END_USER_PERF_ROUTE_MANIFEST.filter(
      route => route.aliasUsableResult
    );

    expect(hosted.map(route => route.id)).toEqual([
      'public-profile-listen',
      'public-profile-music',
      'public-profile-subscribe',
      'public-profile-tip',
      'public-profile-tour',
      'public-profile-releases',
    ]);

    for (const route of hosted) {
      const canonical = route.aliasUsableResult?.canonicalPath;
      if (!canonical || !route.seedProfile) {
        throw new Error(`${route.id} is missing its alias destination`);
      }
      const mode = new URL(
        `https://jov.ie${canonical.replace('[username]', route.seedProfile)}`
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
