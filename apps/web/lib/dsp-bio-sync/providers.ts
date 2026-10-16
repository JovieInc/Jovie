import {
  canExecuteBioSubmission,
  getBioSubmissionManifest,
  PROFILE_DESTINATION_REGISTRY,
} from '@/lib/connectors/profile-writes/destinations';

export type BioSyncMethod = 'api' | 'email';
export interface DspBioProvider {
  displayName: string;
  method: BioSyncMethod;
  enabled: boolean;
  rollback: 'manual' | 'unsupported';
  notes: string;
  artistPortalUrl: string;
  maxBioLength: number;
}

/** Compatibility projection; the shared catalog owns capabilities. */
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
        rollback: destination.method === 'email' ? 'manual' : 'unsupported',
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
