import { describe, expect, it } from 'vitest';
import { AUTHED_AXE_SURFACES } from '../../e2e/utils/authed-axe-surface-manifest';

/**
 * Guardrail: the authed axe surface manifest must not silently become empty
 * or malformed (JOV-11027). If AUTHED_AXE_SURFACES is empty, the color-contrast
 * gate covers nothing and the protection is gone.
 */
describe('authed-axe-surface-manifest', () => {
  it('is non-empty', () => {
    expect(AUTHED_AXE_SURFACES.length).toBeGreaterThan(0);
  });

  it('has unique surface ids', () => {
    const ids = AUTHED_AXE_SURFACES.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('each surface has a non-empty path and at least one ready selector', () => {
    for (const surface of AUTHED_AXE_SURFACES) {
      expect(surface.path, `${surface.id} path`).toBeTruthy();
      expect(
        surface.readySelectors.length,
        `${surface.id} readySelectors`
      ).toBeGreaterThan(0);
    }
  });

  it('all paths are absolute (start with /)', () => {
    for (const surface of AUTHED_AXE_SURFACES) {
      expect(
        surface.path.startsWith('/'),
        `${surface.id} path must start with /`
      ).toBe(true);
    }
  });

  it('persona is creator, creator-ready, or admin when specified', () => {
    const valid = new Set(['creator', 'creator-ready', 'admin']);
    for (const surface of AUTHED_AXE_SURFACES) {
      if (surface.persona !== undefined) {
        expect(
          valid.has(surface.persona),
          `${surface.id} persona "${surface.persona}" must be a valid DevTestAuthPersona`
        ).toBe(true);
      }
    }
  });
});
