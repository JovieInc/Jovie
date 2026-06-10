import { describe, expect, it } from 'vitest';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  getVisualQaSurface,
  listVisualQaSurfaces,
  resolveVisualQaCaptureConfig,
  VISUAL_QA_SURFACES,
} from '@/lib/visual-qa/registry';

describe('visual-qa registry', () => {
  it('declares unique surface ids', () => {
    const ids = VISUAL_QA_SURFACES.map(surface => surface.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pins design-v1 overrides on every surface baseline', () => {
    for (const surface of VISUAL_QA_SURFACES) {
      expect(
        surface.baseline.flagOverrides?.[APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]
      ).toBe(true);
      expect(surface.baseline.route.startsWith('/')).toBe(true);
      expect(surface.baseline.waitFor.length).toBeGreaterThan(0);
    }
  });

  it('filters surfaces by id when requested', () => {
    const surfaces = listVisualQaSurfaces(['shell-desktop-idle']);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.id).toBe('shell-desktop-idle');
  });

  it('merges after overrides onto baseline config', () => {
    const surface = getVisualQaSurface('shell-desktop-idle');
    expect(surface).toBeDefined();

    const afterConfig = resolveVisualQaCaptureConfig(surface!, 'after');
    expect(afterConfig.route).toBe(surface!.baseline.route);
    expect(afterConfig.flagOverrides?.[APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]).toBe(
      true
    );
  });
});
