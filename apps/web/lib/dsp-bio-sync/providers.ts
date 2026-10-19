import { projectArtistProfileDestination } from '@/lib/connectors/artist-profile-catalog';
import { ARTIST_PROFILE_DESTINATIONS } from '@/lib/connectors/artist-profile-registry';
import { DSP_PROFILE_CATALOG } from '@/lib/connectors/dsp-profile-catalog';
import { PROFILE_DESTINATION_REGISTRY } from '@/lib/connectors/profile-writes/destinations';

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
  artistPortalUrl: string;
  /** Max bio character length enforced by this DSP (if known) */
  maxBioLength: number;
}

function bioField(providerId: string) {
  const destination = Object.values(DSP_PROFILE_CATALOG).find(
    item => item.legacyBioProviderId === providerId
  );
  if (!destination) throw new Error('unregistered-profile-destination');
  return projectArtistProfileDestination(
    destination.id,
    ARTIST_PROFILE_DESTINATIONS[destination.id]
  ).fields[0];
}

/**
 * Compatibility projection of the canonical DSP catalog. Historical transport
 * metadata grants no delivery permission; current submission evidence is required.
 */
export const DSP_BIO_PROVIDERS: Record<string, DspBioProvider> =
  Object.fromEntries(
    Object.entries(PROFILE_DESTINATION_REGISTRY).map(([id, destination]) => [
      id,
      {
        displayName: destination.label,
        method: destination.method,
        get enabled() {
          return bioField(id).submission?.available ?? false;
        },
        get rollback(): DspBioProvider['rollback'] {
          const field = bioField(id);
          return field.submission?.available
            ? field.submission.rollback
            : field.recovery;
        },
        notes:
          destination.method === 'email'
            ? 'Submission requires current terms evidence and explicit approval.'
            : 'API bio updates are unsupported.',
        artistPortalUrl: destination.portal,
        maxBioLength: destination.maxBioLength,
      },
    ])
  );

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
  return Object.hasOwn(DSP_BIO_PROVIDERS, providerId)
    ? DSP_BIO_PROVIDERS[providerId]
    : undefined;
}

/**
 * Check if a DSP supports bio sync.
 */
export function isBioSyncSupported(providerId: string): boolean {
  const provider = DSP_BIO_PROVIDERS[providerId];
  return Boolean(provider?.enabled);
}
