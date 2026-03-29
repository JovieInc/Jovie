/**
 * SoundCloud Pro Badge Detection Tests
 */

import { describe, expect, it } from 'vitest';
import {
  detectSoundCloudProFromApiData,
  normalizeSoundCloudSlug,
} from '@/lib/ingestion/strategies/soundcloud/pro-badge';

describe('detectSoundCloudProFromApiData', () => {
  describe('positive detection', () => {
    it('should detect Pro Unlimited from subscription product', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: false, pro_unlimited: true, creator_mid_tier: false },
        creator_subscription: { product: { id: 'creator-pro-unlimited' } },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro_unlimited');
      expect(result.productId).toBe('creator-pro-unlimited');
    });

    it('should detect Pro from subscription product', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: true, pro_unlimited: false },
        creator_subscription: { product: { id: 'creator-pro' } },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.productId).toBe('creator-pro');
    });

    it('should detect Next Pro from subscription product', () => {
      const result = detectSoundCloudProFromApiData({
        creator_subscription: { product: { id: 'creator-next-pro' } },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('next_pro');
    });

    it('should fall back to badges when subscription is missing', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro_unlimited: true },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro_unlimited');
    });

    it('should detect Pro badge fallback', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: true, pro_unlimited: false },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro');
    });

    it('should detect creator_mid_tier badge', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: false, pro_unlimited: false, creator_mid_tier: true },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('creator_mid_tier');
    });

    it('should prefer subscription product over badges', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: true, pro_unlimited: false },
        creator_subscription: { product: { id: 'creator-pro-unlimited' } },
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro_unlimited');
      expect(result.productId).toBe('creator-pro-unlimited');
    });

    it('should use creator_subscriptions array fallback', () => {
      const result = detectSoundCloudProFromApiData({
        creator_subscriptions: [{ product: { id: 'creator-pro-unlimited' } }],
      });
      expect(result.isPro).toBe(true);
      expect(result.tier).toBe('pro_unlimited');
    });
  });

  describe('negative detection (free account)', () => {
    it('should return false for free subscription', () => {
      const result = detectSoundCloudProFromApiData({
        badges: {
          pro: false,
          pro_unlimited: false,
          creator_mid_tier: false,
          verified: false,
        },
        creator_subscription: { product: { id: 'free' } },
      });
      expect(result.isPro).toBe(false);
      expect(result.tier).toBeNull();
      expect(result.productId).toBe('free');
    });

    it('should return false when badges exist but all false', () => {
      const result = detectSoundCloudProFromApiData({
        badges: { pro: false, pro_unlimited: false, creator_mid_tier: false },
      });
      expect(result.isPro).toBe(false);
      expect(result.tier).toBeNull();
    });
  });

  describe('uncertain/null cases', () => {
    it('should return null for null input', () => {
      const result = detectSoundCloudProFromApiData(null);
      expect(result.isPro).toBeNull();
      expect(result.tier).toBeNull();
      expect(result.productId).toBeNull();
    });

    it('should return null for empty object', () => {
      const result = detectSoundCloudProFromApiData({});
      expect(result.isPro).toBeNull();
    });

    it('should return null when no badges and no subscription', () => {
      const result = detectSoundCloudProFromApiData({
        badges: undefined,
        creator_subscription: undefined,
      });
      expect(result.isPro).toBeNull();
    });
  });
});

describe('normalizeSoundCloudSlug', () => {
  it('strips SoundCloud URL prefixes', () => {
    expect(normalizeSoundCloudSlug('https://soundcloud.com/deadmau5')).toBe(
      'deadmau5'
    );
    expect(normalizeSoundCloudSlug('http://www.soundcloud.com/skrillex')).toBe(
      'skrillex'
    );
  });

  it('strips query params and hash fragments', () => {
    expect(normalizeSoundCloudSlug('deadmau5?si=abc123')).toBe('deadmau5');
    expect(normalizeSoundCloudSlug('deadmau5#tracks')).toBe('deadmau5');
    expect(normalizeSoundCloudSlug('deadmau5?si=abc123#tracks')).toBe(
      'deadmau5'
    );
  });

  it('strips trailing slashes and whitespace', () => {
    expect(normalizeSoundCloudSlug('  deadmau5///  ')).toBe('deadmau5');
  });
});
