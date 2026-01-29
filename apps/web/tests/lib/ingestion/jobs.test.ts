import { describe, expect, it } from 'vitest';
import {
  detectIngestionPlatform,
  isSupportedIngestionUrl,
} from '@/lib/ingestion/strategies';

// Note: Full integration tests for enqueueIngestionJob require database mocking
// These tests focus on the platform detection and URL validation logic

describe('Ingestion Jobs', () => {
  describe('detectIngestionPlatform', () => {
    it('detects Linktree URLs', () => {
      expect(detectIngestionPlatform('https://linktr.ee/username')).toBe(
        'linktree'
      );
      expect(detectIngestionPlatform('https://www.linktr.ee/username')).toBe(
        'linktree'
      );
      expect(detectIngestionPlatform('https://linktree.com/username')).toBe(
        'linktree'
      );
    });

    it('detects Beacons URLs', () => {
      expect(detectIngestionPlatform('https://beacons.ai/username')).toBe(
        'beacons'
      );
      expect(detectIngestionPlatform('https://www.beacons.ai/username')).toBe(
        'beacons'
      );
      expect(detectIngestionPlatform('https://beacons.page/username')).toBe(
        'beacons'
      );
    });

    it('detects Instagram URLs', () => {
      expect(detectIngestionPlatform('https://instagram.com/username')).toBe(
        'instagram'
      );
      expect(
        detectIngestionPlatform('https://www.instagram.com/username')
      ).toBe('instagram');
    });

    it('detects Twitter/X URLs', () => {
      expect(detectIngestionPlatform('https://twitter.com/username')).toBe(
        'twitter'
      );
      expect(detectIngestionPlatform('https://x.com/username')).toBe('twitter');
    });

    it('returns unknown for unsupported URLs', () => {
      expect(detectIngestionPlatform('https://example.com/username')).toBe(
        'unknown'
      );
      expect(detectIngestionPlatform('https://facebook.com/username')).toBe(
        'unknown'
      );
    });

    it('returns unknown for HTTP URLs', () => {
      expect(detectIngestionPlatform('http://linktr.ee/username')).toBe(
        'unknown'
      );
      expect(detectIngestionPlatform('http://beacons.ai/username')).toBe(
        'unknown'
      );
    });

    it('returns unknown for invalid URLs', () => {
      expect(detectIngestionPlatform('')).toBe('unknown');
      expect(detectIngestionPlatform('not-a-url')).toBe('unknown');
      // Note: URLs without protocol get normalized to https:// by normalizeUrl
      // so linktr.ee/username becomes https://linktr.ee/username which is valid
      expect(detectIngestionPlatform('linktr.ee/username')).toBe('linktree');
      // But truly malformed URLs should be unknown
      expect(detectIngestionPlatform('://invalid')).toBe('unknown');
    });

    it('returns unknown for reserved Beacons paths', () => {
      expect(detectIngestionPlatform('https://beacons.ai/login')).toBe(
        'unknown'
      );
      expect(detectIngestionPlatform('https://beacons.ai/dashboard')).toBe(
        'unknown'
      );
      expect(detectIngestionPlatform('https://beacons.ai/api')).toBe('unknown');
    });
  });

  describe('isSupportedIngestionUrl', () => {
    it('returns true for supported platforms', () => {
      expect(isSupportedIngestionUrl('https://linktr.ee/username')).toBe(true);
      expect(isSupportedIngestionUrl('https://beacons.ai/username')).toBe(true);
    });

    it('returns true for Instagram and Twitter', () => {
      expect(isSupportedIngestionUrl('https://instagram.com/username')).toBe(
        true
      );
      expect(isSupportedIngestionUrl('https://twitter.com/username')).toBe(
        true
      );
    });

    it('returns false for unsupported platforms', () => {
      expect(isSupportedIngestionUrl('https://example.com/username')).toBe(
        false
      );
      expect(isSupportedIngestionUrl('https://facebook.com/username')).toBe(
        false
      );
    });

    it('returns false for HTTP URLs', () => {
      expect(isSupportedIngestionUrl('http://linktr.ee/username')).toBe(false);
      expect(isSupportedIngestionUrl('http://beacons.ai/username')).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isSupportedIngestionUrl('')).toBe(false);
      expect(isSupportedIngestionUrl('not-a-url')).toBe(false);
    });
  });
});
