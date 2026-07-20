import { describe, expect, it } from 'vitest';
import {
  classifySearchResults,
  summarizeQualifiedShare,
} from '@/lib/profile-search/classification';

const result = (position: number, normalizedUrl: string) => ({
  position,
  title: `Result ${position}`,
  snippet: null,
  url: normalizedUrl,
  normalizedUrl,
});

describe('profile search classification', () => {
  const surfaces = [
    {
      id: 'jovie',
      kind: 'jovie',
      normalizedUrl: 'https://jov.ie/tim',
      qualificationStatus: 'qualified',
    },
    {
      id: 'website',
      kind: 'website',
      normalizedUrl: 'https://timwhite.com',
      qualificationStatus: 'qualified',
    },
    {
      id: 'instagram',
      kind: 'social',
      normalizedUrl: 'https://instagram.com/timwhite',
      qualificationStatus: 'qualified',
    },
    {
      id: 'conflict',
      kind: 'authority',
      normalizedUrl: 'https://musicbrainz.org/artist/wrong',
      qualificationStatus: 'conflicting',
    },
  ];

  it('distinguishes owned, aligned, qualified, conflicting, and unknown', () => {
    const classified = classifySearchResults(
      [
        result(1, 'https://jov.ie/tim'),
        result(2, 'https://timwhite.com/music'),
        result(3, 'https://instagram.com/timwhite'),
        result(4, 'https://musicbrainz.org/artist/wrong'),
        result(5, 'https://example.com/other'),
      ],
      surfaces
    );

    expect(classified.map(item => item.classification)).toEqual([
      'owned',
      'aligned',
      'qualified',
      'conflicting',
      'unknown',
    ]);
    expect(summarizeQualifiedShare(classified)).toMatchObject({
      owned: 1,
      aligned: 1,
      qualified: 1,
      conflicting: 1,
      unknown: 1,
      qualifiedCount: 3,
      qualifiedShare: 0.6,
    });
  });

  it('never matches a shared platform by domain alone', () => {
    const [classified] = classifySearchResults(
      [result(1, 'https://instagram.com/someone-else')],
      surfaces
    );
    expect(classified).toMatchObject({
      classification: 'unknown',
      surfaceId: null,
    });
  });

  it('reports no share when the result set is empty', () => {
    expect(summarizeQualifiedShare([]).qualifiedShare).toBeNull();
  });
});
