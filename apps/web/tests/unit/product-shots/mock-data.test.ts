import { describe, expect, it } from 'vitest';
import {
  MOCK_ARTIST,
  MOCK_CONTACTS,
  MOCK_SOCIAL_LINKS,
} from '@/features/product-shots/mock-data/artist-profile-data';

describe('artist profile mock data', () => {
  it('MOCK_ARTIST has required fields for StaticArtistPage', () => {
    expect(MOCK_ARTIST.id).toBeTruthy();
    expect(MOCK_ARTIST.name).toBeTruthy();
    expect(MOCK_ARTIST.handle).toBeTruthy();
    expect(MOCK_ARTIST.image_url).toBeTruthy();
    expect(MOCK_ARTIST.published).toBe(true);
  });

  it('MOCK_SOCIAL_LINKS are valid', () => {
    expect(MOCK_SOCIAL_LINKS.length).toBeGreaterThan(0);
    for (const link of MOCK_SOCIAL_LINKS) {
      expect(link.id).toBeTruthy();
      expect(link.artist_id).toBe(MOCK_ARTIST.id);
      expect(link.platform).toBeTruthy();
      expect(link.url).toMatch(/^https?:\/\//);
    }
  });

  it('MOCK_CONTACTS is an array', () => {
    expect(Array.isArray(MOCK_CONTACTS)).toBe(true);
  });
});
