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
