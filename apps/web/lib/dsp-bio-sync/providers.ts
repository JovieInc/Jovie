import {
  canExecuteBioSubmission,
  getBioSubmissionManifest,
  PROFILE_DESTINATION_REGISTRY,
} from '@/lib/connectors/profile-writes/destinations';

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
          return (
            destination.method === 'email' &&
            canExecuteBioSubmission(getBioSubmissionManifest(id))
          );
        },
        get rollback(): DspBioProvider['rollback'] {
          return this.enabled ? 'manual' : 'unsupported';
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
  return DSP_BIO_PROVIDERS[providerId];
}

/**
 * Check if a DSP supports bio sync.
 */
export function isBioSyncSupported(providerId: string): boolean {
  const provider = DSP_BIO_PROVIDERS[providerId];
  return Boolean(provider?.enabled);
}
