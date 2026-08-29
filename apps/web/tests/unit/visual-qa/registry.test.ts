import { describe, expect, it } from 'vitest';
import {
  getVisualQaSurface,
  listVisualQaSurfaces,
  resolveVisualQaCaptureConfig,
  resolveVisualQaSurfaceThemes,
  VISUAL_QA_SURFACES,
} from '@/lib/visual-qa/registry';

describe('visual-qa registry', () => {
  it('declares unique surface ids', () => {
    const ids = VISUAL_QA_SURFACES.map(surface => surface.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every baseline independent from retired shell overrides', () => {
    for (const surface of VISUAL_QA_SURFACES) {
      expect(surface.baseline.flagOverrides).toBeUndefined();
      expect(surface.baseline.route.startsWith('/')).toBe(true);
      expect(surface.baseline.waitFor.length).toBeGreaterThan(0);
      expect(surface.themes).toEqual(['dark', 'light']);
    }
  });

  it('filters surfaces by id when requested', () => {
    const surfaces = listVisualQaSurfaces(['shell-desktop-idle']);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.id).toBe('shell-desktop-idle');
  });

  it('merges after overrides onto baseline config and applies theme', () => {
    const surface = getVisualQaSurface('shell-desktop-idle');
    expect(surface).toBeDefined();

    const afterConfig = resolveVisualQaCaptureConfig(
      surface!,
      'after',
      'light'
    );
    expect(afterConfig.route).toBe(surface!.baseline.route);
    expect(afterConfig.colorScheme).toBe('light');
    expect(afterConfig.flagOverrides).toEqual({});
  });

  it('tags canonical review surfaces to screenshot-registry routes', () => {
    expect(getVisualQaSurface('canonical-homepage')).toMatchObject({
      canonicalSurfaceId: 'homepage',
      baseline: { route: '/', waitFor: 'main' },
    });
    expect(getVisualQaSurface('canonical-public-profile')).toMatchObject({
      canonicalSurfaceId: 'public-profile',
      baseline: {
        route: '/demo/showcase/public-profile',
        waitFor: '[data-testid="profile-compact-shell"]',
      },
    });
    expect(getVisualQaSurface('canonical-release-landing')).toMatchObject({
      canonicalSurfaceId: 'release-landing',
      baseline: {
        route: '/demo/showcase/release-landing',
        waitFor: '[data-testid="demo-showcase-release-landing"]',
      },
    });
    expect(getVisualQaSurface('canonical-dashboard-releases')).toMatchObject({
      canonicalSurfaceId: 'dashboard-releases',
      baseline: {
        route: '/demo',
        waitFor: '[data-testid="releases-matrix"]',
      },
    });
    expect(
      getVisualQaSurface('opportunity-inbox-home')?.canonicalSurfaceId
    ).toBeUndefined();
    expect(
      getVisualQaSurface('shell-desktop-idle')?.canonicalSurfaceId
    ).toBeUndefined();

    const homepage = getVisualQaSurface('canonical-homepage');
    expect(homepage?.baseline).toMatchObject({
      viewport: 'desktop',
      captureTarget: 'page',
      fullPage: false,
      reducedMotion: true,
    });
  });

  it('filters requested themes by surface support', () => {
    const surface = getVisualQaSurface('shell-desktop-idle');
    expect(surface).toBeDefined();

    expect(resolveVisualQaSurfaceThemes(surface!, ['dark', 'light'])).toEqual([
      'dark',
      'light',
    ]);
    expect(resolveVisualQaSurfaceThemes(surface!, ['dark'])).toEqual(['dark']);
  });
});
