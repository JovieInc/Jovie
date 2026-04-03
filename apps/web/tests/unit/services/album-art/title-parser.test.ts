import { describe, expect, it } from 'vitest';
import { parseAlbumArtTitle } from '@/lib/services/album-art/title-parser';

describe('parseAlbumArtTitle', () => {
  it('extracts bracketed version labels', () => {
    expect(parseAlbumArtTitle('Tokyo Drift (Extended Mix)')).toEqual({
      displayTitle: 'Tokyo Drift (Extended Mix)',
      baseTitle: 'Tokyo Drift',
      normalizedBaseTitle: 'tokyo drift',
      versionLabel: 'Extended Mix',
    });
  });

  it('extracts dashed version labels', () => {
    expect(parseAlbumArtTitle('Tokyo Drift - Radio Edit')).toEqual({
      displayTitle: 'Tokyo Drift - Radio Edit',
      baseTitle: 'Tokyo Drift',
      normalizedBaseTitle: 'tokyo drift',
      versionLabel: 'Radio Edit',
    });
  });

  it('avoids false positives for non-version suffixes', () => {
    expect(parseAlbumArtTitle('Songs - About You')).toEqual({
      displayTitle: 'Songs - About You',
      baseTitle: 'Songs - About You',
      normalizedBaseTitle: 'songs about you',
      versionLabel: null,
    });
  });
});
