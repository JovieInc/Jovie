import { describe, expect, it } from 'vitest';
import type { SanitizedArtist } from './sanitize';
import type { ScoredNeighbour } from './scoring';
import {
  assessAuthenticity,
  compareSize,
  computeGenreOverlap,
  computeHealthScore,
  generateHealthReport,
  generateUnavailableHealthReport,
  isSpotifyErrorPageHtml,
  scoreNeighbour,
} from './scoring';

// ─── Test Helpers ────────────────────────────────────────

function makeArtist(overrides: Partial<SanitizedArtist> = {}): SanitizedArtist {
  return {
    spotifyId: 'test-id',
    name: 'Test Artist',
    bio: null,
    imageUrl: null,
    genres: [],
    followerCount: 1000,
    popularity: 50,
    externalUrls: {},
    ...overrides,
  };
}

// ─── compareSize ─────────────────────────────────────────

describe('compareSize', () => {
  it('returns BIGGER when neighbour popularity exceeds threshold', () => {
    expect(compareSize(50, 1000, 56, 500)).toBe('BIGGER');
    expect(compareSize(10, 9907, 25, 22937)).toBe('BIGGER');
  });

  it('returns SMALLER when neighbour popularity below threshold', () => {
    expect(compareSize(50, 1000, 44, 2000)).toBe('SMALLER');
    expect(compareSize(50, 1000, 30, 50000)).toBe('SMALLER');
  });

  it('uses followers as tiebreaker within 5 points', () => {
    // Within 5 points, more followers → BIGGER
    expect(compareSize(50, 1000, 52, 2000)).toBe('BIGGER');
    // Within 5 points, fewer followers → SMALLER
    expect(compareSize(50, 1000, 48, 500)).toBe('SMALLER');
  });

  it('returns SIMILAR when within threshold and equal followers', () => {
    expect(compareSize(50, 1000, 53, 1000)).toBe('SIMILAR');
    expect(compareSize(50, 1000, 50, 1000)).toBe('SIMILAR');
  });

  it('handles zero values', () => {
    expect(compareSize(0, 0, 0, 0)).toBe('SIMILAR');
    expect(compareSize(0, 0, 6, 100)).toBe('BIGGER');
    expect(compareSize(10, 100, 0, 0)).toBe('SMALLER');
  });

  it('handles exact threshold boundary', () => {
    // Exactly 5 points difference: NOT bigger (must exceed)
    expect(compareSize(50, 1000, 55, 2000)).toBe('BIGGER'); // tiebreaker
    // Exactly -5 points: NOT smaller
    expect(compareSize(50, 1000, 45, 500)).toBe('SMALLER'); // tiebreaker
  });
});

// ─── computeGenreOverlap ────────────────────────────────

describe('computeGenreOverlap', () => {
  it('returns 1.0 for identical genres', () => {
    expect(computeGenreOverlap(['pop', 'rock'], ['pop', 'rock'])).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(computeGenreOverlap(['pop'], ['metal'])).toBe(0);
  });

  it('returns correct partial overlap', () => {
    // intersection = 1 (pop), union = 3 (pop, rock, metal)
    expect(computeGenreOverlap(['pop', 'rock'], ['pop', 'metal'])).toBeCloseTo(
      1 / 3
    );
  });

  it('returns 0 for empty arrays', () => {
    expect(computeGenreOverlap([], [])).toBe(0);
    expect(computeGenreOverlap(['pop'], [])).toBe(0);
    expect(computeGenreOverlap([], ['pop'])).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(computeGenreOverlap(['Pop', 'ROCK'], ['pop', 'rock'])).toBe(1);
  });

  it('handles single-element arrays', () => {
    expect(computeGenreOverlap(['pop'], ['pop'])).toBe(1);
  });
});

// ─── assessAuthenticity ──────────────────────────────────

describe('assessAuthenticity', () => {
  it('returns CLEAN for a normal artist', () => {
    const artist = makeArtist({
      popularity: 25,
      followerCount: 10000,
      genres: ['pop', 'electronic'],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CLEAN');
    expect(result.reasons).toHaveLength(0);
  });

  it('flags high followers with near-zero popularity', () => {
    const artist = makeArtist({
      popularity: 2,
      followerCount: 50000,
      genres: ['pop'],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).not.toBe('CLEAN');
    expect(result.reasons).toContain('High followers but near-zero popularity');
  });

  it('flags no genres despite significant followers', () => {
    const artist = makeArtist({
      popularity: 15,
      followerCount: 5000,
      genres: [],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).not.toBe('CLEAN');
    expect(result.reasons).toContain('No genres despite significant followers');
  });

  it('flags extreme follower/popularity ratio', () => {
    // 100K followers, popularity 10 = ratio of 10000 (> 5000 threshold)
    const artist = makeArtist({
      popularity: 10,
      followerCount: 100000,
      genres: ['pop'],
    });
    const result = assessAuthenticity(artist);
    expect(result.reasons).toContain(
      'Follower count vastly exceeds popularity signal'
    );
  });

  it('returns SUSPECT when 2+ flags fire', () => {
    const artist = makeArtist({
      popularity: 2,
      followerCount: 80000,
      genres: [],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('SUSPECT');
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('returns CAUTION with exactly 1 flag', () => {
    const artist = makeArtist({
      popularity: 3,
      followerCount: 6000,
      genres: ['edm'],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CAUTION');
    expect(result.reasons).toHaveLength(1);
  });

  it('handles zero followers and zero popularity as CLEAN', () => {
    const artist = makeArtist({
      popularity: 0,
      followerCount: 0,
      genres: [],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CLEAN');
  });

  it('does not double-count Flag 1 and Flag 3 at near-zero popularity', () => {
    // Regression: popularity=1, followers=6000 should only trigger Flag 1
    // (near-zero popularity), NOT also Flag 3 (ratio check).
    // Before fix, both flags fired → SUSPECT. Correct: CAUTION (1 flag).
    const artist = makeArtist({
      popularity: 1,
      followerCount: 6000,
      genres: ['electronic'],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CAUTION');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons).toContain('High followers but near-zero popularity');
  });

  it('Flag 3 fires independently when popularity >= 5', () => {
    // popularity=5, followers=30000 → ratio = 6000 > 5000 threshold
    // Flag 1 should NOT fire (popularity >= 5), Flag 3 should fire
    const artist = makeArtist({
      popularity: 5,
      followerCount: 30000,
      genres: ['pop'],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CAUTION');
    expect(result.reasons).toContain(
      'Follower count vastly exceeds popularity signal'
    );
  });

  it('does not flag small artists with no genres', () => {
    // Under 1000 followers, missing genres is normal for tiny artists
    const artist = makeArtist({
      popularity: 3,
      followerCount: 500,
      genres: [],
    });
    const result = assessAuthenticity(artist);
    expect(result.level).toBe('CLEAN');
  });
});

// ─── scoreNeighbour ─────────────────────────────────────

describe('scoreNeighbour', () => {
  it('scores a bigger neighbour correctly', () => {
    const target = makeArtist({ popularity: 10, followerCount: 9907 });
    const neighbour = makeArtist({
      popularity: 25,
      followerCount: 22937,
      genres: ['progressive house'],
    });

    const result = scoreNeighbour(target, neighbour);
    expect(result.size).toBe('BIGGER');
    expect(result.popularityDelta).toBe(15);
    expect(result.followerDelta).toBe(13030);
  });

  it('scores a smaller neighbour correctly', () => {
    const target = makeArtist({ popularity: 50, followerCount: 10000 });
    const neighbour = makeArtist({ popularity: 20, followerCount: 500 });

    const result = scoreNeighbour(target, neighbour);
    expect(result.size).toBe('SMALLER');
    expect(result.popularityDelta).toBe(-30);
  });

  it('computes genre overlap', () => {
    const target = makeArtist({ genres: ['pop', 'electronic'] });
    const neighbour = makeArtist({ genres: ['pop', 'dance'] });

    const result = scoreNeighbour(target, neighbour);
    expect(result.genreOverlap).toBeCloseTo(1 / 3);
  });
});

// ─── computeHealthScore ──────────────────────────────────

describe('computeHealthScore', () => {
  it('returns 100 when all neighbours are bigger', () => {
    const neighbours: ScoredNeighbour[] = [
      {
        artist: makeArtist(),
        size: 'BIGGER',
        popularityDelta: 10,
        followerDelta: 1000,
        genreOverlap: 0.5,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
      {
        artist: makeArtist(),
        size: 'BIGGER',
        popularityDelta: 20,
        followerDelta: 5000,
        genreOverlap: 0.3,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
    ];
    expect(computeHealthScore(neighbours)).toBe(100);
  });

  it('returns 0 when all neighbours are smaller', () => {
    const neighbours: ScoredNeighbour[] = [
      {
        artist: makeArtist(),
        size: 'SMALLER',
        popularityDelta: -10,
        followerDelta: -1000,
        genreOverlap: 0.5,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
      {
        artist: makeArtist(),
        size: 'SMALLER',
        popularityDelta: -20,
        followerDelta: -5000,
        genreOverlap: 0.3,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
    ];
    expect(computeHealthScore(neighbours)).toBe(0);
  });

  it('returns correct percentage for mixed', () => {
    const neighbours: ScoredNeighbour[] = [
      {
        artist: makeArtist(),
        size: 'BIGGER',
        popularityDelta: 10,
        followerDelta: 1000,
        genreOverlap: 0.5,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
      {
        artist: makeArtist(),
        size: 'SMALLER',
        popularityDelta: -10,
        followerDelta: -1000,
        genreOverlap: 0.3,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
      {
        artist: makeArtist(),
        size: 'SIMILAR',
        popularityDelta: 0,
        followerDelta: 0,
        genreOverlap: 1,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
      {
        artist: makeArtist(),
        size: 'BIGGER',
        popularityDelta: 15,
        followerDelta: 3000,
        genreOverlap: 0.7,
        authenticity: { level: 'CLEAN', reasons: [] },
      },
    ];
    // 2 bigger out of 4 = 50%
    expect(computeHealthScore(neighbours)).toBe(50);
  });

  it('returns 0 for empty array', () => {
    expect(computeHealthScore([])).toBe(0);
  });
});

// ─── generateHealthReport ────────────────────────────────

describe('generateHealthReport', () => {
  it('generates a complete ready report with sorted neighbours', () => {
    const target = makeArtist({
      spotifyId: 'target',
      name: 'Tim White',
      popularity: 10,
      followerCount: 9907,
      genres: ['progressive house'],
    });

    const related = [
      makeArtist({
        spotifyId: 'jynx',
        name: 'Jynx',
        popularity: 25,
        followerCount: 22937,
        genres: ['rap metal'],
      }),
      makeArtist({
        spotifyId: 'brother-blake',
        name: 'Brother Blake',
        popularity: 13,
        followerCount: 4365,
        genres: ['pop'],
      }),
      makeArtist({
        spotifyId: 'taryn',
        name: 'Taryn Manning',
        popularity: 21,
        followerCount: 5752,
        genres: ['pop'],
      }),
    ];

    const report = generateHealthReport(target, related, {
      checkedAt: '2026-04-08T03:22:14.406Z',
      attemptedNeighbourCount: 4,
      warnings: ['1 related artist could not be resolved in Spotify search.'],
    });

    expect(report.targetArtist.name).toBe('Tim White');
    expect(report.status).toBe('ready');
    expect(report.neighbours).toHaveLength(3);
    expect(report.summary.bigger).toBe(2); // Jynx + Taryn
    expect(report.summary.smaller).toBe(1); // Brother Blake (within 5pts, fewer followers)
    expect(report.summary.similar).toBe(0);
    expect(report.summary.total).toBe(3);
    if (report.status !== 'ready') {
      throw new Error('Expected ready report');
    }
    expect(report.healthScore).toBe(67); // 2/3 = 66.67 → rounded to 67
    expect(report.verdict.label).toBe('Healthy');
    expect(report.verdict.confidence).toBe('Medium');
    expect(report.checkedAt).toBe('2026-04-08T03:22:14.406Z');
    expect(report.attemptedNeighbourCount).toBe(4);
    expect(report.resolvedNeighbourCount).toBe(3);
    expect(report.warnings).toEqual([
      '1 related artist could not be resolved in Spotify search.',
    ]);

    // Sorted: bigger first
    expect(report.neighbours[0].size).toBe('BIGGER');
    expect(report.neighbours[report.neighbours.length - 1].size).toBe(
      'SMALLER'
    );
  });

  it('handles empty related artists', () => {
    const target = makeArtist();
    const report = generateHealthReport(target, []);

    expect(report.status).toBe('empty');
    expect(report.neighbours).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.verdict.label).toBe('Weak');
    expect(report.nextActions).toHaveLength(2);
  });

  it('builds an unavailable report without a health score', () => {
    const target = makeArtist({ name: 'Tim White' });
    const report = generateUnavailableHealthReport(target, {
      checkedAt: '2026-04-08T03:22:14.406Z',
      warnings: ['Spotify rendered a Page not available response.'],
    });

    expect(report.status).toBe('unavailable');
    expect(report.verdict.label).toBe('Unavailable');
    expect(report.verdict.confidence).toBe('Low');
    expect(report.checkedAt).toBe('2026-04-08T03:22:14.406Z');
    expect(report.summary.total).toBe(0);
    expect('healthScore' in report).toBe(false);
  });
});

describe('isSpotifyErrorPageHtml', () => {
  it('detects Spotify error pages', () => {
    const html = `
      <html>
        <head><title>Page not available</title></head>
        <body><h1>Page not available</h1></body>
      </html>
    `;

    expect(isSpotifyErrorPageHtml(html)).toBe(true);
  });

  it('detects Spotify fallback error copy', () => {
    expect(
      isSpotifyErrorPageHtml(
        '<html><body>Something went wrong, please try again later.</body></html>'
      )
    ).toBe(true);
  });

  it('ignores normal markup', () => {
    expect(isSpotifyErrorPageHtml('<html><title>Artist</title></html>')).toBe(
      false
    );
  });
});
