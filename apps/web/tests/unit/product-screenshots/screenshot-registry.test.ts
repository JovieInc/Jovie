import { describe, expect, it } from 'vitest';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';
import { SCREENSHOT_SCENARIOS } from '../../../lib/screenshots/registry';

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
});
