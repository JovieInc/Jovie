import type { SubmissionProvider } from '../types';

export const musicBrainzAuthenticatedEditProvider: SubmissionProvider = {
  id: 'musicbrainz_authenticated_edit',
  displayName: 'MusicBrainz',
  transport: 'authenticated_edit',
  requiredInputs: ['artist_name', 'release', 'release_tracks'],
  async buildPackage() {
    return {
      package: null,
      missingFields: [
        {
          field: 'provider',
          reason:
            'MusicBrainz authenticated edits are not part of the Xperi-first launch.',
        },
      ],
    };
  },
};
