import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER } from '@/data/artistProfilePageOrder';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';
import { SCREENSHOT_SCENARIOS } from '../../../lib/screenshots/registry';

const TIM_WHITE_PROFILE_SCREENSHOT_IDS = [
  'tim-white-profile-tour-mobile',
  'tim-white-profile-pay-mobile',
  'tim-white-profile-presave-mobile',
  'tim-white-profile-live-mobile',
  'tim-white-profile-video-mobile',
  'tim-white-profile-subscribe-mobile',
  'tim-white-profile-listen-mobile',
] as const;

describe('screenshot registry', () => {
  it('uses unique scenario ids', () => {
    const ids = SCREENSHOT_SCENARIOS.map(scenario => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique public export paths', () => {
    const exportPaths = SCREENSHOT_SCENARIOS.flatMap(scenario =>
      scenario.publicExportPath ? [scenario.publicExportPath] : []
    );
    expect(new Set(exportPaths).size).toBe(exportPaths.length);
  });

  it('points every scenario at a valid app route', () => {
    for (const scenario of SCREENSHOT_SCENARIOS) {
      expect(scenario.route.startsWith('/')).toBe(true);
      expect(scenario.waitFor.length).toBeGreaterThan(0);
      expect(scenario.consumers).toContain('admin');
    }
  });

  it('maps canonical surface screenshots back to the canonical surface registry', () => {
    for (const surface of CANONICAL_SURFACES) {
      for (const screenshotId of surface.screenshotIds) {
        const scenario = SCREENSHOT_SCENARIOS.find(
          currentScenario => currentScenario.id === screenshotId
        );

        expect(scenario?.canonicalSurfaceId).toBe(surface.id);
        expect(scenario?.canonicalSurfaceLabel).toBe(surface.label);
        expect(scenario?.canonicalSurfaceReviewRoute).toBe(surface.reviewRoute);
      }
    }
  });

  it('leaves non-canonical captures unassigned', () => {
    const nonCanonicalScenarios = SCREENSHOT_SCENARIOS.filter(
      scenario => scenario.canonicalSurfaceId === undefined
    );

    expect(nonCanonicalScenarios.length).toBeGreaterThan(0);

    for (const scenario of nonCanonicalScenarios) {
      expect(scenario.canonicalSurfaceLabel).toBeUndefined();
      expect(scenario.canonicalSurfaceReviewRoute).toBeUndefined();
    }
  });

  it('keeps artist profile section screenshots in page order', () => {
    const expectedIds = ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER.flatMap(
      section =>
        section.screenshotScenarioId ? [section.screenshotScenarioId] : []
    );
    const actualIds = SCREENSHOT_SCENARIOS.map(scenario => scenario.id).filter(
      id => expectedIds.includes(id)
    );

    expect(actualIds).toEqual(expectedIds);

    for (const section of ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER) {
      const scenario = SCREENSHOT_SCENARIOS.find(
        currentScenario => currentScenario.id === section.screenshotScenarioId
      );

      expect(scenario?.route).toBe('/artist-profiles');
      expect(scenario?.captureTarget).toBe('locator');
      expect(scenario?.captureSelector).toBe(
        `[data-testid="${section.testId}"]`
      );
      expect(scenario?.waitFor).toBe(`[data-testid="${section.testId}"]`);
    }
  });

  it('uses Tim White profile screenshots as the artist mode source of truth', () => {
    const scenarioIds = new Set(
      SCREENSHOT_SCENARIOS.map(scenario => scenario.id)
    );

    for (const id of TIM_WHITE_PROFILE_SCREENSHOT_IDS) {
      expect(scenarioIds.has(id)).toBe(true);
    }

    for (const scenario of SCREENSHOT_SCENARIOS) {
      expect(scenario.id.startsWith('artist-profile-mode-')).toBe(false);
      expect(
        scenario.publicExportPath?.startsWith('artist-profile-mode-') ?? false
      ).toBe(false);
    }
  });
});
