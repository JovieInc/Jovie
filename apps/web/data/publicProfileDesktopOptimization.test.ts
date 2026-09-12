import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PUBLIC_PROFILE_DESKTOP_EVENTS,
  PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY,
  PUBLIC_PROFILE_DESKTOP_MIN_WIDTH_PX,
  PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT,
  PUBLIC_PROFILE_DESKTOP_VARIANT_ID,
  readPublicProfileLayout,
} from '@/data/publicProfileDesktopOptimization';

describe('public profile desktop optimization contract (JOV-INV-012)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the stable variant, exposure, outcome, and rollback', () => {
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.variantIdentity).toBe(
      PUBLIC_PROFILE_DESKTOP_VARIANT_ID
    );
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.exposure).toBe(
      PUBLIC_PROFILE_DESKTOP_EVENTS.EXPOSURE
    );
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.outcome).toBe(
      PUBLIC_PROFILE_DESKTOP_EVENTS.OUTCOME
    );
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.attribution.surfaces
    ).toEqual([
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ]);
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.eligibleContextDimensions
    ).toContain('platform');
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.hypothesis).toMatch(
      /unlabeled 430px compact shell/
    );
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.primaryMetric
    ).toContain(PUBLIC_PROFILE_DESKTOP_EVENTS.EXPOSURE);
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.guardrails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/desktop surface only/),
        expect.stringMatching(/labeled, framed/),
      ])
    );
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.privacyAndConsent
    ).toMatch(/Anonymous first-party analytics/);
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.optimizerOwner).toBe(
      'Product'
    );
    expect(PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.cadence).toMatch(
      /weekly/
    );
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.decisionWriteback
    ).toMatch(/JOV-5995/);
    expect(
      PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT.rollbackOrControl
    ).toMatch(/Do not restore the unlabeled 430px compact shell/);
  });

  it('reads layout from the canonical 1180px desktop media query', () => {
    expect(PUBLIC_PROFILE_DESKTOP_MIN_WIDTH_PX).toBe(1180);
    expect(PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY).toBe('(min-width: 1180px)');

    const matchMedia = vi.fn((query: string) => ({
      matches: query === PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    expect(readPublicProfileLayout()).toBe('desktop');
    expect(matchMedia).toHaveBeenCalledWith(PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY);

    matchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(readPublicProfileLayout()).toBe('compact');
  });
});
