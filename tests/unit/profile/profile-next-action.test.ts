import { describe, expect, it } from 'vitest';
import { resolveProfileNextAction } from '@/lib/profile-next-action';
import type { LegacySocialLink } from '@/types/db';

function link(platform: string, url: string): LegacySocialLink {
  return {
    id: platform,
    artist_id: 'artist',
    platform,
    url,
    clicks: 0,
    created_at: new Date().toISOString(),
  };
}

describe('resolveProfileNextAction', () => {
  it('prioritizes tickets over shop and spotify', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('bandcamp', 'https://example.com/shop'),
        link('songkick', 'https://example.com/tickets'),
        link('spotify', 'https://example.com/spotify'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('tickets');
    expect('url' in result && result.url).toBe('https://example.com/tickets');
  });

  it('prioritizes shop over spotify', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('bandcamp', 'https://example.com/shop'),
        link('spotify', 'https://example.com/spotify'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('shop');
  });

  it('only returns spotify when spotifyPreferred is true', () => {
    const withPref = resolveProfileNextAction({
      socialLinks: [link('spotify', 'https://example.com/spotify')],
      spotifyPreferred: true,
    });

    expect(withPref.kind).toBe('spotify');

    const withoutPref = resolveProfileNextAction({
      socialLinks: [link('spotify', 'https://example.com/spotify')],
      spotifyPreferred: false,
    });

    expect(withoutPref.kind).toBe('listen');
  });
});
