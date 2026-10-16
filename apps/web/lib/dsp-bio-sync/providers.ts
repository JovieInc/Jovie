import { projectArtistProfileDestination } from '@/lib/connectors/artist-profile-catalog';
import { ARTIST_PROFILE_DESTINATIONS } from '@/lib/connectors/artist-profile-registry';
import {
  DSP_PROFILE_CATALOG,
  type DspProfileDestination,
} from '@/lib/connectors/dsp-profile-catalog';

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

/** Compatibility data is derived from the safe projection, never independent readiness. */
function projectBioProvider(
  destination: DspProfileDestination
): DspBioProvider {
  const manifest = ARTIST_PROFILE_DESTINATIONS[destination.id];
  const bio = projectArtistProfileDestination(destination.id, manifest)
    .fields[0];
  return {
    displayName: destination.label,
    method: destination.transport.legacyBio,
    enabled: bio.write.available,
    rollback: bio.recovery,
    notes: `${destination.blockedReason} ${destination.apiFields.bio.detail}`,
    artistPortalUrl: destination.artistPortalUrl,
    maxBioLength: bio.constraints.maxLength,
  };
}

export const DSP_BIO_PROVIDERS: Record<string, DspBioProvider> =
  Object.fromEntries(
    Object.values(DSP_PROFILE_CATALOG).map(destination => [
      destination.legacyBioProviderId,
      projectBioProvider(destination),
    ])
  );

/** Reproject at call time so expiry cannot remain available in a long-lived process. */
export function getBioProvider(providerId: string): DspBioProvider | undefined {
  const destination = Object.values(DSP_PROFILE_CATALOG).find(
    item => item.legacyBioProviderId === providerId
  );
  return destination ? projectBioProvider(destination) : undefined;
}

export function getEnabledBioProviders(): Array<[string, DspBioProvider]> {
  return Object.keys(DSP_BIO_PROVIDERS).flatMap(id => {
    const provider = getBioProvider(id);
    return provider?.enabled
      ? [[id, provider] as [string, DspBioProvider]]
      : [];
  });
}

export function getEmailBioProviders(): Array<[string, DspBioProvider]> {
  return getEnabledBioProviders().filter(
    ([, provider]) => provider.method === 'email'
  );
}

export function getApiBioProviders(): Array<[string, DspBioProvider]> {
  return getEnabledBioProviders().filter(
    ([, provider]) => provider.method === 'api'
  );
}

export function isBioSyncSupported(providerId: string): boolean {
  return Boolean(getBioProvider(providerId)?.enabled);
}
