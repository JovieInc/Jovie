import 'server-only';
import { projectArtistProfileDestination } from '../artist-profile-catalog';
import {
  ARTIST_PROFILE_DESTINATIONS,
  type ArtistProfileDestinationManifest,
} from '../artist-profile-registry';
import { digest, type ProfileWriteManifest } from './contract';

/** Adapters obtain execution metadata here; an independent capability map is forbidden. */
export function getProfileWriteManifest(
  providerId: string
): ProfileWriteManifest {
  const manifest = (
    ARTIST_PROFILE_DESTINATIONS as Readonly<
      Record<string, ArtistProfileDestinationManifest>
    >
  )[providerId];
  if (!manifest) throw new Error('unregistered-profile-destination');
  return buildProfileWriteManifest(providerId, manifest);
}

export function buildProfileWriteManifest(
  providerId: string,
  manifest: ArtistProfileDestinationManifest
): ProfileWriteManifest {
  const destination = projectArtistProfileDestination(providerId, manifest);
  const fields = destination.fields.filter(field => field.write.available);
  // The immutable ledger supports conditional snapshot restore only.
  if (
    !fields.length ||
    fields.some(field => field.rollback.mode !== 'snapshot_restore')
  )
    throw new Error('unverified-profile-destination');
  const scopes = new Set<string>();
  const expiries: string[] = [];
  const refs = new Set<string>();
  let windowSeconds = 1;
  for (const field of fields) {
    const { authorization, rateLimit, evidence } = field;
    if (
      authorization.write.status !== 'verified' ||
      rateLimit.status !== 'documented' ||
      evidence.status !== 'documented' ||
      !evidence.expiresAt
    )
      throw new Error('unverified-profile-destination');
    for (const scope of authorization.write.requiredScopes) scopes.add(scope);
    if (authorization.read.status === 'verified') {
      for (const scope of authorization.read.requiredScopes) scopes.add(scope);
    }
    for (const ref of evidence.refs) refs.add(ref);
    expiries.push(evidence.expiresAt);
    windowSeconds = Math.max(windowSeconds, rateLimit.windowSeconds);
  }
  return {
    providerId,
    version: digest(manifest),
    fields: fields.map(field =>
      field.name === 'bio_link' ? 'bioLink' : field.name
    ),
    requiredScopes: [...scopes].sort(),
    termsApproved: true,
    evidenceRef: [...refs].sort().join('\n'),
    evidenceExpiresAt: expiries.sort(
      (a, b) => Date.parse(a) - Date.parse(b)
    )[0],
    rollback: 'conditional-restore',
    rateLimitWindowSeconds: windowSeconds,
  };
}
