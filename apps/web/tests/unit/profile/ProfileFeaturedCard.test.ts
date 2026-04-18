import { describe, expect, it } from 'vitest';
import { resolveFeaturedContent } from '@/features/profile/ProfileFeaturedCard';

describe('resolveFeaturedContent', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');

  it('prioritizes the next upcoming tour date over a release', () => {
    const result = resolveFeaturedContent(
      [
        {
          id: 'tour-early',
          startDate: '2026-03-30T20:00:00.000Z',
          venueName: 'First Venue',
        },
        {
          id: 'tour-later',
          startDate: '2026-04-02T20:00:00.000Z',
          venueName: 'Second Venue',
        },
      ] as any,
      {
        title: 'Latest Release',
        slug: 'latest-release',
        artworkUrl: null,
        releaseDate: '2026-03-20T00:00:00.000Z',
        releaseType: 'single',
      },
      now
    );

    expect(result).toMatchObject({
      kind: 'tour',
      tourDate: { id: 'tour-early' },
    });
  });

  it('falls back to the latest release when no upcoming tour dates exist', () => {
    const result = resolveFeaturedContent(
      [
        {
          id: 'tour-past',
          startDate: '2026-03-01T20:00:00.000Z',
          venueName: 'Past Venue',
        },
      ] as any,
      {
        title: 'Latest Release',
        slug: 'latest-release',
        artworkUrl: null,
        releaseDate: '2026-03-20T00:00:00.000Z',
        releaseType: 'single',
      },
      now
    );

    expect(result).toMatchObject({
      kind: 'release',
      release: { slug: 'latest-release' },
    });
  });

  it('uses the subscribe fallback when neither tour dates nor a release exist', () => {
    expect(resolveFeaturedContent([], null, now)).toEqual({
      kind: 'fallback',
    });
  });
});
