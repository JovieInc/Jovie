import type { ArtistRole } from '@/lib/db/schema/content';

/**
 * Credit roles that represent a public artist collaboration.
 *
 * Production and songwriting roles remain visible on release credit surfaces,
 * but they do not automatically create an artist profile or enter the profile
 * collaborator sentence. This prevents a producer, engineer, or composer from
 * being represented as a performing artist without structured artist credit.
 */
export const PUBLIC_ARTIST_COLLABORATOR_ROLES = [
  'main_artist',
  'featured_artist',
  'remixer',
  'vs',
  'with',
] as const satisfies readonly ArtistRole[];

export type PublicArtistCollaboratorRole =
  (typeof PUBLIC_ARTIST_COLLABORATOR_ROLES)[number];

export function isPublicArtistCollaboratorRole(
  role: ArtistRole
): role is PublicArtistCollaboratorRole {
  return PUBLIC_ARTIST_COLLABORATOR_ROLES.includes(
    role as PublicArtistCollaboratorRole
  );
}
