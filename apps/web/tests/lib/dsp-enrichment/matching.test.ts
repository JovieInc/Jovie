import { describe, expect, it, vi } from 'vitest';

// Mock server-only before importing modules
vi.mock('server-only', () => ({}));

import {
  artistNameSimilarity,
  calculateFollowerRatioScore,
  calculateGenreOverlapScore,
  calculateIsrcMatchScore,
  calculateNameSimilarityScore,
  calculateUpcMatchScore,
  jaroWinklerSimilarity,
  normalizeArtistName,
} from '@/lib/dsp-enrichment/matching';

describe('Name Similarity', () => {
  describe('normalizeArtistName', () => {
    it('should convert to lowercase', () => {
      expect(normalizeArtistName('DRAKE')).toBe('drake');
    });

    it('should remove "The" prefix', () => {
      expect(normalizeArtistName('The Beatles')).toBe('beatles');
    });

    it('should remove "A" prefix', () => {
      expect(normalizeArtistName('A Tribe Called Quest')).toBe(
        'tribe called quest'
      );
    });

    it('should remove special characters', () => {
      expect(normalizeArtistName('AC/DC')).toBe('acdc');
      expect(normalizeArtistName("Guns N' Roses")).toBe('guns n roses');
    });

    it('should remove diacritics', () => {
      expect(normalizeArtistName('Björk')).toBe('bjork');
      expect(normalizeArtistName('Sigur Rós')).toBe('sigur ros');
    });

    it('should handle multiple spaces', () => {
      expect(normalizeArtistName('  Drake   ')).toBe('drake');
    });

    it('should remove DJ prefix', () => {
      expect(normalizeArtistName('DJ Khaled')).toBe('khaled');
    });

    it('should remove Lil prefix', () => {
      expect(normalizeArtistName('Lil Wayne')).toBe('wayne');
    });
  });

  describe('jaroWinklerSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(jaroWinklerSimilarity('drake', 'drake')).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect(jaroWinklerSimilarity('', 'drake')).toBe(0);
      expect(jaroWinklerSimilarity('drake', '')).toBe(0);
    });

    it('should handle similar strings with common prefix', () => {
      const similarity = jaroWinklerSimilarity('martha', 'marhta');
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should handle completely different strings', () => {
      const similarity = jaroWinklerSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe('artistNameSimilarity', () => {
    it('should return 1 for identical names', () => {
      expect(artistNameSimilarity('Drake', 'Drake')).toBe(1);
    });

    it('should handle case differences', () => {
      expect(artistNameSimilarity('DRAKE', 'drake')).toBe(1);
    });

    it('should handle "The" prefix differences', () => {
      expect(artistNameSimilarity('The Beatles', 'Beatles')).toBe(1);
    });

    it('should return high similarity for minor variations', () => {
      const similarity = artistNameSimilarity('Taylor Swift', 'Taylor Swfit');
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should return low similarity for different artists', () => {
      const similarity = artistNameSimilarity('Drake', 'Beyoncé');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should return 0 for empty names after normalization', () => {
      expect(artistNameSimilarity('', '')).toBe(0);
    });
  });
});

describe('Confidence Scoring', () => {
  describe('calculateIsrcMatchScore', () => {
    it('should return 0 for no tracks checked', () => {
      expect(calculateIsrcMatchScore(0, 0)).toBe(0);
    });

    it('should return 1 for 100% match rate', () => {
      expect(calculateIsrcMatchScore(10, 10)).toBe(1);
    });

    it('should return ~0.71 for 50% match rate', () => {
      const score = calculateIsrcMatchScore(5, 10);
      expect(score).toBeCloseTo(0.707, 2);
    });

    it('should return ~0.45 for 20% match rate', () => {
      const score = calculateIsrcMatchScore(2, 10);
      expect(score).toBeCloseTo(0.447, 2);
    });
  });

  describe('calculateUpcMatchScore', () => {
    it('should return 0 for no UPC matches', () => {
      expect(calculateUpcMatchScore(0)).toBe(0);
    });

    it('should return score for single match', () => {
      const score = calculateUpcMatchScore(1);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should increase with more matches', () => {
      const score1 = calculateUpcMatchScore(1);
      const score2 = calculateUpcMatchScore(3);
      expect(score2).toBeGreaterThan(score1);
    });

    it('should cap at 1', () => {
      const score = calculateUpcMatchScore(10, 5);
      expect(score).toBe(1);
    });
  });

  describe('calculateNameSimilarityScore', () => {
    it('should return 1 for identical names', () => {
      expect(calculateNameSimilarityScore('Drake', 'Drake')).toBe(1);
    });

    it('should return high score for similar names', () => {
      const score = calculateNameSimilarityScore(
        'Taylor Swift',
        'Taylor Swfit'
      );
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('calculateFollowerRatioScore', () => {
    it('should return 0.5 for missing local followers', () => {
      expect(calculateFollowerRatioScore(null, 1000000)).toBe(0.5);
    });

    it('should return 0.5 for missing external followers', () => {
      expect(calculateFollowerRatioScore(1000000, null)).toBe(0.5);
    });

    it('should return 1 for equal follower counts', () => {
      expect(calculateFollowerRatioScore(1000000, 1000000)).toBe(1);
    });

    it('should return high score for similar counts', () => {
      const score = calculateFollowerRatioScore(1000000, 900000);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return low score for very different counts', () => {
      const score = calculateFollowerRatioScore(1000000, 100000);
      expect(score).toBeLessThan(0.5);
    });

    it('should return 0.1 for 10x or more difference', () => {
      expect(calculateFollowerRatioScore(10000000, 1000000)).toBe(0.1);
    });
  });

  describe('calculateGenreOverlapScore', () => {
    it('should return 0.5 for missing local genres', () => {
      expect(calculateGenreOverlapScore(null, ['pop'])).toBe(0.5);
    });

    it('should return 0.5 for missing external genres', () => {
      expect(calculateGenreOverlapScore(['pop'], null)).toBe(0.5);
    });

    it('should return 0.5 for empty genres', () => {
      expect(calculateGenreOverlapScore([], ['pop'])).toBe(0.5);
    });

    it('should return 1 for identical genres', () => {
      expect(calculateGenreOverlapScore(['pop', 'rock'], ['pop', 'rock'])).toBe(
        1
      );
    });

    it('should handle case differences', () => {
      expect(calculateGenreOverlapScore(['POP'], ['pop'])).toBe(1);
    });

    it('should calculate partial overlap', () => {
      const score = calculateGenreOverlapScore(
        ['pop', 'rock'],
        ['pop', 'electronic']
      );
      // Jaccard: 1 overlap / 3 unique = 0.333
      expect(score).toBeCloseTo(0.333, 2);
    });

    it('should return 0 for no overlap', () => {
      const score = calculateGenreOverlapScore(['pop'], ['metal']);
      expect(score).toBe(0);
    });
  });
});

describe('ISRC Aggregation', () => {
  it('should aggregate matches by artist ID', async () => {
    const { aggregateIsrcMatches } = await import(
      '@/lib/dsp-enrichment/matching'
    );

    const matches = [
      {
        isrc: 'ISRC001',
        localTrackId: 'local1',
        localTrackTitle: 'Track 1',
        matchedTrack: {
          id: 'ext1',
          title: 'External Track 1',
          artistId: 'artist123',
          artistName: 'Test Artist',
        },
      },
      {
        isrc: 'ISRC002',
        localTrackId: 'local2',
        localTrackTitle: 'Track 2',
        matchedTrack: {
          id: 'ext2',
          title: 'External Track 2',
          artistId: 'artist123',
          artistName: 'Test Artist',
        },
      },
    ];

    const candidates = aggregateIsrcMatches('apple_music', matches);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].externalArtistId).toBe('artist123');
    expect(candidates[0].matchingIsrcs).toHaveLength(2);
    expect(candidates[0].matchingIsrcs).toContain('ISRC001');
    expect(candidates[0].matchingIsrcs).toContain('ISRC002');
  });

  it('should sort candidates by ISRC match count', async () => {
    const { aggregateIsrcMatches } = await import(
      '@/lib/dsp-enrichment/matching'
    );

    const matches = [
      {
        isrc: 'ISRC001',
        localTrackId: 'local1',
        localTrackTitle: 'Track 1',
        matchedTrack: {
          id: 'ext1',
          title: 'External Track 1',
          artistId: 'artist1',
          artistName: 'Artist 1',
        },
      },
      {
        isrc: 'ISRC002',
        localTrackId: 'local2',
        localTrackTitle: 'Track 2',
        matchedTrack: {
          id: 'ext2',
          title: 'External Track 2',
          artistId: 'artist2',
          artistName: 'Artist 2',
        },
      },
      {
        isrc: 'ISRC003',
        localTrackId: 'local3',
        localTrackTitle: 'Track 3',
        matchedTrack: {
          id: 'ext3',
          title: 'External Track 3',
          artistId: 'artist2',
          artistName: 'Artist 2',
        },
      },
    ];

    const candidates = aggregateIsrcMatches('apple_music', matches);

    // Artist 2 should be first (2 matches) vs Artist 1 (1 match)
    expect(candidates[0].externalArtistId).toBe('artist2');
    expect(candidates[0].matchingIsrcs).toHaveLength(2);
    expect(candidates[1].externalArtistId).toBe('artist1');
    expect(candidates[1].matchingIsrcs).toHaveLength(1);
  });
});

describe('Match Validation', () => {
  it('should reject matches with low confidence', async () => {
    const { validateMatch } = await import('@/lib/dsp-enrichment/matching');

    const match = {
      providerId: 'apple_music' as const,
      externalArtistId: 'artist123',
      externalArtistName: 'Test Artist',
      matchingIsrcs: ['ISRC001'],
      matchingUpcs: [],
      totalTracksChecked: 10,
      confidenceScore: 0.2,
      confidenceBreakdown: {
        isrcMatchScore: 0.1,
        upcMatchScore: 0,
        nameSimilarityScore: 0.1,
        followerRatioScore: 0.5,
        genreOverlapScore: 0.5,
      },
      shouldAutoConfirm: false,
    };

    const result = validateMatch(match, {
      id: 'local1',
      name: 'Local Artist',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Confidence score too low');
  });

  it('should reject name mismatches with few ISRCs', async () => {
    const { validateMatch } = await import('@/lib/dsp-enrichment/matching');

    const match = {
      providerId: 'apple_music' as const,
      externalArtistId: 'artist123',
      externalArtistName: 'Different Artist',
      matchingIsrcs: ['ISRC001'],
      matchingUpcs: [],
      totalTracksChecked: 10,
      confidenceScore: 0.5,
      confidenceBreakdown: {
        isrcMatchScore: 0.3,
        upcMatchScore: 0,
        nameSimilarityScore: 0.3,
        followerRatioScore: 0.5,
        genreOverlapScore: 0.5,
      },
      shouldAutoConfirm: false,
    };

    const result = validateMatch(match, {
      id: 'local1',
      name: 'Local Artist',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Name mismatch with few ISRC matches');
  });

  it('should accept valid matches', async () => {
    const { validateMatch } = await import('@/lib/dsp-enrichment/matching');

    const match = {
      providerId: 'apple_music' as const,
      externalArtistId: 'artist123',
      externalArtistName: 'Test Artist',
      matchingIsrcs: ['ISRC001', 'ISRC002', 'ISRC003'],
      matchingUpcs: [],
      totalTracksChecked: 10,
      confidenceScore: 0.85,
      confidenceBreakdown: {
        isrcMatchScore: 0.8,
        upcMatchScore: 0,
        nameSimilarityScore: 0.95,
        followerRatioScore: 0.5,
        genreOverlapScore: 0.5,
      },
      shouldAutoConfirm: true,
    };

    const result = validateMatch(match, {
      id: 'local1',
      name: 'Test Artist',
    });

    expect(result.valid).toBe(true);
  });
});
