import { describe, expect, it } from 'vitest';
import {
  GENERIC_PLATFORM_LINK_CONFIG,
  normalizePlatformSlug,
  platformLinkLabel,
  toGenericPlatformLink,
} from '@/lib/platform-links';

describe('toGenericPlatformLink', () => {
  it('builds a URL + label link for an unknown platform', () => {
    const link = toGenericPlatformLink('discord', 'https://discord.gg/abc');
    expect(link).not.toBeNull();
    expect(link?.name).toBe('Discord');
    expect(link?.url).toBe('https://discord.gg/abc');
    expect(link?.platformKey).toBeNull();
    expect(link?.config).toBe(GENERIC_PLATFORM_LINK_CONFIG);
  });

  it('derives a label from the hostname when platform is missing', () => {
    const link = toGenericPlatformLink(null, 'https://www.substack.com/@me');
    expect(link?.name).toBe('Substack');
  });

  it('returns null for invalid URLs', () => {
    expect(toGenericPlatformLink('discord', 'not-a-url')).toBeNull();
    expect(toGenericPlatformLink('discord', 'ftp://x.com')).toBeNull();
    expect(toGenericPlatformLink('discord', '')).toBeNull();
    expect(toGenericPlatformLink('discord', null)).toBeNull();
  });
});

describe('platformLinkLabel', () => {
  it('prettifies snake and kebab platform names', () => {
    expect(platformLinkLabel('apple_podcasts', 'https://x.com')).toBe(
      'Apple Podcasts'
    );
    expect(platformLinkLabel('band-page', 'https://x.com')).toBe('Band Page');
  });
});

describe('normalizePlatformSlug', () => {
  it('normalizes separators and casing', () => {
    expect(normalizePlatformSlug('My Platform!')).toBe('my_platform');
  });
});
