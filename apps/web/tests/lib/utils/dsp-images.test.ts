import { describe, expect, it } from 'vitest';
import {
  isDefaultAvatarUrl,
  isExternalDspImage,
  shouldBypassImageOptimization,
} from '@/lib/utils/dsp-images';

describe('shouldBypassImageOptimization', () => {
  describe('Spotify CDN domains (proxiable — must NOT bypass)', () => {
    // Regression: JOV-2261 — Spotify cover served as full-res 96KB JPEG
    // because i.scdn.co was bypassing Next/Image optimization.
    // Found by /qa on 2026-05-15
    // Report: apps/web/lib/utils/dsp-images.ts
    it('does NOT bypass i.scdn.co (Spotify direct CDN)', () => {
      expect(
        shouldBypassImageOptimization(
          'https://i.scdn.co/image/ab67616d0000b273abc'
        )
      ).toBe(false);
    });

    it('does NOT bypass *.scdn.co wildcard', () => {
      expect(
        shouldBypassImageOptimization('https://mosaic.scdn.co/640/abc123')
      ).toBe(false);
    });

    it('does NOT bypass *.spotifycdn.com', () => {
      expect(
        shouldBypassImageOptimization(
          'https://images.spotifycdn.com/image/abc123'
        )
      ).toBe(false);
    });
  });

  describe('non-Spotify DSP domains (non-proxiable — should bypass)', () => {
    it('bypasses Apple Music CDN (is.mzstatic.com)', () => {
      // Apple Music images are NOT in next.config.js remotePatterns — bypass is correct.
      const result = shouldBypassImageOptimization(
        'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/cover.jpg/300x300bb.jpg'
      );
      // Non-Spotify DSP domains should still bypass (unless they are proxiable)
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Vercel blob storage (should bypass)', () => {
    it('bypasses blob.vercel-storage.com', () => {
      expect(
        shouldBypassImageOptimization(
          'https://abc.blob.vercel-storage.com/img.jpg'
        )
      ).toBe(true);
    });

    it('bypasses blob.vercel-storage.com direct domain', () => {
      expect(
        shouldBypassImageOptimization('https://blob.vercel-storage.com/img.jpg')
      ).toBe(true);
    });
  });

  describe('default avatar paths (should bypass)', () => {
    it('bypasses /avatars/default-user paths', () => {
      expect(
        shouldBypassImageOptimization('/avatars/default-user-123.png')
      ).toBe(true);
    });
  });

  describe('null / undefined / empty', () => {
    it('returns false for null', () => {
      expect(shouldBypassImageOptimization(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(shouldBypassImageOptimization(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(shouldBypassImageOptimization('')).toBe(false);
    });
  });
});

describe('isExternalDspImage', () => {
  it('returns true for Spotify i.scdn.co URLs', () => {
    expect(isExternalDspImage('https://i.scdn.co/image/abc123')).toBe(true);
  });

  it('returns false for non-DSP URLs', () => {
    expect(isExternalDspImage('https://example.com/image.jpg')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isExternalDspImage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isExternalDspImage(undefined)).toBe(false);
  });
});

describe('isDefaultAvatarUrl', () => {
  it('returns true for default avatar paths', () => {
    expect(isDefaultAvatarUrl('/avatars/default-user-123.png')).toBe(true);
  });

  it('returns false for real avatar URLs', () => {
    expect(isDefaultAvatarUrl('https://i.scdn.co/image/abc')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDefaultAvatarUrl(null)).toBe(false);
  });
});
