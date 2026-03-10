import { describe, expect, it } from 'vitest';
import {
  applyPublicProfileLinkCaps,
  capProfileLinkInputs,
} from '@/lib/profile/social-link-limits';
import { getContextAwareLinks } from '@/lib/utils/context-aware-links';
import type { LegacySocialLink } from '@/types/db';

const createLink = (
  id: string,
  platform: string,
  url: string
): LegacySocialLink => ({
  id,
  artist_id: 'artist-1',
  platform,
  url,
  clicks: 0,
  created_at: new Date().toISOString(),
});

describe('social link limits', () => {
  it('keeps up to 4 mode links and trims social links to fit max total 6', () => {
    const links = [
      createLink('m1', 'spotify', 'https://open.spotify.com/artist/1'),
      createLink('m2', 'apple_music', 'https://music.apple.com/us/artist/1'),
      createLink('m3', 'soundcloud', 'https://soundcloud.com/artist-1'),
      createLink('m4', 'bandcamp', 'https://artist.bandcamp.com'),
      createLink('s1', 'instagram', 'https://instagram.com/artist'),
      createLink('s2', 'tiktok', 'https://tiktok.com/@artist'),
      createLink('s3', 'youtube', 'https://youtube.com/@artist'),
    ];

    const result = applyPublicProfileLinkCaps(links);

    expect(result.modeLinks).toHaveLength(4);
    expect(result.socialLinks).toHaveLength(2);
    expect(result.socialLinks.map(link => link.id)).toEqual(['s1', 's2']);
  });

  it('allows social links to scale up when mode links are fewer than four', () => {
    const links = [
      createLink('m1', 'spotify', 'https://open.spotify.com/artist/1'),
      createLink('s1', 'instagram', 'https://instagram.com/artist'),
      createLink('s2', 'tiktok', 'https://tiktok.com/@artist'),
      createLink('s3', 'youtube', 'https://youtube.com/@artist'),
      createLink('s4', 'facebook', 'https://facebook.com/artist'),
      createLink('s5', 'twitter', 'https://x.com/artist'),
    ];

    const result = applyPublicProfileLinkCaps(links);
    expect(result.modeLinks).toHaveLength(1);
    expect(result.socialLinks).toHaveLength(5);
  });

  it('caps API payloads with the same rules', () => {
    const payload = capProfileLinkInputs([
      { platform: 'spotify', url: 'https://open.spotify.com/artist/1' },
      { platform: 'apple_music', url: 'https://music.apple.com/us/artist/1' },
      { platform: 'instagram', url: 'https://instagram.com/artist' },
      { platform: 'tiktok', url: 'https://tiktok.com/@artist' },
      { platform: 'youtube', url: 'https://youtube.com/@artist' },
      { platform: 'twitter', url: 'https://x.com/artist' },
      { platform: 'facebook', url: 'https://facebook.com/artist' },
    ]);

    expect(payload).toHaveLength(6);
    expect(payload.map(link => link.platform)).toEqual([
      'spotify',
      'apple_music',
      'instagram',
      'tiktok',
      'youtube',
      'twitter',
    ]);
  });
});

describe('context-aware link ordering', () => {
  it('prioritizes source platform link first when detected', () => {
    const links = [
      createLink('1', 'twitter', 'https://x.com/artist'),
      createLink('2', 'instagram', 'https://instagram.com/artist'),
      createLink('3', 'youtube', 'https://youtube.com/@artist'),
    ];

    const result = getContextAwareLinks(links, 'instagram');
    expect(result.map(link => link.platform)).toEqual([
      'instagram',
      'twitter',
      'youtube',
    ]);
  });
});
