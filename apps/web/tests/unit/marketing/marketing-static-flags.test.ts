import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

describe('marketing static flags', () => {
  it('ships homepage v2 sections on (design system refresh)', () => {
    // Product intent (homepage-session): mount the full v2 homepage surface.
    // Flags remain plain `as const` booleans with no env reads — build-time only.
    expect(FEATURE_FLAGS.SHOW_EXAMPLE_PROFILES_CAROUSEL).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_SECTIONS).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_V2_TRUST).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_V2_PRICING).toBe(true);
    expect(FEATURE_FLAGS.SHOW_MARKETING_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_HOMEPAGE_CENTER_NAV).toBe(true);
    expect(FEATURE_FLAGS.SHOW_MARKETING_FULL_FOOTER).toBe(true);
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);
  });

  it('keeps V1 design flags false (inverted semantics still off — V2 ships)', () => {
    // V1_DESIGN flags have inverted semantics: true = OLD design.
    // They remain false so the homepage continues to use V2 structure.
    expect(FEATURE_FLAGS.SHOW_HOME_V1_DESIGN).toBe(false);
    expect(FEATURE_FLAGS.SHOW_PUBLIC_PROFILE_V1_DESIGN).toBe(false);
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
