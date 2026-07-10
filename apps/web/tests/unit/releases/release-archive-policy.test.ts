import { describe, expect, it } from 'vitest';
import {
  isProviderIngestedSource,
  isReleasePublished,
  shouldArchiveOnlyRelease,
} from '@/lib/releases/release-archive-policy';

describe('release-archive-policy (JOV-3885)', () => {
  it('treats only ingested/admin source types as provider-ingested', () => {
    expect(isProviderIngestedSource('ingested')).toBe(true);
    expect(isProviderIngestedSource('admin')).toBe(true);
    expect(isProviderIngestedSource('manual')).toBe(false);
    expect(isProviderIngestedSource(null)).toBe(false);
    expect(isProviderIngestedSource(undefined)).toBe(false);
  });

  it('treats released status or past release date as published', () => {
    expect(
      isReleasePublished({ status: 'released', releaseDate: undefined })
    ).toBe(true);
    expect(
      isReleasePublished({
        status: 'draft',
        releaseDate: '2020-01-01T00:00:00.000Z',
      })
    ).toBe(true);
    expect(
      isReleasePublished({
        status: 'draft',
        releaseDate: '2099-01-01T00:00:00.000Z',
      })
    ).toBe(false);
    expect(
      isReleasePublished({ status: 'scheduled', releaseDate: undefined })
    ).toBe(false);
  });

  it('archives only provider-ingested published releases', () => {
    expect(
      shouldArchiveOnlyRelease({
        status: 'released',
        sourceType: 'ingested',
        releaseDate: '2020-01-01T00:00:00.000Z',
      })
    ).toBe(true);
    expect(
      shouldArchiveOnlyRelease({
        status: 'released',
        sourceType: 'manual',
        releaseDate: '2020-01-01T00:00:00.000Z',
      })
    ).toBe(false);
    expect(
      shouldArchiveOnlyRelease({
        status: 'draft',
        sourceType: 'ingested',
        releaseDate: '2099-01-01T00:00:00.000Z',
      })
    ).toBe(false);
  });
});
