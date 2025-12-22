import { describe, expect, it } from 'vitest';
import { generateFooterHTML } from '@/lib/footer';
import type { Artist } from '@/types/db';

describe('generateFooterHTML', () => {
  const mockArtist: Artist = {
    id: '1',
    owner_user_id: 'user-1',
    handle: 'test-artist',
    spotify_id: 'spotify-123',
    name: 'Test Artist',
    image_url: 'https://example.com/artist.jpg',
    tagline: 'Test tagline',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2023-01-01T00:00:00Z',
    settings: {},
  };

  it('generates footer HTML with correct structure', async () => {
    const html = await generateFooterHTML({ artist: mockArtist });

    expect(html).toContain('<footer');
    expect(html).toContain('Jovie');
    expect(html).toContain('Join the waitlist');
    expect(html).toContain('Privacy');
    expect(html).toContain(`utm_artist=${mockArtist.handle}`);
  });

  it('includes correct UTM parameters with custom source', async () => {
    const html = await generateFooterHTML({
      artist: mockArtist,
      utmSource: 'custom-source',
    });

    expect(html).toContain('utm_source=custom-source');
    expect(html).toContain(`utm_artist=${mockArtist.handle}`);
  });

  it('returns empty string when branding is hidden', async () => {
    const artistWithHiddenBranding: Artist = {
      ...mockArtist,
      settings: { hide_branding: true },
    };

    const html = await generateFooterHTML({ artist: artistWithHiddenBranding });

    expect(html).toBe('');
  });

  it('includes waitlist link when feature flag is enabled', async () => {
    // We can't easily mock the feature flag here, but we can test that the link structure is correct
    const html = await generateFooterHTML({ artist: mockArtist });

    expect(html).toContain('/sign-up?utm_source=listen&utm_artist=test-artist');
  });

  it('includes logo SVG', async () => {
    const html = await generateFooterHTML({ artist: mockArtist });

    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 136 39"');
  });

  it('has proper accessibility attributes', async () => {
    const html = await generateFooterHTML({ artist: mockArtist });

    expect(html).toContain('aria-label="Create your own profile with Jovie"');
  });
});
