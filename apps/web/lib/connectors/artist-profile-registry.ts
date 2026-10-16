import {
  type ArtistProfileContract,
  type ArtistProfileField,
  unknownArtistProfileContract,
} from './artist-profile-contract';
import { CONNECTOR_REGISTRY } from './registry';

export interface ArtistProfileDestinationManifest {
  readonly label: string;
  readonly sources: readonly ('connector' | 'dsp_bio' | 'ingestion')[];
  readonly rollout: 'available' | 'blocked' | 'planned';
  readonly profile: ArtistProfileContract;
  readonly constraints: Partial<
    Record<ArtistProfileField, { readonly maxLength: number }>
  >;
  readonly recovery: 'manual' | 'unsupported';
}

function unverified(
  label: string,
  sources: ArtistProfileDestinationManifest['sources'],
  maxBioLength?: number,
  recovery: ArtistProfileDestinationManifest['recovery'] = 'unsupported'
): ArtistProfileDestinationManifest {
  return {
    label,
    sources,
    rollout: 'blocked',
    profile: unknownArtistProfileContract(
      'Artist-profile authorization, API terms and operation evidence have not been verified.'
    ),
    constraints: maxBioLength ? { bio: { maxLength: maxBioLength } } : {},
    recovery,
  };
}

/**
 * Destination inventory, including read-only ingestion and disabled DSP paths.
 * Connector field policies remain owned by their existing connector manifest.
 * No connection records, credentials, account IDs or provider clients belong here.
 */
export const ARTIST_PROFILE_DESTINATIONS = {
  amazon_music: unverified('Amazon Music', ['dsp_bio'], undefined, 'manual'),
  apple_music: unverified('Apple Music', ['dsp_bio'], undefined, 'manual'),
  beacons: unverified('Beacons', ['ingestion']),
  deezer: unverified('Deezer', ['dsp_bio'], undefined, 'manual'),
  instagram: unverified('Instagram', ['ingestion']),
  laylo: unverified('Laylo', ['ingestion']),
  linktree: unverified('Linktree', ['ingestion']),
  soundcloud: {
    ...unverified('SoundCloud', ['dsp_bio', 'ingestion'], 4000),
    rollout: 'planned',
  },
  spotify: {
    ...unverified('Spotify', ['connector', 'dsp_bio'], 1500, 'manual'),
    profile: CONNECTOR_REGISTRY.spotify.artistProfile,
  },
  tidal: unverified('TIDAL', ['dsp_bio'], undefined, 'manual'),
  tiktok: unverified('TikTok', ['ingestion']),
  twitter: unverified('Twitter', ['ingestion']),
  youtube: {
    ...unverified('YouTube', ['connector', 'ingestion']),
    profile: CONNECTOR_REGISTRY.youtube.artistProfile,
  },
  youtube_music: {
    ...unverified('YouTube Music', ['dsp_bio'], 5000),
    rollout: 'planned',
  },
} as const satisfies Record<string, ArtistProfileDestinationManifest>;
