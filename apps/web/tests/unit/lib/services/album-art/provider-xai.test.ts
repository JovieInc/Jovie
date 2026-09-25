import { GatewayAuthenticationError } from '@ai-sdk/gateway';
import { afterEach, describe, expect, it, vi } from 'vitest';

const generateImage = vi.hoisted(() => vi.fn());
const gatewayImage = vi.hoisted(() =>
  vi.fn((modelId: string) => ({ modelId }))
);

vi.mock('ai', () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
}));

vi.mock('@/lib/ai/sdk', () => ({
  gateway: {
    image: (modelId: string) => gatewayImage(modelId),
  },
}));

const originalEnv = {
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  ALBUM_ART_IMAGE_MODEL: process.env.ALBUM_ART_IMAGE_MODEL,
  VERCEL: process.env.VERCEL,
  XAI_API_KEY: process.env.XAI_API_KEY,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('album art gateway provider', () => {
  afterEach(() => {
    restoreEnv('AI_GATEWAY_API_KEY');
    restoreEnv('ALBUM_ART_IMAGE_MODEL');
    restoreEnv('VERCEL');
    restoreEnv('XAI_API_KEY');
    generateImage.mockReset();
    gatewayImage.mockClear();
    vi.resetModules();
  });

  describe('AlbumArtGatewayUnconfiguredError', () => {
    it('carries a stable error code and name', async () => {
      const { AlbumArtGatewayUnconfiguredError } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      const err = new AlbumArtGatewayUnconfiguredError();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ALBUM_ART_GATEWAY_UNCONFIGURED');
      expect(err.name).toBe('AlbumArtGatewayUnconfiguredError');
    });
  });

  describe('isAlbumArtGatewayConfigured', () => {
    it('returns false when the gateway key is missing and the process is off Vercel', async () => {
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.VERCEL;
      process.env.XAI_API_KEY = 'xai-test-key';
      const { isAlbumArtGatewayConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isAlbumArtGatewayConfigured()).toBe(false);
    });

    it('returns false when the gateway key is whitespace and the process is off Vercel', async () => {
      process.env.AI_GATEWAY_API_KEY = '   ';
      delete process.env.VERCEL;
      const { isAlbumArtGatewayConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isAlbumArtGatewayConfigured()).toBe(false);
    });

    it('returns true when AI_GATEWAY_API_KEY is set', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      delete process.env.VERCEL;
      delete process.env.XAI_API_KEY;
      const { isAlbumArtGatewayConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isAlbumArtGatewayConfigured()).toBe(true);
    });

    it('returns true on Vercel when the static gateway key is missing', async () => {
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.XAI_API_KEY;
      process.env.VERCEL = '1';
      const { isAlbumArtGatewayConfigured } = await import(
        '@/lib/services/album-art/provider-xai'
      );
      expect(isAlbumArtGatewayConfigured()).toBe(true);
    });
  });

  describe('generateAlbumArtBackgrounds', () => {
    it('throws when gateway auth is missing and does not call the model', async () => {
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.VERCEL;
      process.env.XAI_API_KEY = 'xai-test-key';
      const { generateAlbumArtBackgrounds, AlbumArtGatewayUnconfiguredError } =
        await import('@/lib/services/album-art/provider-xai');

      await expect(
        generateAlbumArtBackgrounds({ prompt: 'test' })
      ).rejects.toBeInstanceOf(AlbumArtGatewayUnconfiguredError);
      expect(generateImage).not.toHaveBeenCalled();
    });

    it('requests three square images from the default gateway model', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      delete process.env.ALBUM_ART_IMAGE_MODEL;
      delete process.env.VERCEL;
      generateImage.mockResolvedValueOnce({
        images: [{ uint8Array: Uint8Array.from([1, 2, 3]) }],
      });
      const { generateAlbumArtBackgrounds } = await import(
        '@/lib/services/album-art/provider-xai'
      );

      const generated = await generateAlbumArtBackgrounds({
        prompt: 'text-free chrome background',
      });

      expect(gatewayImage).toHaveBeenCalledWith('spacexai/grok-imagine-image');
      expect(generateImage).toHaveBeenCalledWith({
        model: { modelId: 'spacexai/grok-imagine-image' },
        prompt: 'text-free chrome background',
        aspectRatio: '1:1',
        n: 3,
      });
      expect(generated.model).toBe('spacexai/grok-imagine-image');
      expect(generated.images).toEqual([Buffer.from([1, 2, 3])]);
    });

    it('ignores a legacy bare model override and uses the gateway constant', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      process.env.ALBUM_ART_IMAGE_MODEL = 'grok-imagine-image';
      generateImage.mockResolvedValueOnce({
        images: [{ base64: Buffer.from([9]).toString('base64') }],
      });
      const { generateAlbumArtBackgrounds } = await import(
        '@/lib/services/album-art/provider-xai'
      );

      const generated = await generateAlbumArtBackgrounds({ prompt: 'grain' });

      expect(gatewayImage).toHaveBeenCalledWith('spacexai/grok-imagine-image');
      expect(generated.model).toBe('spacexai/grok-imagine-image');
      expect(generated.images[0]).toEqual(Buffer.from([9]));
    });

    it('uses a gateway model override when it includes a provider prefix', async () => {
      process.env.VERCEL = '1';
      delete process.env.AI_GATEWAY_API_KEY;
      process.env.ALBUM_ART_IMAGE_MODEL = 'meta/muse-image-1.0';
      generateImage.mockResolvedValueOnce({
        images: [{ uint8Array: Uint8Array.from([4]) }],
      });
      const { generateAlbumArtBackgrounds } = await import(
        '@/lib/services/album-art/provider-xai'
      );

      const generated = await generateAlbumArtBackgrounds({ prompt: 'icon' });

      expect(gatewayImage).toHaveBeenCalledWith('meta/muse-image-1.0');
      expect(generated.model).toBe('meta/muse-image-1.0');
    });

    it('rejects image results that have no bytes', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      generateImage.mockResolvedValueOnce({ images: [{}] });
      const { generateAlbumArtBackgrounds } = await import(
        '@/lib/services/album-art/provider-xai'
      );

      await expect(
        generateAlbumArtBackgrounds({ prompt: 'empty' })
      ).rejects.toThrow('Gateway image result did not include image bytes');
    });

    it('maps gateway authentication failures to the unconfigured error', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      generateImage.mockRejectedValueOnce(
        new GatewayAuthenticationError({ message: 'unauthorized' })
      );
      const { generateAlbumArtBackgrounds, AlbumArtGatewayUnconfiguredError } =
        await import('@/lib/services/album-art/provider-xai');

      await expect(
        generateAlbumArtBackgrounds({ prompt: 'auth' })
      ).rejects.toBeInstanceOf(AlbumArtGatewayUnconfiguredError);
    });

    it('rethrows non-auth provider failures', async () => {
      process.env.AI_GATEWAY_API_KEY = 'gateway-test-key';
      generateImage.mockRejectedValueOnce(new Error('provider exploded'));
      const { generateAlbumArtBackgrounds } = await import(
        '@/lib/services/album-art/provider-xai'
      );

      await expect(
        generateAlbumArtBackgrounds({ prompt: 'boom' })
      ).rejects.toThrow('provider exploded');
    });
  });
});
