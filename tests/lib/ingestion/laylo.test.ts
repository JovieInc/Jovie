import { describe, expect, it } from 'vitest';
import {
  extractLaylo,
  extractLayloHandle,
  isLayloUrl,
  normalizeLayloHandle,
  validateLayloUrl,
} from '@/lib/ingestion/strategies/laylo';

describe('Laylo strategy', () => {
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

    const layloLink = result.links.find(link => {
      try {
        const hostname = new URL(link.url).hostname
          .replace(/\.$/, '')
          .toLowerCase();
        return hostname === 'laylo.com' || hostname.endsWith('.laylo.com');
      } catch {
        return false;
      }
    });
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
});
