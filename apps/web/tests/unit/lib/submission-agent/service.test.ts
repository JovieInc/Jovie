import { describe, expect, it } from 'vitest';
import { buildSubmissionTracks } from '@/lib/submission-agent/service';

describe('buildSubmissionTracks', () => {
  it('keeps duplicate release-track rows that share the same recording credits', () => {
    const tracks = buildSubmissionTracks(
      [
        {
          releaseTrackId: 'track-row-1',
          title: 'Intro',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 120_000,
          artistName: 'Test Artist',
          role: 'main_artist',
        },
        {
          releaseTrackId: 'track-row-1',
          title: 'Intro',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 120_000,
          artistName: 'Test Artist',
          role: 'composer',
        },
        {
          releaseTrackId: 'track-row-2',
          title: 'Intro',
          trackNumber: 2,
          discNumber: 1,
          durationMs: 120_000,
          artistName: 'Test Artist',
          role: 'main_artist',
        },
        {
          releaseTrackId: 'track-row-2',
          title: 'Intro',
          trackNumber: 2,
          discNumber: 1,
          durationMs: 120_000,
          artistName: 'Test Artist',
          role: 'composer',
        },
      ],
      'Fallback Artist'
    );

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      title: 'Intro',
      trackNumber: 1,
      performer: 'Test Artist',
      composers: ['Test Artist'],
    });
    expect(tracks[1]).toMatchObject({
      title: 'Intro',
      trackNumber: 2,
      performer: 'Test Artist',
      composers: ['Test Artist'],
    });
  });

  it('falls back to the profile performer when a track has no performer roles', () => {
    const tracks = buildSubmissionTracks(
      [
        {
          releaseTrackId: 'track-row-1',
          title: 'Instrumental',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 95_000,
          artistName: 'Composer One',
          role: 'composer',
        },
      ],
      'Fallback Artist'
    );

    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.performer).toBe('Fallback Artist');
    expect(tracks[0]?.composers).toEqual(['Composer One']);
  });
});
