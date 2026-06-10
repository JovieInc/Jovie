import { describe, expect, it } from 'vitest';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
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

  it('pins design-v1 overrides on every surface baseline', () => {
    for (const surface of VISUAL_QA_SURFACES) {
      expect(
        surface.baseline.flagOverrides?.[APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]
      ).toBe(true);
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
    expect(afterConfig.flagOverrides?.[APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]).toBe(
      true
    );
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
