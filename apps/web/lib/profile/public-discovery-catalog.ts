import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, asc, sql as drizzleSql, eq, exists } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { filterPublicDiscoveryIdentities } from './public-profile-indexing-policy';
import { publicReleaseEligibilitySqlPredicate } from './public-release-eligibility';

export interface ArtistsDirectoryCatalogProfile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

export interface ArtistsDirectoryCatalogRow
  extends ArtistsDirectoryCatalogProfile {
  readonly isPublic?: boolean | null;
  readonly ownerEmail?: string | null;
  readonly handle?: string | null;
  readonly hasPublicRelease?: boolean | null;
}

export type ArtistsDirectoryCatalogResult =
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ok';
      readonly profiles: readonly ArtistsDirectoryCatalogProfile[];
    };

export function toArtistsDirectoryProfiles(
  rows: readonly ArtistsDirectoryCatalogRow[] | null | undefined
): ArtistsDirectoryCatalogProfile[] {
  if (!Array.isArray(rows)) return [];

  return filterPublicDiscoveryIdentities(
    rows.map(row => ({
      ...row,
      handle: row.handle ?? row.username,
    }))
  ).map(row => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
  }));
}

async function queryArtistsDirectoryCatalog(): Promise<ArtistsDirectoryCatalogResult> {
  if (!process.env.DATABASE_URL) {
    return { status: 'unavailable' };
  }

  try {
    const rows = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        bio: creatorProfiles.bio,
        isPublic: creatorProfiles.isPublic,
        ownerEmail: users.email,
        hasPublicRelease: drizzleSql<boolean>`${exists(
          db
            .select({ one: drizzleSql`1` })
            .from(discogReleases)
            .where(
              and(
                eq(discogReleases.creatorProfileId, creatorProfiles.id),
                publicReleaseEligibilitySqlPredicate()
              )
            )
        )}`,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(
        and(
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true)
        )
      )
      .orderBy(asc(creatorProfiles.displayName));

    return {
      status: 'ok',
      profiles: toArtistsDirectoryProfiles(rows),
    };
  } catch (error) {
    Sentry.captureException(error);
    return { status: 'unavailable' };
  }
}

export const loadArtistsDirectoryProfiles = unstable_cache(
  queryArtistsDirectoryCatalog,
  ['artists-directory-v2'],
  {
    revalidate: 3600,
    tags: [CACHE_TAGS.ARTISTS_DIRECTORY, CACHE_TAGS.PUBLIC_PROFILE],
  }
);
