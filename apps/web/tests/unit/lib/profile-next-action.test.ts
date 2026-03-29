import { describe, expect, it } from 'vitest';
import { resolveProfileNextAction } from '@/lib/profile-next-action';

const link = (platform: string, url: string) => ({
  platform,
  url,
  id: platform,
  displayName: platform,
  clicks: 0,
  type: 'social' as const,
});

describe('resolveProfileNextAction', () => {
  it('returns tickets when ticket link exists', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Bandsintown', 'https://bandsintown.com/artist'),
        link('Spotify', 'https://open.spotify.com/artist/123'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('tickets');
    if (result.kind === 'tickets') {
      expect(result.url).toBe('https://bandsintown.com/artist');
    }
  });

  it('returns shop when shop link exists and no tickets', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Bandcamp', 'https://artist.bandcamp.com'),
        link('Spotify', 'https://open.spotify.com/artist/123'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('shop');
    if (result.kind === 'shop') {
      expect(result.url).toBe('https://artist.bandcamp.com');
    }
  });

  it('returns spotify when preferred and no tickets/shop', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Spotify', 'https://open.spotify.com/artist/123'),
        link('Instagram', 'https://instagram.com/artist'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('spotify');
    if (result.kind === 'spotify') {
      expect(result.url).toBe('https://open.spotify.com/artist/123');
    }
  });

  it('skips spotify when not preferred', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Spotify', 'https://open.spotify.com/artist/123'),
      ],
      spotifyPreferred: false,
    });

    expect(result.kind).toBe('listen');
  });

  it('returns listen as fallback with no matching links', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Instagram', 'https://instagram.com/artist'),
        link('Twitter', 'https://twitter.com/artist'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('listen');
  });

  it('returns listen with empty links', () => {
    const result = resolveProfileNextAction({
      socialLinks: [],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('listen');
  });

  it('prioritizes tickets over shop and spotify', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('Bandcamp', 'https://artist.bandcamp.com'),
        link('Ticketmaster', 'https://ticketmaster.com/event'),
        link('Spotify', 'https://open.spotify.com/artist/123'),
      ],
      spotifyPreferred: true,
    });

    expect(result.kind).toBe('tickets');
  });

  it('handles case-insensitive platform matching', () => {
    const result = resolveProfileNextAction({
      socialLinks: [
        link('BANDSINTOWN', 'https://bandsintown.com/a'),
      ],
      spotifyPreferred: false,
    });

    expect(result.kind).toBe('tickets');
  });

  it('matches songkick as ticket platform', () => {
    const result = resolveProfileNextAction({
      socialLinks: [link('Songkick', 'https://songkick.com/artist')],
      spotifyPreferred: false,
    });

    expect(result.kind).toBe('tickets');
  });

  it('matches merch as shop platform', () => {
    const result = resolveProfileNextAction({
      socialLinks: [link('Merch', 'https://merch.store/artist')],
      spotifyPreferred: false,
    });

    expect(result.kind).toBe('shop');
  });
});
