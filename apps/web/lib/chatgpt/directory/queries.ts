import 'server-only';

import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import {
  ARTIST_SEARCH_MAX,
  ARTIST_SEARCH_MIN,
  escapeLikeContains,
  type PublicArtistProfile,
  type PublicArtistSource,
  type PublicArtistUpdates,
  rankPublicArtists,
  toPublicArtistProfile,
  toPublicArtistUpdates,
} from './contract';

const SCAN_LIMIT = 20;

const publicColumns = {
  username: creatorProfiles.username,
  displayName: creatorProfiles.displayName,
  bio: creatorProfiles.bio,
  location: creatorProfiles.location,
  genres: creatorProfiles.genres,
  avatarUrl: creatorProfiles.avatarUrl,
  spotifyUrl: creatorProfiles.spotifyUrl,
  appleMusicUrl: creatorProfiles.appleMusicUrl,
  youtubeUrl: creatorProfiles.youtubeUrl,
  isPublic: creatorProfiles.isPublic,
};

const identifiedColumns = {
  id: creatorProfiles.id,
  ...publicColumns,
};

function normalizedHandle(username: string): string {
  return username.trim().toLowerCase();
}

export async function findPublicArtists(
  query: string
): Promise<PublicArtistProfile[]> {
  const trimmed = query.trim();
  if (
    trimmed.length < ARTIST_SEARCH_MIN ||
    trimmed.length > ARTIST_SEARCH_MAX
  ) {
    return [];
  }
  const pattern = escapeLikeContains(trimmed);
  const rows = await db
    .select(publicColumns)
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        or(
          ilike(creatorProfiles.username, pattern),
          ilike(creatorProfiles.usernameNormalized, pattern),
          ilike(creatorProfiles.displayName, pattern)
        )
      )
    )
    .limit(SCAN_LIMIT);
  return rankPublicArtists(rows, trimmed);
}

async function loadPublicRow(
  username: string
): Promise<(PublicArtistSource & { id: string }) | null> {
  const handle = normalizedHandle(username);
  if (!handle) return null;
  const [row] = await db
    .select(identifiedColumns)
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        eq(creatorProfiles.usernameNormalized, handle)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getPublicArtist(
  username: string
): Promise<PublicArtistProfile | null> {
  const row = await loadPublicRow(username);
  if (!row) return null;
  return toPublicArtistProfile(row);
}

export async function getPublicArtistUpdates(
  username: string
): Promise<PublicArtistUpdates | null> {
  const row = await loadPublicRow(username);
  if (!row) return null;
  const profile = toPublicArtistProfile(row);
  if (!profile) return null;
  const [releases, events] = await Promise.all([
    getReleasesForProfileLite(row.id),
    getUpcomingTourDatesForProfile(row.id),
  ]);
  return toPublicArtistUpdates(profile, releases, events);
}
