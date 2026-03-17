/**
 * Unit tests for platform-category.ts
 *
 * These tests document and lock down which drawer tab each platform appears in.
 * A regression here means MusicFetch-enriched links appear in the wrong tab
 * and artists can't find their own content.
 */

import { describe, expect, it } from 'vitest';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';

describe('getPlatformCategory', () => {
  describe('DSP platforms (Music tab)', () => {
    it.each([
      'spotify',
      'apple_music',
      'youtube_music',
      'soundcloud',
      'bandcamp',
      'amazon_music',
      'tidal',
      'deezer',
    ])('categorizes %s as dsp', platform => {
      expect(getPlatformCategory(platform)).toBe('dsp');
    });
  });

  describe('Social platforms (Social tab)', () => {
    it.each([
      'instagram',
      'tiktok',
      'youtube',
      'twitter',
      'facebook',
      'twitch',
      'snapchat',
    ])('categorizes %s as social', platform => {
      expect(getPlatformCategory(platform)).toBe('social');
    });
  });

  describe('Earnings platforms (Earn tab)', () => {
    it.each([
      'patreon',
      'buy_me_a_coffee',
      'kofi',
      'paypal',
      'venmo',
      'cashapp',
    ])('categorizes %s as earnings', platform => {
      expect(getPlatformCategory(platform)).toBe('earnings');
    });
  });

  describe('Website platforms (custom)', () => {
    it.each([
      'website',
      'linktree',
      'laylo',
      'beacons',
    ])('categorizes %s as websites', platform => {
      expect(getPlatformCategory(platform)).toBe('websites');
    });
  });

  describe('MusicFetch-enriched platform routing', () => {
    it('routes core MusicFetch DSP platforms to the Music tab', () => {
      const dspFromMusicFetch = [
        'spotify',
        'apple_music',
        'youtube_music',
        'soundcloud',
        'bandcamp',
        'amazon_music',
        'tidal',
        'deezer',
      ];
      for (const platform of dspFromMusicFetch) {
        expect(getPlatformCategory(platform), `${platform} should be dsp`).toBe(
          'dsp'
        );
      }
    });

    it('routes YouTube (non-music) to the Social tab, not Music', () => {
      // YouTube channel links go to Social tab — YouTube Music goes to Music.
      // This is intentional: YouTube is both social and music, we treat it as social.
      expect(getPlatformCategory('youtube')).toBe('social');
    });

    it('routes MusicFetch social/video platforms to the Social tab', () => {
      expect(getPlatformCategory('instagram')).toBe('social');
      expect(getPlatformCategory('tiktok')).toBe('social');
    });
  });

  describe('unknown platforms', () => {
    it('returns custom for unknown platforms', () => {
      expect(getPlatformCategory('unknown_platform')).toBe('custom');
      expect(getPlatformCategory('')).toBe('custom');
    });
  });
});
