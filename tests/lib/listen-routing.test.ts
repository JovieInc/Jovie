import { describe, expect, it } from 'vitest';
import {
  buildProviderCandidates,
  extractCreatorDefaultProvider,
  normalizeProviderKey,
  type ProviderLink,
  selectProvider,
} from '@/lib/listen-routing';

const baseProfile = {
  id: 'creator-id',
  username: 'artist',
  spotifyUrl: 'https://open.spotify.com/artist/abc',
  appleMusicUrl: 'https://music.apple.com/artist/abc',
  youtubeUrl: 'https://youtube.com/@artist',
  spotifyId: 'abc',
  settings: {},
  socialLinks: [
    {
      id: 'link-1',
      platform: 'spotify',
      platformType: 'dsp',
      url: 'https://open.spotify.com/artist/abc',
      isActive: true,
    },
  ],
};

describe('normalizeProviderKey', () => {
  it('normalizes aliases and whitespace', () => {
    expect(normalizeProviderKey(' Apple Music ')).toBe('apple_music');
    expect(normalizeProviderKey('YouTube-Music')).toBe('youtube_music');
    expect(normalizeProviderKey('spotify')).toBe('spotify');
  });
});

describe('selectProvider', () => {
  const providers: ProviderLink[] = [
    { key: 'spotify', url: 'https://spotify.com', targetKind: 'artist' },
    { key: 'apple_music', url: 'https://apple.com', targetKind: 'artist' },
  ];

  it('prefers forced provider when available', () => {
    const result = selectProvider(providers, {
      forcedProvider: 'apple_music',
      creatorDefault: null,
      cookieProvider: null,
      userAgent: null,
    });

    expect(result.provider?.key).toBe('apple_music');
    expect(result.forcedProviderKey).toBe('apple_music');
  });

  it('falls back to creator default when no force applied', () => {
    const result = selectProvider(providers, {
      forcedProvider: null,
      creatorDefault: 'apple_music',
      cookieProvider: null,
      userAgent: null,
    });

    expect(result.provider?.key).toBe('apple_music');
  });

  it('uses platform heuristics when no other hints', () => {
    const result = selectProvider(providers, {
      forcedProvider: null,
      creatorDefault: null,
      cookieProvider: null,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1',
    });

    expect(result.provider?.key).toBe('apple_music');
  });
});

describe('buildProviderCandidates', () => {
  it('dedupes providers and adds profile fallbacks', () => {
    const candidates = buildProviderCandidates(baseProfile, {
      releaseCode: 'abc123',
      entry: {
        code: 'abc123',
        providers: [
          {
            key: 'spotify',
            url: 'https://open.spotify.com/track/xyz',
            targetKind: 'release',
          },
        ],
      },
    });

    const keys = candidates.map(c => c.key);
    expect(keys).toContain('spotify');
    expect(keys).toContain('apple_music');
    expect(keys).toContain('youtube');
  });

  it('honors creator default provider extraction', () => {
    const defaultProvider = extractCreatorDefaultProvider({
      preferredDSP: 'spotify',
      listen: { defaultProvider: 'apple_music' },
    });

    expect(defaultProvider).toBe('apple_music');
  });
});
