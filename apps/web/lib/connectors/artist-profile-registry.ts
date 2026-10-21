import {
  type ArtistProfileContract,
  type ArtistProfileField,
} from './artist-profile-contract';
import {
  DSP_PROFILE_CATALOG,
  type DspProfileDestination,
} from './dsp-profile-catalog';
import { SOCIAL_PROFILE_CATALOG } from './social-profile-catalog';

export interface ArtistProfileDestinationManifest {
  readonly label: string;
  readonly sources: readonly ('connector' | 'dsp_bio' | 'ingestion')[];
  readonly rollout: 'available' | 'blocked' | 'planned';
  readonly profile: ArtistProfileContract;
  readonly constraints: Partial<
    Record<ArtistProfileField, { readonly maxLength: number }>
  >;
  readonly recovery: 'manual' | 'unsupported';
  readonly aliases?: readonly string[];
  readonly documentation?: Pick<
    DspProfileDestination,
    'apiFields' | 'authorization' | 'evidence' | 'quota' | 'termsApi'
  >;
}

function fromDsp(
  destination: DspProfileDestination,
  sources: ArtistProfileDestinationManifest['sources']
): ArtistProfileDestinationManifest {
  return {
    label: destination.label,
    sources,
    rollout: destination.availability,
    profile: destination.artistProfile,
    constraints: {},
    recovery: 'unsupported',
    aliases:
      destination.legacyBioProviderId === destination.id
        ? []
        : [destination.legacyBioProviderId],
    documentation: {
      apiFields: destination.apiFields,
      authorization: destination.authorization,
      evidence: destination.evidence,
      quota: destination.quota,
      termsApi: destination.termsApi,
    },
  };
}

/**
 * Social entries stay planned: checked-in parsers do not authorize remote
 * reads or writes. Pass `sources` here; the admission scan reads category
 * literals from each destination initializer and does not enter this helper.
 */
function fromSocial(
  id: Exclude<keyof typeof SOCIAL_PROFILE_CATALOG, 'youtube'>,
  sources: ArtistProfileDestinationManifest['sources']
): ArtistProfileDestinationManifest {
  const destination = SOCIAL_PROFILE_CATALOG[id];
  return {
    label: destination.label,
    sources,
    rollout: destination.availability,
    profile: destination.artistProfile,
    constraints: {},
    recovery: 'unsupported',
  };
}

/**
 * Destination inventory, including read-only ingestion and disabled DSP paths.
 * Connector field policies remain owned by their existing connector manifest.
 * No connection records, credentials, account IDs or provider clients belong here.
 */
export const ARTIST_PROFILE_DESTINATIONS = {
  amazon_music: fromDsp(DSP_PROFILE_CATALOG.amazon_music, ['dsp_bio']),
  apple_music: fromDsp(DSP_PROFILE_CATALOG.apple_music, ['dsp_bio']),
  beacons: fromSocial('beacons', ['ingestion']),
  deezer: fromDsp(DSP_PROFILE_CATALOG.deezer, ['dsp_bio']),
  instagram: fromSocial('instagram', ['ingestion']),
  laylo: fromSocial('laylo', ['ingestion']),
  linktree: fromSocial('linktree', ['ingestion']),
  soundcloud: fromDsp(DSP_PROFILE_CATALOG.soundcloud, ['dsp_bio', 'ingestion']),
  spotify: fromDsp(DSP_PROFILE_CATALOG.spotify, ['connector', 'dsp_bio']),
  tidal: fromDsp(DSP_PROFILE_CATALOG.tidal, ['dsp_bio']),
  tiktok: fromSocial('tiktok', ['ingestion']),
  twitter: fromSocial('twitter', ['ingestion']),
  youtube: fromDsp(DSP_PROFILE_CATALOG.youtube, [
    'connector',
    'dsp_bio',
    'ingestion',
  ]),
} as const satisfies Record<string, ArtistProfileDestinationManifest>;
