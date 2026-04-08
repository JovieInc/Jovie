import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SURFACE_IDS,
  CANONICAL_SURFACES,
  getCanonicalSurface,
} from './canonical-surfaces';
import { SCREENSHOT_SCENARIO_IDS } from './screenshots/registry';

describe('canonical surface registry', () => {
  it('exposes exactly the four canonical surface ids in order', () => {
    expect(CANONICAL_SURFACE_IDS).toEqual([
      'homepage',
      'public-profile',
      'release-landing',
      'dashboard-releases',
    ]);

    expect(CANONICAL_SURFACES.map(surface => surface.id)).toEqual(
      CANONICAL_SURFACE_IDS
    );
  });

  it('only references screenshot ids that exist in the screenshot registry', () => {
    for (const surface of CANONICAL_SURFACES) {
      for (const screenshotId of surface.screenshotIds) {
        expect(SCREENSHOT_SCENARIO_IDS.has(screenshotId)).toBe(true);
      }
    }
  });

  it('pins the current review routes', () => {
    expect(getCanonicalSurface('homepage').reviewRoute).toBe('/');
    expect(getCanonicalSurface('public-profile').reviewRoute).toBe(
      '/demo/showcase/public-profile'
    );
    expect(getCanonicalSurface('release-landing').reviewRoute).toBe(
      '/demo/showcase/release-landing'
    );
    expect(getCanonicalSurface('dashboard-releases').reviewRoute).toBe('/demo');
  });

  it('explicitly excludes redirect-only routes from canonical live surfaces', () => {
    const liveRoutes = CANONICAL_SURFACES.flatMap(
      surface => surface.liveRoutes
    );

    expect(liveRoutes).not.toContain('/ai');
    expect(liveRoutes).not.toContain('/investors');
  });

  it('pins the dashboard releases screenshot contract', () => {
    expect(getCanonicalSurface('dashboard-releases').screenshotIds).toEqual([
      'dashboard-releases-desktop',
      'dashboard-releases-sidebar-desktop',
      'dashboard-release-sidebar-detail-desktop',
    ]);
  });
});
