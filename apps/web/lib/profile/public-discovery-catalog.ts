import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { loadProfileCompleteness } from './completeness.server';
import { filterPublicDiscoveryIdentities } from './public-profile-indexing-policy';

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
}

export type ArtistsDirectoryCatalogResult =
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ok';
      readonly profiles: readonly ArtistsDirectoryCatalogProfile[];
    };

export function toArtistsDirectoryProfiles(
  rows: readonly ArtistsDirectoryCatalogRow[] | null | undefined,
  eligibleIds: ReadonlySet<string> = new Set()
): ArtistsDirectoryCatalogProfile[] {
  if (!Array.isArray(rows)) return [];

  return filterPublicDiscoveryIdentities(
    rows.map(row => ({
      ...row,
      handle: row.handle ?? row.username,
    }))
  )
    .filter(row => Boolean(row.avatarUrl) && eligibleIds.has(row.id))
    .map(row => ({
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

    const assessments = await loadProfileCompleteness(rows.map(row => row.id));
    return {
      status: 'ok',
      profiles: toArtistsDirectoryProfiles(
        rows,
        new Set(
          [...assessments]
            .filter(([, result]) => result.eligible)
            .map(([id]) => id)
        )
      ),
    };
  } catch (error) {
    Sentry.captureException(error);
    return { status: 'unavailable' };
  }
}

// Certification expiry and profile edits must take effect on the next request.
export const loadArtistsDirectoryProfiles = queryArtistsDirectoryCatalog;
