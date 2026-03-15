import { describe, expect, it } from 'vitest';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';

describe('buildAvatarSizes', () => {
  it('returns empty array when no sizesMap or avatarUrl', () => {
    expect(buildAvatarSizes(null, null)).toEqual([]);
    expect(buildAvatarSizes(undefined, undefined)).toEqual([]);
  });

  it('generates medium/large variants via Next.js image optimization for avatarUrl', () => {
    const sizes = buildAvatarSizes(
      null,
      'https://example.blob.vercel-storage.com/avatars/photo.avif'
    );

    expect(sizes).toHaveLength(3);
    expect(sizes[0].key).toBe('medium');
    expect(sizes[0].label).toBe('Medium (400 x 400)');
    expect(sizes[0].url).toContain('/_next/image?');
    expect(sizes[0].url).toContain('w=400');

    expect(sizes[1].key).toBe('large');
    expect(sizes[1].label).toBe('Large (1000 x 1000)');
    expect(sizes[1].url).toContain('w=1000');

    expect(sizes[2].key).toBe('original');
    expect(sizes[2].url).toBe(
      'https://example.blob.vercel-storage.com/avatars/photo.avif'
    );
  });

  it('generates medium/large via Next.js image optimization for any URL', () => {
    const sizes = buildAvatarSizes(null, 'https://img.clerk.com/avatar.jpg');

    expect(sizes).toHaveLength(3);
    expect(sizes[0].key).toBe('medium');
    expect(sizes[0].url).toContain('/_next/image?');
    expect(sizes[0].url).toContain('w=400');

    expect(sizes[1].key).toBe('large');
    expect(sizes[1].url).toContain('w=1000');

    expect(sizes[2].key).toBe('original');
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

  it('generates medium/large from sizesMap original when no pre-computed sizes', () => {
    const sizesMap = {
      original: 'https://example.blob.vercel-storage.com/photo.avif',
    };

    const sizes = buildAvatarSizes(sizesMap, null);

    expect(sizes).toHaveLength(3);
    expect(sizes[0].key).toBe('medium');
    expect(sizes[0].url).toContain('/_next/image');
    expect(sizes[2].key).toBe('original');
  });

  it('encodes Supabase avatar URLs correctly for Next.js image optimizer variants', () => {
    const avatarUrl =
      'https://abc123.supabase.co/storage/v1/object/public/avatars/user 1/avatar.png?download=1';

    const sizes = buildAvatarSizes(null, avatarUrl);
    const mediumUrl = new URL(sizes[0].url, 'https://jov.ie');
    const largeUrl = new URL(sizes[1].url, 'https://jov.ie');

    expect(mediumUrl.pathname).toBe('/_next/image');
    expect(mediumUrl.searchParams.get('url')).toBe(avatarUrl);
    expect(mediumUrl.searchParams.get('w')).toBe('400');

    expect(largeUrl.pathname).toBe('/_next/image');
    expect(largeUrl.searchParams.get('url')).toBe(avatarUrl);
    expect(largeUrl.searchParams.get('w')).toBe('1000');
  });
});
