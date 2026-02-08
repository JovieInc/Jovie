/**
 * DSP Bio Sync Provider Registry
 *
 * Defines how each DSP handles artist bio updates:
 * - 'api': DSP has a writable API (requires OAuth or partnership)
 * - 'email': DSP only accepts bio updates via support email
 *
 * For email-based DSPs, we send a professionally formatted email on behalf
 * of the artist to the DSP's artist support team requesting the bio update.
 */

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
  /** Notes about the integration status */
  notes: string;
  /** URL for the DSP's artist portal (for reference/linking) */
  artistPortalUrl?: string;
  /** Max bio character length enforced by this DSP (if known) */
  maxBioLength?: number;
}

/**
 * Registry of all DSPs and their bio update capabilities.
 *
 * API-based updates are stubbed for future OAuth integration.
 * Email-based updates use verified support addresses for each DSP.
 */
export const DSP_BIO_PROVIDERS: Record<string, DspBioProvider> = {
  spotify: {
    displayName: 'Spotify',
    method: 'email',
    supportEmail: 'artists@spotify.com',
    enabled: true,
    notes:
      'Spotify for Artists API does not support bio updates. Bios are typically updated through the distributor or Spotify for Artists dashboard. Email requests are accepted for verified artists.',
    artistPortalUrl: 'https://artists.spotify.com',
    maxBioLength: 1500,
  },
  apple_music: {
    displayName: 'Apple Music',
    method: 'email',
    supportEmail: 'musicpartners@apple.com',
    enabled: true,
    notes:
      'Apple Music for Artists does not expose a bio update API. Bios are submitted through the distributor or via Apple Music for Artists support.',
    artistPortalUrl: 'https://artists.apple.com',
  },
  amazon_music: {
    displayName: 'Amazon Music',
    method: 'email',
    supportEmail: 'amazonmusicforartists@amazon.com',
    enabled: true,
    notes:
      'Amazon Music for Artists portal allows manual bio updates. Email support is available for bulk or programmatic updates.',
    artistPortalUrl: 'https://artists.amazonmusic.com',
  },
  tidal: {
    displayName: 'TIDAL',
    method: 'email',
    supportEmail: 'artists@tidal.com',
    enabled: true,
    notes:
      'TIDAL does not have a public API for bio updates. Artist bios are updated via support email or through the distributor.',
    artistPortalUrl: 'https://artists.tidal.com',
  },
  deezer: {
    displayName: 'Deezer',
    method: 'email',
    supportEmail: 'artists@deezer.com',
    enabled: true,
    notes:
      'Deezer does not have a public API for artist bio updates. Requests are sent to the Deezer for Artists support team.',
    artistPortalUrl: 'https://artists.deezer.com',
  },
  soundcloud: {
    displayName: 'SoundCloud',
    method: 'api',
    enabled: false,
    notes:
      'SoundCloud API supports profile description updates via PUT /me with OAuth. Requires user to connect their SoundCloud account.',
    artistPortalUrl: 'https://soundcloud.com',
    maxBioLength: 4000,
  },
  youtube_music: {
    displayName: 'YouTube Music',
    method: 'api',
    enabled: false,
    notes:
      'YouTube Data API v3 supports channel description updates via channels.update. Requires user to grant YouTube OAuth access with channel.update scope.',
    artistPortalUrl: 'https://artists.youtube.com',
    maxBioLength: 5000,
  },
} as const;

/**
 * Get all providers that support bio sync (enabled only).
 */
export function getEnabledBioProviders(): Array<[string, DspBioProvider]> {
  return Object.entries(DSP_BIO_PROVIDERS).filter(
    ([, provider]) => provider.enabled
  );
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
  return DSP_BIO_PROVIDERS[providerId];
}

/**
 * Check if a DSP supports bio sync.
 */
export function isBioSyncSupported(providerId: string): boolean {
  const provider = DSP_BIO_PROVIDERS[providerId];
  return Boolean(provider?.enabled);
}
