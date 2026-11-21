import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../constants/routes';
import { getEndUserPerfRouteById } from './performance-route-manifest';
import {
  buildSmoothRouteDefinition,
  buildSmoothRouteManifest,
  SMOOTH_DESKTOP_VIEWPORT,
  SMOOTH_MOBILE_VIEWPORT,
  SMOOTH_SURFACES,
  smoothBaselineFileName,
  smoothTargetsFor,
} from './performance-smooth-manifest';

describe('performance-smooth-manifest', () => {
  it('covers every Smooth surface with an existing end-user route', () => {
    expect(SMOOTH_SURFACES).toHaveLength(9);
    for (const surface of SMOOTH_SURFACES) {
      expect(getEndUserPerfRouteById(surface.routeId)?.id).toBe(
        surface.routeId
      );
    }
  });

  it('maps Settings to the account destination and Identity to Presence', () => {
    expect(
      SMOOTH_SURFACES.find(surface => surface.id === 'settings')?.routeId
    ).toBe('creator-settings');
    expect(getEndUserPerfRouteById('creator-settings')?.path).toBe(
      APP_ROUTES.SETTINGS_ACCOUNT
    );
    expect(
      SMOOTH_SURFACES.find(surface => surface.id === 'identity')?.routeId
    ).toBe('creator-presence');
  });

  it('builds desktop and mobile cold page-load clones with Smooth targets', () => {
    const desktop = buildSmoothRouteDefinition(
      SMOOTH_SURFACES.find(surface => surface.id === 'chat')!,
      'desktop'
    );
    const mobile = buildSmoothRouteDefinition(
      SMOOTH_SURFACES.find(surface => surface.id === 'chat')!,
      'mobile'
    );

    expect(desktop.measureMode).toBe('page-load');
    expect(desktop.viewport).toEqual(SMOOTH_DESKTOP_VIEWPORT);
    expect(mobile.viewport).toEqual(SMOOTH_MOBILE_VIEWPORT);
    expect(desktop.warmNavigationStartPath).toBeUndefined();
    expect(
      desktop.timings?.find(
        entry => entry.metric === 'largest-contentful-paint'
      )?.budget
    ).toBe(smoothTargetsFor('desktop').lcpMs);
    expect(
      mobile.timings?.find(entry => entry.metric === 'largest-contentful-paint')
        ?.budget
    ).toBe(smoothTargetsFor('mobile').lcpMs);
  });

  it('accepts desktop or compact profile ready selectors for artist-profile', () => {
    const route = buildSmoothRouteDefinition(
      SMOOTH_SURFACES.find(surface => surface.id === 'artist-profile')!,
      'desktop'
    );
    expect(route.readySelectors.content).toEqual(
      expect.arrayContaining([
        '[data-testid="profile-home-rail"]',
        '[data-testid="profile-desktop-home-overview"]',
      ])
    );
  });

  it('emits one route per surface for a platform manifest', () => {
    const manifest = buildSmoothRouteManifest('desktop');
    expect(manifest.map(route => route.id)).toEqual(
      SMOOTH_SURFACES.map(surface => `smooth-${surface.id}-desktop`)
    );
  });

  it('names baseline files per surface and platform', () => {
    expect(smoothBaselineFileName('homepage', 'desktop')).toBe(
      'homepage.desktop.json'
    );
  });
});
