import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, asc, count, sql as drizzleSql, eq, exists } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { filterPublicDiscoveryIdentities } from './public-profile-indexing-policy';
import { publicReleaseEligibilitySqlPredicate } from './public-release-eligibility';

/**
 * Maximum profiles rendered per /artists page (JOV-6451). The query reads at
 * most PAGE_SIZE + 1 rows to detect a following page, so origin work, payload
 * size, HTML size, and image requests stay bounded as the catalog grows.
 */
export const ARTISTS_DIRECTORY_PAGE_SIZE = 60;

const directorySortKey = drizzleSql`coalesce(${creatorProfiles.displayName}, '')`;

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
      /** Opaque cursor for the next page; null when this is the last page. */
      readonly nextCursor: string | null;
    };

export interface ArtistsDirectoryPageCursor {
  /** Sort key of the last row on the previous page (coalesced display name). */
  readonly key: string;
  /** Id tiebreaker of the last row on the previous page. */
  readonly id: string;
}

export function encodeArtistsDirectoryCursor(
  cursor: ArtistsDirectoryPageCursor
): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id]), 'utf8').toString(
    'base64url'
  );
}

export function decodeArtistsDirectoryCursor(
  raw: string | null | undefined
): ArtistsDirectoryPageCursor | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8')
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { key: parsed[0], id: parsed[1] };
    }
    return null;
  } catch {
    return null;
  }
}

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

async function queryArtistsDirectoryCatalog(
  cursorParam?: string
): Promise<ArtistsDirectoryCatalogResult> {
  if (!process.env.DATABASE_URL) {
    return { status: 'unavailable' };
  }

  const cursor = decodeArtistsDirectoryCursor(cursorParam);
  if (cursorParam && !cursor) {
    Sentry.captureMessage('artists-directory: invalid cursor ignored', {
      level: 'warning',
    });
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
          eq(creatorProfiles.isClaimed, true),
          cursor
            ? drizzleSql`(${directorySortKey}, ${creatorProfiles.id}) > (${cursor.key}, ${cursor.id})`
            : undefined
        )
      )
      .orderBy(asc(directorySortKey), asc(creatorProfiles.id))
      .limit(ARTISTS_DIRECTORY_PAGE_SIZE + 1);

    const hasMore = rows.length > ARTISTS_DIRECTORY_PAGE_SIZE;
    const pageRows = hasMore
      ? rows.slice(0, ARTISTS_DIRECTORY_PAGE_SIZE)
      : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeArtistsDirectoryCursor({
            key: lastRow.displayName ?? '',
            id: lastRow.id,
          })
        : null;

    return {
      status: 'ok',
      profiles: toArtistsDirectoryProfiles(pageRows),
      nextCursor,
    };
  } catch (error) {
    Sentry.captureException(error);
    return { status: 'unavailable' };
  }
}

async function queryArtistsDirectoryCount(): Promise<number | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const [row] = await db
      .select({ value: count() })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true)
        )
      );
    return row?.value ?? null;
  } catch (error) {
    Sentry.captureException(error);
    return null;
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

export const loadArtistsDirectoryCount = unstable_cache(
  queryArtistsDirectoryCount,
  ['artists-directory-count-v1'],
  {
    revalidate: 3600,
    tags: [CACHE_TAGS.ARTISTS_DIRECTORY, CACHE_TAGS.PUBLIC_PROFILE],
  }
);
