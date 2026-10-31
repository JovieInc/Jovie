import { describe, expect, it } from 'vitest';
import { type TrackingVisitor, trackingEligibility } from './eligibility';

const allow = {
  facebook: true,
  google: true,
  tiktok: true,
  ga: true,
  vercel: true,
};
const deny = {
  facebook: false,
  google: false,
  tiktok: false,
  ga: false,
  vercel: false,
};
describe('the shared third-party tracking policy', () => {
  it('preserves eligible flag-off and platform behavior', () => {
    expect(
      trackingEligibility({ profile: { youngAudience: false }, visitor: {} })
    ).toEqual(allow);
    expect(trackingEligibility({ profile: null, visitor: {} })).toEqual(allow);
  });
  it.each<TrackingVisitor>([
    {},
    { consent: { analytics: true, marketing: true } },
    { consentRequired: true, consent: { analytics: true, marketing: true } },
  ])(
    'denies every vendor for young audiences even with consent: %j',
    visitor => {
      expect(
        trackingEligibility({ profile: { youngAudience: true }, visitor })
      ).toEqual(deny);
    }
  );
  it.each<TrackingVisitor>([
    { gpc: true },
    { dnt: true },
    { optOut: true },
    { under16: true },
    { consentRequired: true },
    { consent: { analytics: false, marketing: false } },
  ])('honors visitor denial: %j', visitor => {
    expect(
      trackingEligibility({ profile: { youngAudience: false }, visitor })
    ).toEqual(deny);
  });
  it('fails closed for unresolved artists and separates marketing from analytics consent', () => {
    expect(trackingEligibility({ profile: undefined, visitor: {} })).toEqual(
      deny
    );
    expect(
      trackingEligibility({
        profile: { youngAudience: false },
        visitor: {
          consentRequired: true,
          consent: { analytics: true, marketing: false },
        },
      })
    ).toEqual({ ...deny, ga: true, vercel: true });
  });
});
