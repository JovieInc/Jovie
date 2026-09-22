import { describe, expect, it } from 'vitest';
import {
  AUTH_OFFER_SHELL_EVENTS,
  AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT,
  AUTH_OFFER_SHELL_VARIANT_ID,
} from './auth-offer-optimization';

describe('auth offer shell optimization contract (JOV-INV-012)', () => {
  it('names the stable variant, exposure, outcome, and rollback', () => {
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.variantIdentity).toBe(
      AUTH_OFFER_SHELL_VARIANT_ID
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.exposure).toBe(
      AUTH_OFFER_SHELL_EVENTS.EXPOSURE
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.outcome).toBe(
      AUTH_OFFER_SHELL_EVENTS.AUTH_STARTED
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.attribution.surfaces).toEqual(
      [
        'analytics',
        'model-experiments',
        'audience-events',
        'youtube-experiments',
        'release-to-revenue',
      ]
    );
    expect(
      AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.eligibleContextDimensions
    ).toContain('platform');
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.hypothesis).toMatch(
      /Preserving plan, interval, and artist/
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.primaryMetric).toContain(
      AUTH_OFFER_SHELL_EVENTS.EXPOSURE
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.guardrails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Max, team, and enterprise/),
        expect.stringMatching(/account billing settings/),
      ])
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.privacyAndConsent).toMatch(
      /Artist names stay/
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.optimizerOwner).toBe(
      'Product'
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.cadence).toMatch(/weekly/);
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.decisionWriteback).toMatch(
      /JOV-6207/
    );
    expect(AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT.rollbackOrControl).toMatch(
      /dropping the paid offer/
    );
  });
});
