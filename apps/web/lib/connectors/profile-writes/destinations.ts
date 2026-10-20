import { DSP_PROFILE_CATALOG } from '@/lib/connectors/dsp-profile-catalog';
import type { ProfileWriteManifest } from './contract';

/** Shared catalog. Historical addresses are hints, never terms evidence. */
interface Destination {
  label: string;
  method: 'api' | 'email';
  recipient: string;
  portal: string;
  maxBioLength: number;
}
/** Submission configuration only; identity and transport come from the catalog. */
const BIO_SUBMISSION_CONFIG: Record<
  string,
  { recipient: string; maxBioLength: number }
> = {
  amazon_music: {
    recipient: 'amazonmusicforartists@amazon.com',
    maxBioLength: 5000,
  },
  apple_music: { recipient: 'musicpartners@apple.com', maxBioLength: 5000 },
  deezer: { recipient: 'artists@deezer.com', maxBioLength: 5000 },
  soundcloud: { recipient: '', maxBioLength: 4000 },
  spotify: { recipient: 'artists@spotify.com', maxBioLength: 1500 },
  tidal: { recipient: 'artists@tidal.com', maxBioLength: 5000 },
  youtube_music: { recipient: '', maxBioLength: 5000 },
};

export const PROFILE_DESTINATION_REGISTRY: Record<string, Destination> =
  Object.fromEntries(
    Object.values(DSP_PROFILE_CATALOG).map(destination => [
      destination.legacyBioProviderId,
      {
        label: destination.label,
        method: destination.transport.legacyBio,
        portal: destination.artistPortalUrl,
        ...BIO_SUBMISSION_CONFIG[destination.legacyBioProviderId],
      },
    ])
  );

export function getProfileDestination(providerId: string) {
  return Object.hasOwn(PROFILE_DESTINATION_REGISTRY, providerId)
    ? PROFILE_DESTINATION_REGISTRY[providerId]
    : undefined;
}

/** No evidence has been commissioned for these legacy destinations. Fail closed. */
export function getBioSubmissionManifest(
  providerId: string
): ProfileWriteManifest {
  const destination = getProfileDestination(providerId);
  if (!destination || destination.method !== 'email')
    throw new Error('unsupported-bio-method');
  return {
    providerId,
    operation: 'email-submission',
    version: '1',
    fields: ['bio'],
    requiredScopes: [], // Profile ownership and a confirmed DSP match authorize proposals.
    termsApproved: false,
    evidenceRef: '',
    evidenceExpiresAt: '',
    rollback: 'manual',
    recipient: destination.recipient,
    maxBioLength: destination.maxBioLength,
    rateLimitWindowSeconds: 86400,
  };
}

export function canExecuteBioSubmission(
  m: ProfileWriteManifest,
  now = Date.now()
) {
  return (
    m.operation === 'email-submission' &&
    m.termsApproved &&
    Boolean(m.evidenceRef) &&
    Date.parse(m.evidenceExpiresAt) > now
  );
}
