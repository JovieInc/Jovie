import { describe, expect, it } from 'vitest';
import { DEMO_SHOWCASE_SURFACE_IDS } from '@/features/demo/showcase-surfaces';

describe('demo showcase surfaces', () => {
  it('keeps Tim White profile as the canonical artist screenshot surface', () => {
    expect(DEMO_SHOWCASE_SURFACE_IDS).toContain('tim-white-profile');
    expect(new Set(DEMO_SHOWCASE_SURFACE_IDS).size).toBe(
      DEMO_SHOWCASE_SURFACE_IDS.length
    );

    for (const surface of DEMO_SHOWCASE_SURFACE_IDS) {
      expect(surface.startsWith('artist-profile-mode-')).toBe(false);
    }
  });
});
