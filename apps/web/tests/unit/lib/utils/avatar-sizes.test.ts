import { describe, expect, it } from 'vitest';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';

describe('buildAvatarSizes', () => {
  it('returns empty array when no sizesMap or avatarUrl', () => {
    expect(buildAvatarSizes(null, null)).toEqual([]);
    expect(buildAvatarSizes(undefined, undefined)).toEqual([]);
  });

  it('generates S/M/L via Next.js image optimization for non-Cloudinary avatarUrl', () => {
    const sizes = buildAvatarSizes(
      null,
      'https://example.blob.vercel-storage.com/avatars/photo.avif'
    );

    expect(sizes).toHaveLength(4);
    expect(sizes[0].key).toBe('small');
    expect(sizes[0].label).toBe('Small (150 x 150)');
    expect(sizes[0].url).toContain('/_next/image?');
    expect(sizes[0].url).toContain('w=150');

    expect(sizes[1].key).toBe('medium');
    expect(sizes[1].url).toContain('w=400');

    expect(sizes[2].key).toBe('large');
    expect(sizes[2].url).toContain('w=800');

    expect(sizes[3].key).toBe('original');
    expect(sizes[3].url).toBe(
      'https://example.blob.vercel-storage.com/avatars/photo.avif'
    );
  });

  it('generates S/M/L via Cloudinary transforms for Cloudinary URLs', () => {
    const sizes = buildAvatarSizes(
      null,
      'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'
    );

    expect(sizes).toHaveLength(4);
    expect(sizes[0].key).toBe('small');
    expect(sizes[0].url).toContain('w_150,h_150,c_fill');
    expect(sizes[0].url).not.toContain('/_next/image');

    expect(sizes[1].key).toBe('medium');
    expect(sizes[1].url).toContain('w_400,h_400,c_fill');

    expect(sizes[2].key).toBe('large');
    expect(sizes[2].url).toContain('w_800,h_800,c_fill');

    expect(sizes[3].key).toBe('original');
  });

  it('uses pre-computed sizes from sizesMap when available', () => {
    const sizesMap = {
      original: 'https://blob.example.com/original.avif',
      '512': 'https://blob.example.com/512.avif',
      '256': 'https://blob.example.com/256.avif',
      '128': 'https://blob.example.com/128.avif',
    };

    const sizes = buildAvatarSizes(sizesMap, null);

    expect(sizes).toHaveLength(4);
    expect(sizes[0]).toEqual({
      key: 'large',
      label: 'Large (512 x 512)',
      url: 'https://blob.example.com/512.avif',
    });
    expect(sizes[1]).toEqual({
      key: 'medium',
      label: 'Medium (256 x 256)',
      url: 'https://blob.example.com/256.avif',
    });
    expect(sizes[2]).toEqual({
      key: 'small',
      label: 'Small (128 x 128)',
      url: 'https://blob.example.com/128.avif',
    });
    expect(sizes[3]).toEqual({
      key: 'original',
      label: 'Original',
      url: 'https://blob.example.com/original.avif',
    });
  });

  it('generates S/M/L from sizesMap original when no pre-computed sizes', () => {
    const sizesMap = {
      original: 'https://example.blob.vercel-storage.com/photo.avif',
    };

    const sizes = buildAvatarSizes(sizesMap, null);

    expect(sizes).toHaveLength(4);
    expect(sizes[0].key).toBe('small');
    expect(sizes[0].url).toContain('/_next/image');
    expect(sizes[3].key).toBe('original');
  });
});
