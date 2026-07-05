import { describe, expect, it } from 'vitest';
import { isChatMerchDesignCarouselResult } from './ChatMerchDesignCarousel';

describe('isChatMerchDesignCarouselResult', () => {
  it('accepts a valid carousel result', () => {
    expect(
      isChatMerchDesignCarouselResult({
        success: true,
        generationId: 'gen_1',
        designs: [],
      })
    ).toBe(true);
  });

  it('rejects non-carousel shapes', () => {
    expect(isChatMerchDesignCarouselResult(null)).toBe(false);
    expect(isChatMerchDesignCarouselResult({ success: false })).toBe(false);
    expect(
      isChatMerchDesignCarouselResult({ success: true, generationId: 'g' })
    ).toBe(false);
    expect(
      isChatMerchDesignCarouselResult({ success: true, designs: [] })
    ).toBe(false);
  });
});
