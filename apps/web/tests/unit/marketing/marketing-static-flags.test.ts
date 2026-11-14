import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

describe('marketing static flags', () => {
  it('keeps the product demo video off until founder and machine certification', () => {
    expect(FEATURE_FLAGS.SHOW_PRODUCT_DEMO_VIDEO).toBe(false);
  });

  it('keeps the public about and footer refresh off until it is flipped', () => {
    expect(FEATURE_FLAGS.SHOW_PUBLIC_ABOUT_FOOTER_REFRESH).toBe(false);
  });

  it('holds no presentation gate that is already on', () => {
    // A shipped section renders unconditionally. A `SHOW_*` key exists only
    // while its surface is still dark, so none of them may be true.
    const shippedGates = Object.entries(FEATURE_FLAGS)
      .filter(([name, value]) => name.startsWith('SHOW_') && value)
      .map(([name]) => name);
    expect(shippedGates).toEqual([]);
  });

  it('is pure constants (no runtime env toggles)', () => {
    // Guards against reintroducing NEXT_PUBLIC_* env reads that would break
    // static marketing rendering. FEATURE_FLAGS must stay build-time constants.
    expect(Object.keys(FEATURE_FLAGS).length).toBeGreaterThan(0);
    for (const value of Object.values(FEATURE_FLAGS)) {
      expect(typeof value).toBe('boolean');
    }
  });
});
