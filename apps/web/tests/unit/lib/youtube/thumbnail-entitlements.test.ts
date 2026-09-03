import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('YouTube thumbnail entitlements', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv(
      'STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY',
      'price_thumbnail_founder'
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('grants founder access only from the exact product price', async () => {
    const { resolveYouTubeThumbnailPlan } = await import(
      '@/lib/youtube/thumbnail-entitlements'
    );

    expect(resolveYouTubeThumbnailPlan('price_thumbnail_founder')).toBe(
      'founder'
    );
    expect(resolveYouTubeThumbnailPlan('price_unrelated_pro')).toBe('free');
    expect(resolveYouTubeThumbnailPlan(null)).toBe('free');
  });
});
