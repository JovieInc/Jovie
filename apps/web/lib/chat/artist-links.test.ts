import { describe, expect, it } from 'vitest';
import {
  findProfileLink,
  MAX_PROMPT_LINKS,
  normalizeProfileLinks,
} from './artist-links';
import { buildProfileLinksPromptSection } from './system-prompt';

describe('normalizeProfileLinks', () => {
  it('dedupes scheme, www and trailing-slash variants and drops blanks', () => {
    const links = normalizeProfileLinks([
      { platform: 'YouTube', url: 'https://www.youtube.com/@timwhite' },
      { platform: 'youtube', url: 'http://youtube.com/@timwhite/' },
      { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1' },
      { platform: null, url: 'https://x.example' },
      { platform: 'instagram', url: '  ' },
    ]);
    expect(links).toEqual([
      { platform: 'youtube', url: 'https://www.youtube.com/@timwhite' },
      { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1' },
    ]);
  });
});

describe('findProfileLink', () => {
  it('prefers the @handle URL for a platform', () => {
    const links = [
      { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1' },
      { platform: 'youtube', url: 'https://www.youtube.com/@timwhite' },
    ];
    expect(findProfileLink(links, 'youtube')?.url).toBe(
      'https://www.youtube.com/@timwhite'
    );
    expect(findProfileLink(links, 'tiktok')).toBeNull();
  });
});

describe('buildProfileLinksPromptSection', () => {
  it('lists links and connection state without settings-page language', () => {
    const section = buildProfileLinksPromptSection({
      links: [{ platform: 'youtube', url: 'https://www.youtube.com/@a' }],
      connectedAccounts: ['spotify'],
    });
    expect(section).toContain('- youtube: https://www.youtube.com/@a');
    expect(section).toContain('YouTube: not connected');
    expect(section).toContain('Spotify: connected (OAuth)');
    expect(section).not.toMatch(/settings page/i);
  });

  it('caps the list and says none when empty', () => {
    const many = Array.from({ length: MAX_PROMPT_LINKS + 5 }, (_, i) => ({
      platform: 'website',
      url: `https://site${i}.example`,
    }));
    const section = buildProfileLinksPromptSection({
      links: many,
      connectedAccounts: [],
    });
    expect(section.match(/- website:/g)).toHaveLength(MAX_PROMPT_LINKS);
    expect(buildProfileLinksPromptSection(undefined)).toContain('- none yet');
  });
});
