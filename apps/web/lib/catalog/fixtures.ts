import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import type { CatalogSnapshot } from './types';

const COSMIC_GATE_SPOTIFY_ID = '1l7ZsJRRS8wlW3WfJfPfLG';
const COSMIC_GATE_MUSICBRAINZ_ID = '6c0c6f4a-8f1d-4c2e-9a3b-0d4f8e7c6b5a';

export const catalogCollaboratorFixtureScope = {
  personaId: FOUNDER_DEMO_PERSONA.id,
  ownerArtistName: FOUNDER_DEMO_PERSONA.profile.displayName,
} as const;

export const founderDemoCatalogSnapshot: CatalogSnapshot = {
  ownerArtistName: FOUNDER_DEMO_PERSONA.profile.displayName,
  collaborators: [
    {
      id: 'collab-cosmic-gate',
      name: 'Cosmic Gate',
      aliases: ['Cosmic Gate & Tim White', 'Tim White x Cosmic Gate', 'CG'],
      providerIds: [
        {
          provider: 'spotify',
          providerId: COSMIC_GATE_SPOTIFY_ID,
          confidence: 0.97,
        },
        {
          provider: 'musicbrainz',
          providerId: COSMIC_GATE_MUSICBRAINZ_ID,
          confidence: 0.94,
        },
      ],
    },
  ],
  releases: FOUNDER_DEMO_PERSONA.releases.map(release => ({
    id: release.id,
    title: release.title,
    slug: release.slug,
    artistNames: [...release.artistNames],
    releaseDate: release.releaseDate,
  })),
};

export const cosmicGateFixtureSignal = {
  text: 'Cosmic Gate has festival attention this weekend.',
  provider: 'spotify',
  providerId: COSMIC_GATE_SPOTIFY_ID,
} as const;

export const theDeepEndFixtureReleaseId = 'tim-the-deep-end';
