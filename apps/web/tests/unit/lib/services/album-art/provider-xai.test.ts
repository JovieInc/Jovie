import { afterEach, describe, expect, it, vi } from 'vitest';

describe('provider-xai', () => {
  const originalKey = process.env.XAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.XAI_API_KEY;
    } else {
      process.env.XAI_API_KEY = originalKey;
    }
    vi.resetModules();
  });

  describe('XaiApiKeyMissingError', () => {
    it('carries a stable error code and name', async () => {
      const { XaiApiKeyMissingError } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      const err = new XaiApiKeyMissingError();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('XAI_API_KEY_MISSING');
      expect(err.name).toBe('XaiApiKeyMissingError');
    });
  });

  describe('isXaiConfigured', () => {
    it('returns false when XAI_API_KEY is missing', async () => {
      delete process.env.XAI_API_KEY;
      const { isXaiConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isXaiConfigured()).toBe(false);
    });

    it('returns false when XAI_API_KEY is whitespace', async () => {
      process.env.XAI_API_KEY = '   ';
      const { isXaiConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isXaiConfigured()).toBe(false);
    });

    it('returns true when XAI_API_KEY is set', async () => {
      process.env.XAI_API_KEY = 'xai-test-key';
      const { isXaiConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isXaiConfigured()).toBe(true);
    });
  });

  describe('generateAlbumArtBackgrounds', () => {
    it('throws XaiApiKeyMissingError when XAI_API_KEY is missing — no Sentry call needed', async () => {
      delete process.env.XAI_API_KEY;
      const { generateAlbumArtBackgrounds, XaiApiKeyMissingError } =
        await import('@/lib/services/album-art/provider-xai');

      await expect(
        generateAlbumArtBackgrounds({ prompt: 'test' })
      ).rejects.toBeInstanceOf(XaiApiKeyMissingError);
    });
  });
});
