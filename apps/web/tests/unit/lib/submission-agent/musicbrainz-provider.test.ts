import { describe, expect, it } from 'vitest';
import { musicBrainzAuthenticatedEditProvider } from '@/lib/submission-agent/providers/musicbrainz';

describe('submission-agent/providers/musicbrainz.ts', () => {
  it('advertises the authenticated edit transport and launch guardrail', async () => {
    expect(musicBrainzAuthenticatedEditProvider.id).toBe(
      'musicbrainz_authenticated_edit'
    );
    expect(musicBrainzAuthenticatedEditProvider.transport).toBe(
      'authenticated_edit'
    );
    expect(musicBrainzAuthenticatedEditProvider.requiredInputs).toEqual([
      'artist_name',
      'release',
      'release_tracks',
    ]);

    const result = await musicBrainzAuthenticatedEditProvider.buildPackage(
      {} as never
    );

    expect(result).toEqual({
      package: null,
      missingFields: [
        {
          field: 'provider',
          reason:
            'MusicBrainz authenticated edits are not part of the Xperi-first launch.',
        },
      ],
    });
  });
});
