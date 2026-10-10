import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import { HOMEPAGE_V2_COPY } from './homepageV2Copy';

describe('homepage v2 copy', () => {
  it('uses the canonical paid-offer name across hero and pricing copy', () => {
    const offerName = ARTIST_VISIBILITY_OFFER.pro.displayName;

    expect(HOMEPAGE_V2_COPY.hero.microproof).toContain(offerName);
    expect(HOMEPAGE_V2_COPY.pricing.body).toContain(offerName);
    expect(HOMEPAGE_V2_COPY.hero.microproof).not.toMatch(/\bPro trial\b/);
  });
});
