import type { ProfileWriteManifest } from './contract';

/** Shared catalog. Historical addresses are hints, never terms evidence. */
interface Destination {
  label: string;
  method: 'api' | 'email';
  recipient: string;
  portal: string;
  maxBioLength: number;
}
function email(
  label: string,
  recipient: string,
  portal: string,
  maxBioLength = 5000
): Destination {
  return { label, method: 'email', recipient, portal, maxBioLength };
}
export const PROFILE_DESTINATION_REGISTRY: Record<string, Destination> = {
  amazon_music: email(
    'Amazon Music',
    'amazonmusicforartists@amazon.com',
    'https://artists.amazonmusic.com'
  ),
  apple_music: email(
    'Apple Music',
    'musicpartners@apple.com',
    'https://artists.apple.com'
  ),
  deezer: email('Deezer', 'artists@deezer.com', 'https://artists.deezer.com'),
  soundcloud: {
    label: 'SoundCloud',
    method: 'api',
    recipient: '',
    portal: 'https://soundcloud.com',
    maxBioLength: 4000,
  },
  spotify: email(
    'Spotify',
    'artists@spotify.com',
    'https://artists.spotify.com',
    1500
  ),
  tidal: email('TIDAL', 'artists@tidal.com', 'https://artists.tidal.com'),
  youtube_music: {
    label: 'YouTube Music',
    method: 'api',
    recipient: '',
    portal: 'https://artists.youtube.com',
    maxBioLength: 5000,
  },
};

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
