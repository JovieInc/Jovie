import { projectArtistProfileDestination } from '@/lib/connectors/artist-profile-catalog';
import {
  ARTIST_PROFILE_DESTINATIONS,
  type ArtistProfileDestinationManifest,
} from '@/lib/connectors/artist-profile-registry';

/** Transport details only; profile readiness and constraints come from the catalog. */
export type BioSyncMethod = 'api' | 'email';

export interface DspBioProvider {
  /** Human-readable DSP name */
  displayName: string;
  /** How bio updates are submitted to this DSP */
  method: BioSyncMethod;
  /** Support email address for email-based updates */
  supportEmail?: string;
  /** Whether this provider is currently enabled for bio sync */
  enabled: boolean;
  /** Email requests cannot prove a destination snapshot or conditional restore. */
  rollback: 'manual' | 'unsupported';
  /** Notes about the integration status */
  notes: string;
  /** URL for the DSP's artist portal (for reference/linking) */
  artistPortalUrl?: string;
  /** Max bio character length enforced by this DSP (if known) */
  maxBioLength?: number;
}

/**
 * Transport configuration only. These addresses and API methods do not prove
 * write readiness; all enabled/rollback/constraint metadata is projected below.
 */
export const DSP_BIO_PROVIDERS: Record<
  string,
  Omit<DspBioProvider, 'enabled' | 'rollback' | 'maxBioLength'>
> = {
  amazon_music: {
    displayName: 'Amazon Music',
    method: 'email',
    supportEmail: 'amazonmusicforartists@amazon.com',
    notes:
      'Amazon Music for Artists portal allows manual bio updates. Email support is available for bulk or programmatic updates.',
    artistPortalUrl: 'https://artists.amazonmusic.com',
  },
  apple_music: {
    displayName: 'Apple Music',
    method: 'email',
    supportEmail: 'musicpartners@apple.com',
    notes:
      'Apple Music for Artists does not expose a bio update API. Bios are submitted through the distributor or via Apple Music for Artists support.',
    artistPortalUrl: 'https://artists.apple.com',
  },
  deezer: {
    displayName: 'Deezer',
    method: 'email',
    supportEmail: 'artists@deezer.com',
    notes:
      'Deezer does not have a public API for artist bio updates. Requests are sent to the Deezer for Artists support team.',
    artistPortalUrl: 'https://artists.deezer.com',
  },
  soundcloud: {
    displayName: 'SoundCloud',
    method: 'api',
    notes:
      'SoundCloud API supports profile description updates via PUT /me with OAuth. Requires user to connect their SoundCloud account.',
    artistPortalUrl: 'https://soundcloud.com',
  },
  spotify: {
    displayName: 'Spotify',
    method: 'email',
    supportEmail: 'artists@spotify.com',
    notes:
      'Spotify for Artists API does not support bio updates. Bios are typically updated through the distributor or Spotify for Artists dashboard. Email requests are accepted for verified artists.',
    artistPortalUrl: 'https://artists.spotify.com',
  },
  tidal: {
    displayName: 'TIDAL',
    method: 'email',
    supportEmail: 'artists@tidal.com',
    notes:
      'TIDAL does not have a public API for bio updates. Artist bios are updated via support email or through the distributor.',
    artistPortalUrl: 'https://artists.tidal.com',
  },
  youtube_music: {
    displayName: 'YouTube Music',
    method: 'api',
    notes:
      'YouTube Data API v3 supports channel description updates via channels.update. Requires user to grant YouTube OAuth access with channel.update scope.',
    artistPortalUrl: 'https://artists.youtube.com',
  },
} as const;

/**
 * Get all providers that support bio sync (enabled only).
 */
export function getEnabledBioProviders(): Array<[string, DspBioProvider]> {
  return Object.keys(DSP_BIO_PROVIDERS).flatMap(id => {
    const provider = getBioProvider(id);
    return provider?.enabled
      ? [[id, provider] as [string, DspBioProvider]]
      : [];
  });
}

/**
 * Get all email-based providers (enabled only).
 */
export function getEmailBioProviders(): Array<[string, DspBioProvider]> {
  return getEnabledBioProviders().filter(
    ([, provider]) => provider.method === 'email'
  );
}

/**
 * Get all API-based providers (enabled only).
 */
export function getApiBioProviders(): Array<[string, DspBioProvider]> {
  return getEnabledBioProviders().filter(
    ([, provider]) => provider.method === 'api'
  );
}

/**
 * Get a specific DSP bio provider config.
 */
export function getBioProvider(providerId: string): DspBioProvider | undefined {
  const transport = DSP_BIO_PROVIDERS[providerId];
  const manifest = (
    ARTIST_PROFILE_DESTINATIONS as Readonly<
      Record<string, ArtistProfileDestinationManifest>
    >
  )[providerId];
  if (!transport || !manifest) return undefined;
  const bio = projectArtistProfileDestination(providerId, manifest).fields.find(
    field => field.name === 'bio'
  );
  if (!bio) return undefined;
  return {
    ...transport,
    enabled: bio.write.available,
    rollback: bio.recovery,
    maxBioLength: bio.constraints.maxLength,
  };
}

/**
 * Check if a DSP supports bio sync.
 */
export function isBioSyncSupported(providerId: string): boolean {
  const provider = getBioProvider(providerId);
  return Boolean(provider?.enabled);
}
