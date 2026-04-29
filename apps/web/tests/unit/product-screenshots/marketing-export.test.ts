import { describe, expect, it } from 'vitest';
import {
  getMarketingExportImage,
  getMarketingExportScenarios,
  SCREENSHOT_VIEWPORTS,
} from '../../../lib/screenshots/registry';

describe('getMarketingExportScenarios', () => {
  it('returns only scenarios tagged with marketing-export', () => {
    const scenarios = getMarketingExportScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      expect(scenario.consumers).toContain('marketing-export');
    }
  });

  it('includes the canonical marketing-page scenarios', () => {
    const scenarios = getMarketingExportScenarios();
    const ids = scenarios.map(s => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dashboard-releases-desktop',
        'dashboard-releases-sidebar-desktop',
        'dashboard-release-sidebar-detail-desktop',
        'dashboard-release-sidebar-platforms-desktop',
        'dashboard-audience-desktop',
        'public-profile-desktop',
        'public-profile-mobile',
        'tim-white-profile-listen-mobile',
      ])
    );
  });
});

describe('getMarketingExportImage', () => {
  it('returns a public URL, retina dimensions, and alt text for a full-viewport desktop scenario', () => {
    const image = getMarketingExportImage('dashboard-releases-desktop');
    expect(image.publicUrl).toBe(
      '/product-screenshots/releases-dashboard-full.png'
    );
    expect(image.width).toBe(SCREENSHOT_VIEWPORTS.desktop.width * 2);
    expect(image.height).toBe(SCREENSHOT_VIEWPORTS.desktop.height * 2);
    expect(image.alt).toBe('Releases Dashboard');
  });

  it('uses mobile viewport dimensions for full-viewport mobile scenarios', () => {
    const image = getMarketingExportImage('public-profile-mobile');
    expect(image.publicUrl).toBe('/product-screenshots/profile-phone.png');
    expect(image.width).toBe(SCREENSHOT_VIEWPORTS.mobile.width * 2);
    expect(image.height).toBe(SCREENSHOT_VIEWPORTS.mobile.height * 2);
  });

  it('returns ACTUAL PNG dimensions (not viewport×2) for locator-captured scenarios', () => {
    // Locator captures crop to a sub-region of the viewport, so their
    // dimensions are arbitrary. Advertising viewport×2 to next/image distorts
    // the rendered aspect ratio.
    const cases: ReadonlyArray<{
      readonly id: string;
      readonly width: number;
      readonly height: number;
    }> = [
      { id: 'artist-spec-geo-insights-desktop', width: 720, height: 1690 },
      { id: 'artist-spec-tracked-links-desktop', width: 1842, height: 952 },
      { id: 'artist-spec-sync-settings-desktop', width: 1442, height: 1120 },
      { id: 'release-tasks-desktop', width: 1624, height: 1428 },
      {
        id: 'dashboard-release-sidebar-detail-desktop',
        width: 776,
        height: 1690,
      },
      {
        id: 'dashboard-release-sidebar-platforms-desktop',
        width: 776,
        height: 582,
      },
    ];
    for (const { id, width, height } of cases) {
      const image = getMarketingExportImage(id);
      expect(image.width).toBe(width);
      expect(image.height).toBe(height);
    }
  });

  it('throws on an unknown scenario id', () => {
    expect(() => getMarketingExportImage('does-not-exist')).toThrow(
      /Unknown screenshot scenario/
    );
  });

  it('throws when the scenario is not tagged marketing-export', () => {
    expect(() => getMarketingExportImage('marketing-home-desktop')).toThrow(
      /not tagged 'marketing-export'/
    );
  });

  it('throws when a marketing-export scenario lacks publicExportPath', () => {
    const scenarios = getMarketingExportScenarios();
    const missingPath = scenarios.find(s => !s.publicExportPath);
    if (missingPath) {
      expect(() => getMarketingExportImage(missingPath.id)).toThrow(
        /no publicExportPath/
      );
    } else {
      expect(scenarios.every(s => Boolean(s.publicExportPath))).toBe(true);
    }
  });
});
