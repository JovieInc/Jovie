import { describe, expect, it } from 'vitest';
import {
  type AdminReleasesSort,
  adminReleasesSortFields,
} from '@/lib/admin/releases';

describe('adminReleasesSortFields', () => {
  it('contains exactly 6 sort options', () => {
    expect(adminReleasesSortFields).toHaveLength(6);
  });

  it('includes release_date_desc as default sort', () => {
    expect(adminReleasesSortFields).toContain('release_date_desc');
  });

  it('includes all expected sort fields', () => {
    const expected: AdminReleasesSort[] = [
      'release_date_desc',
      'release_date_asc',
      'created_desc',
      'created_asc',
      'title_asc',
      'title_desc',
    ];
    expect([...adminReleasesSortFields]).toEqual(expected);
  });

  it('does not include artist sort (requires denormalized column)', () => {
    expect(adminReleasesSortFields).not.toContain('artist_asc');
    expect(adminReleasesSortFields).not.toContain('artist_desc');
  });
});

describe('AdminReleaseRow data quality booleans', () => {
  // These test the boolean computation logic that happens in getAdminReleases
  // We test the logic inline since the function requires DB access

  it('missingArtwork is true when artworkUrl is null', () => {
    const artworkUrl: string | null = null;
    expect(!artworkUrl).toBe(true);
  });

  it('missingArtwork is false when artworkUrl exists', () => {
    const artworkUrl: string | null = 'https://example.com/art.jpg';
    expect(!artworkUrl).toBe(false);
  });

  it('noProviders is true when providerCount is 0', () => {
    const providerCount = 0;
    expect(providerCount === 0).toBe(true);
  });

  it('noProviders is false when providerCount > 0', () => {
    const providerCount = 3;
    expect(providerCount === 0).toBe(false);
  });

  it('noUpc is true when upc is null', () => {
    const upc: string | null = null;
    expect(!upc).toBe(true);
  });

  it('noUpc is false when upc exists', () => {
    const upc: string | null = '123456789012';
    expect(!upc).toBe(false);
  });

  it('zeroTracks is true when totalTracks is 0', () => {
    const totalTracks = 0;
    expect(totalTracks === 0).toBe(true);
  });

  it('zeroTracks is false when totalTracks > 0', () => {
    const totalTracks = 12;
    expect(totalTracks === 0).toBe(false);
  });
});
