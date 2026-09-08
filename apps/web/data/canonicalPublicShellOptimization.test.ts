import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_SHELL_EVENTS,
  CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT,
  CANONICAL_PUBLIC_SHELL_VARIANT_ID,
} from '@/data/canonicalPublicShellOptimization';
import { WAITLIST_FRONT_DOOR_EVENTS } from '@/data/homepageFrontDoorCta';

describe('canonical public shell optimization contract (JOV-INV-012)', () => {
  it('names the stable variant, exposure, outcome, and rollback', () => {
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.variantIdentity).toBe(
      CANONICAL_PUBLIC_SHELL_VARIANT_ID
    );
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.exposure).toBe(
      CANONICAL_PUBLIC_SHELL_EVENTS.EXPOSURE
    );
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.outcome).toBe(
      WAITLIST_FRONT_DOOR_EVENTS.PAGE_VIEW
    );
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.attribution.surfaces
    ).toEqual([
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ]);
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.eligibleContextDimensions
    ).toContain('platform');
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.hypothesis).toMatch(
      /Customers, Product, and Pricing/
    );
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.primaryMetric
    ).toContain(CANONICAL_PUBLIC_SHELL_EVENTS.EXPOSURE);
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.guardrails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Customers, Product, and Pricing/),
        expect.stringMatching(/For\/Tools/),
      ])
    );
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.privacyAndConsent
    ).toMatch(/Anonymous page analytics/);
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.optimizerOwner).toBe(
      'Product'
    );
    expect(CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.cadence).toMatch(
      /weekly/
    );
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.decisionWriteback
    ).toMatch(/JOV-5745/);
    expect(
      CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT.rollbackOrControl
    ).toMatch(/MARKETING_NAV_LINKS/);
  });
});
