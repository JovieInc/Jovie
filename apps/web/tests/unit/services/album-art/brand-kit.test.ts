import { describe, expect, it } from 'vitest';
import {
  normalizeLogoAssetUrl,
  resolveUpdatedLogoAssetUrl,
} from '@/lib/services/album-art/brand-kit';

describe('normalizeLogoAssetUrl', () => {
  it('accepts trusted blob storage URLs', () => {
    expect(
      normalizeLogoAssetUrl('https://assets.blob.vercel-storage.com/logo.png')
    ).toBe('https://assets.blob.vercel-storage.com/logo.png');
  });

  it('rejects untrusted hosts', () => {
    expect(() => normalizeLogoAssetUrl('https://example.com/logo.png')).toThrow(
      'Logo asset URL must use trusted blob storage'
    );
  });
});

describe('resolveUpdatedLogoAssetUrl', () => {
  it('preserves the existing URL when the update omits logoAssetUrl', () => {
    expect(
      resolveUpdatedLogoAssetUrl({
        nextLogoAssetUrl: undefined,
        existingLogoAssetUrl: 'https://assets.blob.vercel-storage.com/logo.png',
      })
    ).toBe('https://assets.blob.vercel-storage.com/logo.png');
  });

  it('allows explicit clearing with null', () => {
    expect(
      resolveUpdatedLogoAssetUrl({
        nextLogoAssetUrl: null,
        existingLogoAssetUrl: 'https://assets.blob.vercel-storage.com/logo.png',
      })
    ).toBeNull();
  });
});
