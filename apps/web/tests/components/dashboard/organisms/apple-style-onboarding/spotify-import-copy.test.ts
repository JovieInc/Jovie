import { describe, expect, it } from 'vitest';
import {
  getSpotifyImportStageMessage,
  getSpotifyImportSuccessMessage,
} from '@/features/dashboard/organisms/apple-style-onboarding/spotifyImportCopy';

describe('spotify import copy helpers', () => {
  it('returns confidence-building stage copy for each import stage', () => {
    expect(getSpotifyImportStageMessage(0)).toBe(
      'Finding your Spotify artist profile…'
    );
    expect(getSpotifyImportStageMessage(2)).toBe('Setting up your smartlinks…');
  });

  it('uses imported release count when available for stage two', () => {
    expect(getSpotifyImportStageMessage(1, 1)).toBe(
      'Importing 1 release and your artist profile…'
    );
    expect(getSpotifyImportStageMessage(1, 12)).toBe(
      'Importing 12 releases and your artist profile…'
    );
  });

  it('falls back to generic stage two copy without release count', () => {
    expect(getSpotifyImportStageMessage(1)).toBe(
      'Importing your releases and artist profile…'
    );
  });

  it('summarizes imported profile data with release count', () => {
    expect(getSpotifyImportSuccessMessage(1)).toBe(
      'Imported your artist profile and 1 release from Spotify.'
    );
    expect(getSpotifyImportSuccessMessage(5)).toBe(
      'Imported your artist profile and 5 releases from Spotify.'
    );
  });
});
