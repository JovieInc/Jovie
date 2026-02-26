import { describe, expect, it } from 'vitest';
import {
  classifySpotifyReleaseType,
  isEpTrackCount,
} from '@/lib/discography/release-type';

describe('release-type', () => {
  describe('isEpTrackCount', () => {
    it('returns true for 4 to 6 tracks', () => {
      expect(isEpTrackCount(4)).toBe(true);
      expect(isEpTrackCount(5)).toBe(true);
      expect(isEpTrackCount(6)).toBe(true);
    });

    it('returns false outside the EP track window', () => {
      expect(isEpTrackCount(3)).toBe(false);
      expect(isEpTrackCount(7)).toBe(false);
    });
  });

  describe('classifySpotifyReleaseType', () => {
    it('classifies Spotify singles with 4 to 6 tracks as EPs', () => {
      expect(classifySpotifyReleaseType('single', 4)).toBe('ep');
      expect(classifySpotifyReleaseType('single', 5)).toBe('ep');
      expect(classifySpotifyReleaseType('single', 6)).toBe('ep');
    });

    it('keeps other Spotify types unchanged', () => {
      expect(classifySpotifyReleaseType('single', 1)).toBe('single');
      expect(classifySpotifyReleaseType('album', 5)).toBe('album');
      expect(classifySpotifyReleaseType('compilation', 20)).toBe('compilation');
    });
  });
});
