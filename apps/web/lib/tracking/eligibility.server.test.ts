import { describe, expect, it, vi } from 'vitest';
import { trackingEligibility } from './eligibility';
import {
  readTrackingProfile,
  trackingVisitorFromHeaders,
} from './eligibility.server';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: lookup }) }) }),
  },
}));
describe('tracking authority adapters', () => {
  it('reads the live flag on every call without retaining the previous snapshot', async () => {
    lookup
      .mockResolvedValueOnce([{ youngAudience: false }])
      .mockResolvedValueOnce([{ youngAudience: true }]);
    expect(await readTrackingProfile('synthetic')).toEqual({
      youngAudience: false,
    });
    expect(await readTrackingProfile('synthetic')).toEqual({
      youngAudience: true,
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it('fails closed without visitor context or with malformed EU consent', () => {
    for (const headers of [
      undefined,
      new Headers({ cookie: 'invalid; jv_cc_required=1; jv_cc=%ZZ' }),
    ]) {
      expect(
        trackingEligibility({
          profile: null,
          visitor: trackingVisitorFromHeaders(headers),
        }).facebook
      ).toBe(false);
    }
  });
  it('honors valid granular consent, while a header opt-out takes precedence', () => {
    const consent = encodeURIComponent(
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    const headers = new Headers({
      cookie: `jv_cc_required=1; jv_cc=${consent}`,
    });
    expect(
      trackingEligibility({
        profile: null,
        visitor: trackingVisitorFromHeaders(headers),
      }).facebook
    ).toBe(true);
    headers.set('sec-gpc', '1');
    expect(
      trackingEligibility({
        profile: null,
        visitor: trackingVisitorFromHeaders(headers),
      }).ga
    ).toBe(false);
  });
});
