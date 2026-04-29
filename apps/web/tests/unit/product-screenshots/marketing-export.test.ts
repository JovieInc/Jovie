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
  it('returns a public URL, retina dimensions, and alt text for a desktop scenario', () => {
    const image = getMarketingExportImage('dashboard-releases-desktop');
    expect(image.publicUrl).toBe(
      '/product-screenshots/releases-dashboard-full.png'
    );
    expect(image.width).toBe(SCREENSHOT_VIEWPORTS.desktop.width * 2);
    expect(image.height).toBe(SCREENSHOT_VIEWPORTS.desktop.height * 2);
    expect(image.alt).toBe('Releases Dashboard');
  });

  it('uses mobile viewport dimensions for mobile scenarios', () => {
    const image = getMarketingExportImage('public-profile-mobile');
    expect(image.publicUrl).toBe('/product-screenshots/profile-phone.png');
    expect(image.width).toBe(SCREENSHOT_VIEWPORTS.mobile.width * 2);
    expect(image.height).toBe(SCREENSHOT_VIEWPORTS.mobile.height * 2);
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
