/**
 * Fit Score Calculator Tests
 *
 * Tests for the calculateFitScore function and related utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateFitScore,
  FIT_SCORE_VERSION,
  type FitScoreInput,
  isLinkInBioPlatform,
  isMusicToolPlatform,
  isTargetGenre,
  LINK_IN_BIO_PLATFORMS,
  MUSIC_TOOL_PLATFORMS,
  SCORE_WEIGHTS,
  TARGET_GENRES,
} from '@/lib/fit-scoring/calculator';

describe('Fit Score Calculator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateFitScore', () => {
    describe('empty input', () => {
      it('should return 0 for empty input', () => {
        const result = calculateFitScore({});
        expect(result.score).toBe(0);
      });

      it('should return valid breakdown structure for empty input', () => {
        const result = calculateFitScore({});
        expect(result.breakdown).toEqual({
          usesLinkInBio: 0,
          paidTier: 0,
          usesMusicTools: 0,
          hasSpotify: 0,
          spotifyPopularity: 0,
          releaseRecency: 0,
          genreMatch: 0,
          meta: {
            calculatedAt: expect.any(String),
            version: FIT_SCORE_VERSION,
          },
        });
      });

      it('should include current timestamp in meta', () => {
        const result = calculateFitScore({});
        expect(result.breakdown.meta?.calculatedAt).toBe(
          '2025-06-15T12:00:00.000Z'
        );
      });
    });

    describe('link-in-bio scoring (+15 points)', () => {
      it('should award 15 points for linktree platform', () => {
        const result = calculateFitScore({
          ingestionSourcePlatform: 'linktree',
        });
        expect(result.breakdown.usesLinkInBio).toBe(
          SCORE_WEIGHTS.USES_LINK_IN_BIO
        );
        expect(result.score).toBe(15);
      });

      it('should award 15 points for beacons platform', () => {
        const result = calculateFitScore({
          ingestionSourcePlatform: 'beacons',
        });
        expect(result.breakdown.usesLinkInBio).toBe(15);
      });

      it('should award 15 points case-insensitively', () => {
        const result = calculateFitScore({
          ingestionSourcePlatform: 'LINKTREE',
        });
        expect(result.breakdown.usesLinkInBio).toBe(15);
      });

      it('should not award points for unknown platforms', () => {
        const result = calculateFitScore({
          ingestionSourcePlatform: 'unknown-platform',
        });
        expect(result.breakdown.usesLinkInBio).toBe(0);
      });

      it('should not award points for null platform', () => {
        const result = calculateFitScore({
          ingestionSourcePlatform: null,
        });
        expect(result.breakdown.usesLinkInBio).toBe(0);
      });

      it.each([
        ...LINK_IN_BIO_PLATFORMS,
      ])('should recognize %s as link-in-bio platform', platform => {
        const result = calculateFitScore({
          ingestionSourcePlatform: platform,
        });
        expect(result.breakdown.usesLinkInBio).toBe(15);
      });
    });

    describe('paid tier scoring (+20 points)', () => {
      it('should award 20 points for paid tier', () => {
        const result = calculateFitScore({
          hasPaidTier: true,
        });
        expect(result.breakdown.paidTier).toBe(SCORE_WEIGHTS.PAID_TIER);
        expect(result.score).toBe(20);
      });

      it('should not award points when hasPaidTier is false', () => {
        const result = calculateFitScore({
          hasPaidTier: false,
        });
        expect(result.breakdown.paidTier).toBe(0);
      });

      it('should not award points when hasPaidTier is undefined', () => {
        const result = calculateFitScore({});
        expect(result.breakdown.paidTier).toBe(0);
      });
    });

    describe('music tools scoring (+10 points)', () => {
      it('should award 10 points for using music tools', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: ['linkfire'],
        });
        expect(result.breakdown.usesMusicTools).toBe(
          SCORE_WEIGHTS.USES_MUSIC_TOOLS
        );
        expect(result.score).toBe(10);
      });

      it('should only award 10 points once for multiple music tools', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: ['linkfire', 'toneden', 'featurefm'],
        });
        expect(result.breakdown.usesMusicTools).toBe(10);
        expect(result.score).toBe(10);
      });

      it('should detect music tools case-insensitively', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: ['LINKFIRE'],
        });
        expect(result.breakdown.usesMusicTools).toBe(10);
      });

      it('should not award points for non-music platforms', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: ['twitter', 'instagram', 'facebook'],
        });
        expect(result.breakdown.usesMusicTools).toBe(0);
      });

      it('should store detected music tools in meta', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: ['linkfire', 'instagram', 'toneden'],
        });
        expect(result.breakdown.meta?.musicToolsDetected).toEqual([
          'linkfire',
          'toneden',
        ]);
      });

      it('should handle empty array', () => {
        const result = calculateFitScore({
          socialLinkPlatforms: [],
        });
        expect(result.breakdown.usesMusicTools).toBe(0);
      });

      it.each([
        ...MUSIC_TOOL_PLATFORMS,
      ])('should recognize %s as music tool platform', platform => {
        const result = calculateFitScore({
          socialLinkPlatforms: [platform],
        });
        expect(result.breakdown.usesMusicTools).toBe(10);
      });
    });

    describe('Spotify profile scoring (+15 points)', () => {
      it('should award 15 points for having Spotify ID', () => {
        const result = calculateFitScore({
          hasSpotifyId: true,
        });
        expect(result.breakdown.hasSpotify).toBe(SCORE_WEIGHTS.HAS_SPOTIFY);
        expect(result.score).toBe(15);
      });

      it('should not award points when hasSpotifyId is false', () => {
        const result = calculateFitScore({
          hasSpotifyId: false,
        });
        expect(result.breakdown.hasSpotify).toBe(0);
      });
    });

    describe('Spotify popularity scoring (0-15 points)', () => {
      it('should award 15 points for popularity >= 60', () => {
        const result = calculateFitScore({
          spotifyPopularity: 60,
        });
        expect(result.breakdown.spotifyPopularity).toBe(
          SCORE_WEIGHTS.SPOTIFY_POPULARITY_MAX
        );
      });

      it('should award 15 points for popularity = 100', () => {
        const result = calculateFitScore({
          spotifyPopularity: 100,
        });
        expect(result.breakdown.spotifyPopularity).toBe(15);
      });

      it('should award 10 points for popularity 40-59', () => {
        const result = calculateFitScore({
          spotifyPopularity: 40,
        });
        expect(result.breakdown.spotifyPopularity).toBe(10);
      });

      it('should award 10 points for popularity = 59', () => {
        const result = calculateFitScore({
          spotifyPopularity: 59,
        });
        expect(result.breakdown.spotifyPopularity).toBe(10);
      });

      it('should award 5 points for popularity 20-39', () => {
        const result = calculateFitScore({
          spotifyPopularity: 20,
        });
        expect(result.breakdown.spotifyPopularity).toBe(5);
      });

      it('should award 5 points for popularity = 39', () => {
        const result = calculateFitScore({
          spotifyPopularity: 39,
        });
        expect(result.breakdown.spotifyPopularity).toBe(5);
      });

      it('should award 0 points for popularity < 20', () => {
        const result = calculateFitScore({
          spotifyPopularity: 19,
        });
        expect(result.breakdown.spotifyPopularity).toBe(0);
      });

      it('should award 0 points for popularity = 0', () => {
        const result = calculateFitScore({
          spotifyPopularity: 0,
        });
        expect(result.breakdown.spotifyPopularity).toBe(0);
      });

      it('should award 0 points for null popularity', () => {
        const result = calculateFitScore({
          spotifyPopularity: null,
        });
        expect(result.breakdown.spotifyPopularity).toBe(0);
      });

      it('should handle negative popularity as 0 points', () => {
        const result = calculateFitScore({
          spotifyPopularity: -10,
        });
        expect(result.breakdown.spotifyPopularity).toBe(0);
      });
    });

    describe('release recency scoring (0-10 points)', () => {
      it('should award 10 points for release within 6 months', () => {
        const result = calculateFitScore({
          latestReleaseDate: new Date('2025-01-15'),
        });
        expect(result.breakdown.releaseRecency).toBe(
          SCORE_WEIGHTS.RELEASE_RECENCY_6MO
        );
      });

      it('should award 10 points for release just within 6 months', () => {
        // Fake time is 2025-06-15, so 6 months ago is approximately 2024-12-15
        // Use a date slightly after to ensure it's within the window
        const result = calculateFitScore({
          latestReleaseDate: new Date('2024-12-16'),
        });
        expect(result.breakdown.releaseRecency).toBe(10);
      });

      it('should award 5 points for release 6-12 months ago', () => {
        const result = calculateFitScore({
          latestReleaseDate: new Date('2024-08-01'),
        });
        expect(result.breakdown.releaseRecency).toBe(
          SCORE_WEIGHTS.RELEASE_RECENCY_1YR
        );
      });

      it('should award 0 points for release over 1 year ago', () => {
        const result = calculateFitScore({
          latestReleaseDate: new Date('2024-01-01'),
        });
        expect(result.breakdown.releaseRecency).toBe(0);
      });

      it('should award 0 points for null release date', () => {
        const result = calculateFitScore({
          latestReleaseDate: null,
        });
        expect(result.breakdown.releaseRecency).toBe(0);
      });

      it('should store release date in meta when provided', () => {
        const releaseDate = new Date('2025-03-01');
        const result = calculateFitScore({
          latestReleaseDate: releaseDate,
        });
        expect(result.breakdown.meta?.latestReleaseDate).toBe(
          releaseDate.toISOString()
        );
      });
    });

    describe('genre match scoring (+5 points)', () => {
      it('should award 5 points for matching genre', () => {
        const result = calculateFitScore({
          genres: ['electronic'],
        });
        expect(result.breakdown.genreMatch).toBe(SCORE_WEIGHTS.GENRE_MATCH);
        expect(result.score).toBe(5);
      });

      it('should only award 5 points once for multiple matching genres', () => {
        const result = calculateFitScore({
          genres: ['electronic', 'house', 'techno'],
        });
        expect(result.breakdown.genreMatch).toBe(5);
        expect(result.score).toBe(5);
      });

      it('should match genres case-insensitively', () => {
        const result = calculateFitScore({
          genres: ['ELECTRONIC'],
        });
        expect(result.breakdown.genreMatch).toBe(5);
      });

      it('should match genres with whitespace trimmed', () => {
        const result = calculateFitScore({
          genres: ['  electronic  '],
        });
        expect(result.breakdown.genreMatch).toBe(5);
      });

      it('should not award points for non-target genres', () => {
        const result = calculateFitScore({
          genres: ['rock', 'country', 'classical'],
        });
        expect(result.breakdown.genreMatch).toBe(0);
      });

      it('should store matched genres in meta', () => {
        const result = calculateFitScore({
          genres: ['rock', 'electronic', 'house', 'pop'],
        });
        expect(result.breakdown.meta?.matchedGenres).toEqual([
          'electronic',
          'house',
        ]);
      });

      it('should handle empty genres array', () => {
        const result = calculateFitScore({
          genres: [],
        });
        expect(result.breakdown.genreMatch).toBe(0);
      });

      it('should handle null genres', () => {
        const result = calculateFitScore({
          genres: null,
        });
        expect(result.breakdown.genreMatch).toBe(0);
      });

      it.each([
        'electronic',
        'edm',
        'house',
        'techno',
        'dubstep',
        'drum and bass',
      ])('should recognize %s as target genre', genre => {
        const result = calculateFitScore({
          genres: [genre],
        });
        expect(result.breakdown.genreMatch).toBe(5);
      });
    });

    describe('maximum score calculation', () => {
      it('should calculate maximum score of 90 with all criteria met', () => {
        const input: FitScoreInput = {
          ingestionSourcePlatform: 'linktree', // +15
          hasPaidTier: true, // +20
          socialLinkPlatforms: ['linkfire'], // +10
          hasSpotifyId: true, // +15
          spotifyPopularity: 80, // +15
          latestReleaseDate: new Date('2025-05-01'), // +10
          genres: ['electronic'], // +5
        };
        const result = calculateFitScore(input);
        expect(result.score).toBe(90);
      });

      it('should handle partial data correctly', () => {
        const input: FitScoreInput = {
          ingestionSourcePlatform: 'linktree', // +15
          hasSpotifyId: true, // +15
          genres: ['rock'], // +0 (not target genre)
        };
        const result = calculateFitScore(input);
        expect(result.score).toBe(30);
      });
    });

    describe('score breakdown totals', () => {
      it('should have score equal to sum of breakdown components', () => {
        const input: FitScoreInput = {
          ingestionSourcePlatform: 'beacons',
          hasPaidTier: true,
          socialLinkPlatforms: ['toneden'],
          hasSpotifyId: true,
          spotifyPopularity: 45,
          latestReleaseDate: new Date('2025-03-01'),
          genres: ['house'],
        };
        const result = calculateFitScore(input);

        const breakdownSum =
          result.breakdown.usesLinkInBio +
          result.breakdown.paidTier +
          result.breakdown.usesMusicTools +
          result.breakdown.hasSpotify +
          result.breakdown.spotifyPopularity +
          result.breakdown.releaseRecency +
          result.breakdown.genreMatch;

        expect(result.score).toBe(breakdownSum);
      });
    });
  });

  describe('isLinkInBioPlatform', () => {
    it('should return true for valid link-in-bio platforms', () => {
      expect(isLinkInBioPlatform('linktree')).toBe(true);
      expect(isLinkInBioPlatform('beacons')).toBe(true);
      expect(isLinkInBioPlatform('laylo')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isLinkInBioPlatform('LINKTREE')).toBe(true);
      expect(isLinkInBioPlatform('LinkTree')).toBe(true);
    });

    it('should return false for non-link-in-bio platforms', () => {
      expect(isLinkInBioPlatform('twitter')).toBe(false);
      expect(isLinkInBioPlatform('instagram')).toBe(false);
      expect(isLinkInBioPlatform('random')).toBe(false);
    });
  });

  describe('isMusicToolPlatform', () => {
    it('should return true for valid music tool platforms', () => {
      expect(isMusicToolPlatform('linkfire')).toBe(true);
      expect(isMusicToolPlatform('toneden')).toBe(true);
      expect(isMusicToolPlatform('featurefm')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isMusicToolPlatform('LINKFIRE')).toBe(true);
      expect(isMusicToolPlatform('LinkFire')).toBe(true);
    });

    it('should return false for non-music platforms', () => {
      expect(isMusicToolPlatform('twitter')).toBe(false);
      expect(isMusicToolPlatform('linktree')).toBe(false);
    });
  });

  describe('isTargetGenre', () => {
    it('should return true for target genres', () => {
      expect(isTargetGenre('electronic')).toBe(true);
      expect(isTargetGenre('house')).toBe(true);
      expect(isTargetGenre('techno')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isTargetGenre('ELECTRONIC')).toBe(true);
      expect(isTargetGenre('Electronic')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(isTargetGenre('  electronic  ')).toBe(true);
    });

    it('should return false for non-target genres', () => {
      expect(isTargetGenre('rock')).toBe(false);
      expect(isTargetGenre('country')).toBe(false);
      expect(isTargetGenre('classical')).toBe(false);
    });
  });

  describe('constants', () => {
    it('should have correct score weights', () => {
      expect(SCORE_WEIGHTS.USES_LINK_IN_BIO).toBe(15);
      expect(SCORE_WEIGHTS.PAID_TIER).toBe(20);
      expect(SCORE_WEIGHTS.USES_MUSIC_TOOLS).toBe(10);
      expect(SCORE_WEIGHTS.HAS_SPOTIFY).toBe(15);
      expect(SCORE_WEIGHTS.SPOTIFY_POPULARITY_MAX).toBe(15);
      expect(SCORE_WEIGHTS.RELEASE_RECENCY_6MO).toBe(10);
      expect(SCORE_WEIGHTS.RELEASE_RECENCY_1YR).toBe(5);
      expect(SCORE_WEIGHTS.GENRE_MATCH).toBe(5);
    });

    it('should have correct version', () => {
      expect(FIT_SCORE_VERSION).toBe(2);
    });

    it('should have expected link-in-bio platforms', () => {
      expect(LINK_IN_BIO_PLATFORMS.has('linktree')).toBe(true);
      expect(LINK_IN_BIO_PLATFORMS.has('beacons')).toBe(true);
      expect(LINK_IN_BIO_PLATFORMS.has('laylo')).toBe(true);
      expect(LINK_IN_BIO_PLATFORMS.size).toBeGreaterThan(5);
    });

    it('should have expected music tool platforms', () => {
      expect(MUSIC_TOOL_PLATFORMS.has('linkfire')).toBe(true);
      expect(MUSIC_TOOL_PLATFORMS.has('toneden')).toBe(true);
      expect(MUSIC_TOOL_PLATFORMS.size).toBeGreaterThan(3);
    });

    it('should have expected target genres', () => {
      expect(TARGET_GENRES.has('electronic')).toBe(true);
      expect(TARGET_GENRES.has('house')).toBe(true);
      expect(TARGET_GENRES.has('techno')).toBe(true);
      expect(TARGET_GENRES.size).toBeGreaterThan(20);
    });

    it('should have total max score of 90', () => {
      const maxScore =
        SCORE_WEIGHTS.USES_LINK_IN_BIO +
        SCORE_WEIGHTS.PAID_TIER +
        SCORE_WEIGHTS.USES_MUSIC_TOOLS +
        SCORE_WEIGHTS.HAS_SPOTIFY +
        SCORE_WEIGHTS.SPOTIFY_POPULARITY_MAX +
        SCORE_WEIGHTS.RELEASE_RECENCY_6MO +
        SCORE_WEIGHTS.GENRE_MATCH;
      expect(maxScore).toBe(90);
    });
  });
});
