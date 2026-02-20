import { describe, expect, it } from 'vitest';
import { buildHomepageSectionFlags } from './homepage-sections';

describe('buildHomepageSectionFlags', () => {
  it('maps each flag in order, including deeplinksGrid', () => {
    const flags = buildHomepageSectionFlags([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);

    expect(flags).toEqual({
      hero: true,
      labelLogos: false,
      howItWorks: true,
      dashboardShowcase: false,
      productPreview: true,
      exampleProfiles: false,
      deeplinksGrid: true,
      problem: false,
      comparison: true,
      whatYouGet: false,
      seeItInAction: true,
      finalCta: false,
    });
  });
});
