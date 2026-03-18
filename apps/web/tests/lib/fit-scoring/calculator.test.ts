/**
 * Fit Score Calculator Tests
 *
 * Tests for the calculateFitScore pure function.
 * No mocking needed - this is a pure calculation with no external dependencies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calculateFitScore,
  type FitScoreInput,
  SCORE_WEIGHTS,
} from '@/lib/fit-scoring/calculator';

describe('calculateFitScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return score 0 for empty input', () => {
    const result = calculateFitScore({});
    expect(result.score).toBe(0);
    expect(result.breakdown).toBeDefined();
  });

  it('should cap score at 100 when all criteria are maxed', () => {
    const input: FitScoreInput = {
      ingestionSourcePlatform: 'linktree', // +15
      hasPaidTier: true, // +20
      socialLinkPlatforms: ['linkfire'], // +10
      hasSpotifyId: true, // +15
      spotifyPopularity: 80, // +15
      latestReleaseDate: new Date('2026-02-01'), // +10
      genres: ['electronic'], // +5
      dspPlatformCount: 5, // +5
      hasContactEmail: true, // +5
      paidVerificationPlatforms: ['twitter'], // +10
      // Total raw = 110, capped at 100
    };
    const result = calculateFitScore(input);
    expect(result.score).toBe(100);
  });

  it('should award +15 for link-in-bio platform "linktree"', () => {
    const result = calculateFitScore({ ingestionSourcePlatform: 'linktree' });
    expect(result.breakdown.usesLinkInBio).toBe(SCORE_WEIGHTS.USES_LINK_IN_BIO);
    expect(result.score).toBe(15);
  });

  it('should award +20 for paid tier', () => {
    const result = calculateFitScore({ hasPaidTier: true });
    expect(result.breakdown.paidTier).toBe(SCORE_WEIGHTS.PAID_TIER);
    expect(result.score).toBe(20);
  });

  it('should award +15 for having Spotify', () => {
    const result = calculateFitScore({ hasSpotifyId: true });
    expect(result.breakdown.hasSpotify).toBe(SCORE_WEIGHTS.HAS_SPOTIFY);
    expect(result.score).toBe(15);
  });

  it('should award +15 for Spotify popularity >= 60', () => {
    const result = calculateFitScore({ spotifyPopularity: 60 });
    expect(result.breakdown.spotifyPopularity).toBe(
      SCORE_WEIGHTS.SPOTIFY_POPULARITY_MAX
    );
  });

  it('should award +10 for Spotify popularity 40-59', () => {
    const result = calculateFitScore({ spotifyPopularity: 40 });
    expect(result.breakdown.spotifyPopularity).toBe(10);
  });

  it('should award +5 for Spotify popularity 20-39', () => {
    const result = calculateFitScore({ spotifyPopularity: 20 });
    expect(result.breakdown.spotifyPopularity).toBe(5);
  });

  it('should award 0 for Spotify popularity < 20', () => {
    const result = calculateFitScore({ spotifyPopularity: 10 });
    expect(result.breakdown.spotifyPopularity).toBe(0);
  });

  it('should award +10 for release within 6 months', () => {
    const result = calculateFitScore({
      latestReleaseDate: new Date('2025-12-01'),
    });
    expect(result.breakdown.releaseRecency).toBe(
      SCORE_WEIGHTS.RELEASE_RECENCY_6MO
    );
  });

  it('should award +5 for release within 1 year but older than 6 months', () => {
    const result = calculateFitScore({
      latestReleaseDate: new Date('2025-06-01'),
    });
    expect(result.breakdown.releaseRecency).toBe(
      SCORE_WEIGHTS.RELEASE_RECENCY_1YR
    );
  });

  it('should award 0 for release older than 1 year', () => {
    const result = calculateFitScore({
      latestReleaseDate: new Date('2024-01-01'),
    });
    expect(result.breakdown.releaseRecency).toBe(0);
  });

  it('should award +10 for music tool in socialLinkPlatforms', () => {
    const result = calculateFitScore({
      socialLinkPlatforms: ['linkfire', 'instagram'],
    });
    expect(result.breakdown.usesMusicTools).toBe(
      SCORE_WEIGHTS.USES_MUSIC_TOOLS
    );
    expect(result.score).toBe(10);
  });

  it('should award +5 for genre match with "house"', () => {
    const result = calculateFitScore({ genres: ['house'] });
    expect(result.breakdown.genreMatch).toBe(SCORE_WEIGHTS.GENRE_MATCH);
    expect(result.score).toBe(5);
  });

  it('should award +10 for alternative DSP without Spotify', () => {
    const result = calculateFitScore({
      hasSpotifyId: false,
      hasAppleMusicId: true,
    });
    expect(result.breakdown.hasAlternativeDsp).toBe(
      SCORE_WEIGHTS.HAS_ALTERNATIVE_DSP
    );
  });

  it('should not award alternative DSP points when Spotify is present', () => {
    const result = calculateFitScore({
      hasSpotifyId: true,
      hasAppleMusicId: true,
    });
    expect(result.breakdown.hasAlternativeDsp).toBe(0);
  });

  it('should award +5 for contact email', () => {
    const result = calculateFitScore({ hasContactEmail: true });
    expect(result.breakdown.hasContactEmail).toBe(
      SCORE_WEIGHTS.HAS_CONTACT_EMAIL
    );
    expect(result.score).toBe(5);
  });

  it('should award +10 for paid verification platforms', () => {
    const result = calculateFitScore({
      paidVerificationPlatforms: ['twitter', 'instagram'],
    });
    expect(result.breakdown.paidVerification).toBe(
      SCORE_WEIGHTS.PAID_VERIFICATION
    );
    expect(result.score).toBe(10);
  });

  it('should award +5 for multi-DSP presence (3+ platforms)', () => {
    const result = calculateFitScore({ dspPlatformCount: 3 });
    expect(result.breakdown.multiDspPresence).toBe(
      SCORE_WEIGHTS.MULTI_DSP_PRESENCE
    );
    expect(result.score).toBe(5);
  });

  it('should not award multi-DSP points for fewer than 3 platforms', () => {
    const result = calculateFitScore({ dspPlatformCount: 2 });
    expect(result.breakdown.multiDspPresence).toBe(0);
  });
});
