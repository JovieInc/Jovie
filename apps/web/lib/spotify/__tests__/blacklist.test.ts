import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '@/lib/utils/logger';
import {
  filterBlacklistedResults,
  isBlacklistedSpotifyId,
  SPOTIFY_BLACKLISTED_IDS,
  TIM_WHITE_SPOTIFY_ID,
} from '../blacklist';

describe('Spotify Blacklist', () => {
  describe('TIM_WHITE_SPOTIFY_ID', () => {
    it('is the correct Spotify ID for the founder', () => {
      expect(TIM_WHITE_SPOTIFY_ID).toBe('4Uwpa6zW3zzCSQvooQNksm');
    });

    it('is NOT in the blacklist (safety assertion)', () => {
      expect(SPOTIFY_BLACKLISTED_IDS.has(TIM_WHITE_SPOTIFY_ID)).toBe(false);
    });
  });

  describe('SPOTIFY_BLACKLISTED_IDS', () => {
    it('contains known wrong Tim White IDs', () => {
      // Gospel Tim White
      expect(SPOTIFY_BLACKLISTED_IDS.has('59NJtiWq8nISIJjDtITQyt')).toBe(true);
      // Bluegrass Tim White
      expect(SPOTIFY_BLACKLISTED_IDS.has('3EawsIJlB0zYAss7QaKeBi')).toBe(true);
      // Tim White & ReFocused
      expect(SPOTIFY_BLACKLISTED_IDS.has('7AdaBLkStiD5F763iRZWjU')).toBe(true);
    });

    it('does not contain unrelated artist IDs', () => {
      expect(SPOTIFY_BLACKLISTED_IDS.has('0000000000000000000000')).toBe(false);
    });
  });

  describe('isBlacklistedSpotifyId', () => {
    it('returns true for a blacklisted ID', () => {
      expect(isBlacklistedSpotifyId('59NJtiWq8nISIJjDtITQyt')).toBe(true);
    });

    it('returns false for the correct Tim White ID', () => {
      expect(isBlacklistedSpotifyId(TIM_WHITE_SPOTIFY_ID)).toBe(false);
    });

    it('returns false for an unrelated ID', () => {
      expect(isBlacklistedSpotifyId('6rqhFgbbKwnb9MLmUQDhG6')).toBe(false);
    });
  });

  describe('filterBlacklistedResults', () => {
    it('removes blacklisted entries from results', () => {
      const results = [
        { id: TIM_WHITE_SPOTIFY_ID, name: 'Tim White' },
        { id: '59NJtiWq8nISIJjDtITQyt', name: 'Tim White (gospel)' },
        { id: '3EawsIJlB0zYAss7QaKeBi', name: 'Tim White (bluegrass)' },
      ];

      const filtered = filterBlacklistedResults(results);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(TIM_WHITE_SPOTIFY_ID);
    });

    it('preserves all entries when none are blacklisted', () => {
      const results = [
        { id: TIM_WHITE_SPOTIFY_ID, name: 'Tim White' },
        { id: '6rqhFgbbKwnb9MLmUQDhG6', name: 'Other Artist' },
      ];

      const filtered = filterBlacklistedResults(results);

      expect(filtered).toHaveLength(2);
    });

    it('handles empty array', () => {
      expect(filterBlacklistedResults([])).toEqual([]);
    });

    it('logs when filtering occurs', () => {
      const results = [
        { id: '59NJtiWq8nISIJjDtITQyt', name: 'Tim White (gospel)' },
      ];

      filterBlacklistedResults(results);

      expect(logger.info).toHaveBeenCalledWith(
        '[Spotify Blacklist] Filtered blacklisted artists',
        expect.objectContaining({
          removedCount: 1,
          removedIds: ['59NJtiWq8nISIJjDtITQyt'],
        })
      );
    });

    it('does not log when no filtering occurs', () => {
      vi.mocked(logger.info).mockClear();

      filterBlacklistedResults([
        { id: TIM_WHITE_SPOTIFY_ID, name: 'Tim White' },
      ]);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('preserves extra properties on filtered results', () => {
      const results = [
        {
          id: TIM_WHITE_SPOTIFY_ID,
          name: 'Tim White',
          followers: 9906,
          popularity: 10,
        },
      ];

      const filtered = filterBlacklistedResults(results);

      expect(filtered[0]).toEqual(results[0]);
    });
  });
});
