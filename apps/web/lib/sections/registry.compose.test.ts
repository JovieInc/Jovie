import { describe, expect, it } from 'vitest';
import { composeHomepageSections } from './registry';

const flagsOff = {
  showGoLive: false,
  showFridayRhythm: false,
  showHomeRefresh2026: false,
  showV2Pricing: false,
  showFaq: false,
  showV2FinalCta: false,
};

describe('composeHomepageSections', () => {
  it('keeps the always-on body sections in order when every flag is off', () => {
    expect(composeHomepageSections(flagsOff)).toEqual({
      bodyIds: [
        'homepage-product-statement',
        'homepage-workspace-section',
        'homepage-artist-profiles-carousel',
      ],
      finalCtaId: null,
    });
  });

  it('inserts flagged sections without reordering the combined blocks', () => {
    expect(
      composeHomepageSections({
        showGoLive: true,
        showFridayRhythm: true,
        showHomeRefresh2026: true,
        showV2Pricing: true,
        showFaq: true,
        showV2FinalCta: true,
      })
    ).toEqual({
      bodyIds: [
        'homepage-product-statement',
        'homepage-go-live-steps',
        'homepage-workspace-section',
        'homepage-artist-profiles-carousel',
        'friday-rhythm-section',
        'home-bento-pairs',
        'home-loop-diagram',
        'home-stat-quote',
        'homepage-v2-pricing',
        'homepage-faq',
      ],
      finalCtaId: 'homepage-v2-final-cta',
    });
  });
});
