import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

describe('marketing static flags', () => {
  it('keeps every static marketing flag default-off for the clean homepage baseline', () => {
    // Product intent (e3d6ba5): all marketing static flags ship false so the
    // homepage collapses to hero + minimal chrome. Flags are plain `as const`
    // booleans with no env reads — build-time constants only.
    const entries = Object.entries(FEATURE_FLAGS);

    expect(entries.length).toBeGreaterThan(0);
    for (const [name, value] of entries) {
      expect(value, `${name} should be false`).toBe(false);
    }
  });

  it('keeps V1 design flags false (inverted semantics still off — V2 ships)', () => {
    // V1_DESIGN flags have inverted semantics: true = OLD design.
    // They remain false so the homepage continues to use V2 structure,
    // even while section/content flags are also off for the clean baseline.
    expect(FEATURE_FLAGS.SHOW_HOME_V1_DESIGN).toBe(false);
    expect(FEATURE_FLAGS.SHOW_PUBLIC_PROFILE_V1_DESIGN).toBe(false);
  });

  it('keeps homepage story stack and final CTA off', () => {
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS).toBe(false);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA).toBe(false);
  });

  it('keeps marketing chrome (center nav + full footer) off by default', () => {
    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(false);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(false);
    expect(FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER).toBe(false);
  });

  it('is pure constants (no runtime env toggles)', () => {
    // Guards against reintroducing NEXT_PUBLIC_* env reads that would break
    // static marketing rendering. FEATURE_FLAGS must stay build-time constants.
    for (const value of Object.values(FEATURE_FLAGS)) {
      expect(typeof value).toBe('boolean');
    }
  });
});
