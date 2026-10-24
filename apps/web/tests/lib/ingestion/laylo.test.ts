import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  isLayloUrl,
  normalizeLayloHandle,
  validateLayloUrl,
} from '@/lib/ingestion/strategies/laylo';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const getHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

describe('Laylo strategy', () => {
  afterEach(() => vi.restoreAllMocks());

  it('validates laylo profile URLs', () => {
    expect(isLayloUrl('https://laylo.com/mochakk')).toBe(true);
    expect(validateLayloUrl('https://www.laylo.com/MochaKK')).toBe(
      'https://laylo.com/mochakk'
    );
    expect(extractLayloHandle('https://laylo.com/@artist')).toBe('artist');
    expect(normalizeLayloHandle(' Artist ')).toBe('artist');
  });

  it('extracts socials, laylo link, display name, and avatar', () => {
    const profile = {
      user: { id: 'user123', username: 'mochakk' },
      gallery: [{ url: 'https://cdn.example.com/gallery-avatar.jpg' }],
    };

    const user = {
      displayName: 'MOCHAKK',
      imageUrl: 'https://cdn.example.com/profile-avatar.jpg',
      instagram: 'https://www.instagram.com/mochakk/',
      twitter: 'https://twitter.com/MochakkMusic',
      youtube: 'https://www.youtube.com/c/Mochakk',
      tiktok: 'https://www.tiktok.com/@mochakk',
      spotify: 'https://open.spotify.com/artist/123',
      store: 'https://www.mochakk.com/',
    };

    const result = extractLaylo(profile, user);

    expect(result.displayName).toBe('MOCHAKK');
    expect(result.avatarUrl).toBe(user.imageUrl);

    const layloLink = result.links.find(
      link => getHostname(link.url) === 'laylo.com'
    );
    expect(layloLink?.sourcePlatform).toBe('laylo');

    const socials = result.links.filter(
      link => link.sourcePlatform === 'laylo'
    );
    expect(socials.length).toBeGreaterThan(3);
    socials.forEach(link => {
      expect(link.evidence?.sources).toContain('laylo');
      expect(
        link.evidence?.signals?.some(signal => signal.includes('laylo'))
      ).toBe(true);
    });
  });

  it('fetches profile and user JSON from Laylo CloudFront hosts', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: 'user123', username: 'artist' } })
      )
      .mockResolvedValueOnce(jsonResponse({ displayName: 'Artist' }));

    const result = await fetchLayloProfile('Artist');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://d21i0hc4hl3bvt.cloudfront.net/artist/profile.json'
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://d3oyaxbt9vo0fg.cloudfront.net/users/user123.json'
    );
    expect(result.profile.user?.id).toBe('user123');
    expect(result.user?.displayName).toBe('Artist');
  });

  it('still rejects redirects to hosts outside the Laylo fetch allowlist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.com/profile.json' },
      })
    );

    await expect(fetchLayloProfile('artist')).rejects.toMatchObject({
      code: 'INVALID_HOST',
    });
  });
});
