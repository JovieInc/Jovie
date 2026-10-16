/** Legacy bio-sync metadata derives all capability claims from the DSP catalog. */
import { DSP_PROFILE_CATALOG } from '@/lib/connectors/dsp-profile-catalog';

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
 * Compatibility projection, not a second capability registry. The historical
 * method describes the delivery category only; enabled requires verified write
 * readiness. No email recipient or delivery permission is inferred from a portal.
 */
export const DSP_BIO_PROVIDERS: Record<string, DspBioProvider> =
  Object.fromEntries(
    Object.values(DSP_PROFILE_CATALOG).map(destination => [
      destination.legacyBioProviderId,
      {
        displayName: destination.label,
        method: destination.transport.legacyBio,
        enabled: destination.artistProfile.fields.bio.write === 'supported',
        rollback: 'unsupported',
        notes: `${destination.blockedReason} ${destination.apiFields.bio.detail}`,
        artistPortalUrl: destination.artistPortalUrl,
      } satisfies DspBioProvider,
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
  return DSP_BIO_PROVIDERS[providerId];
}

/**
 * Check if a DSP supports bio sync.
 */
export function isBioSyncSupported(providerId: string): boolean {
  const provider = DSP_BIO_PROVIDERS[providerId];
  return Boolean(provider?.enabled);
}
