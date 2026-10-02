import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, asc, sql as drizzleSql, eq, exists } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { db, withRetry } from '@/lib/db';
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

/**
 * Upper bound on raw batches scanned per request while filling a page with
 * eligible profiles. Eligibility (QA handles, placeholder identities,
 * unpublished profiles) is enforced post-query, so a single LIMIT read can
 * under-fill a page or emit a nextCursor that resolves to an empty dead-end
 * page (JOV-6939). The cap keeps worst-case reads bounded.
 */
const ARTISTS_DIRECTORY_MAX_RAW_BATCHES = 10;

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

const PUBLIC_DIRECTORY_PREDICATE = and(
  eq(creatorProfiles.isPublic, true),
  eq(creatorProfiles.isClaimed, true)
);

function selectDirectoryRows() {
  return db
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
    .leftJoin(users, eq(users.id, creatorProfiles.userId));
}

async function queryArtistsDirectoryCatalog(
  cursorParam?: string
): Promise<Extract<ArtistsDirectoryCatalogResult, { status: 'ok' }>> {
  const cursor = decodeArtistsDirectoryCursor(cursorParam);
  if (cursorParam && !cursor) {
    Sentry.captureMessage('artists-directory: invalid cursor ignored', {
      level: 'warning',
    });
  }

  const eligible: ArtistsDirectoryCatalogProfile[] = [];
  let rawCursor = cursor;
  let rawExhausted = false;
  let lastRawRow: ArtistsDirectoryCatalogRow | undefined;

  for (
    let batch = 0;
    batch < ARTISTS_DIRECTORY_MAX_RAW_BATCHES &&
    eligible.length <= ARTISTS_DIRECTORY_PAGE_SIZE &&
    !rawExhausted;
    batch++
  ) {
    const rows = await withRetry(
      async () =>
        selectDirectoryRows()
          .where(
            and(
              PUBLIC_DIRECTORY_PREDICATE,
              rawCursor
                ? drizzleSql`(${directorySortKey}, ${creatorProfiles.id}) > (${rawCursor.key}, ${rawCursor.id})`
                : undefined
            )
          )
          .orderBy(asc(directorySortKey), asc(creatorProfiles.id))
          .limit(ARTISTS_DIRECTORY_PAGE_SIZE + 1),
      'artists-directory-page',
      2
    );

    if (rows.length === 0) {
      rawExhausted = true;
      break;
    }

    lastRawRow = rows[rows.length - 1];
    rawExhausted = rows.length <= ARTISTS_DIRECTORY_PAGE_SIZE;
    eligible.push(...toArtistsDirectoryProfiles(rows));
    rawCursor = {
      key: lastRawRow.displayName ?? '',
      id: lastRawRow.id,
    };
  }

  const profiles = eligible.slice(0, ARTISTS_DIRECTORY_PAGE_SIZE);
  // A next page only exists when we have already seen another eligible
  // profile, or when the raw scan hit the batch cap with rows unread.
  // Cursor resumes at the last displayed profile (or last scanned raw row)
  // so unconsumed rows are never skipped.
  const cursorRow =
    eligible.length > ARTISTS_DIRECTORY_PAGE_SIZE
      ? profiles[profiles.length - 1]
      : rawExhausted
        ? undefined
        : lastRawRow;
  const nextCursor = cursorRow
    ? encodeArtistsDirectoryCursor({
        key: cursorRow.displayName ?? '',
        id: cursorRow.id,
      })
    : null;

  return {
    status: 'ok',
    profiles,
    nextCursor,
  };
}

async function queryArtistsDirectoryCount(): Promise<number> {
  // Count the same identities the directory renders. Eligibility (QA
  // handles, placeholder identities, empty profiles, test accounts) is
  // enforced in filterPublicDiscoveryIdentities, so a raw SQL count would
  // over-report and disagree with the cards on the page (JOV-6435).
  const rows = await withRetry(
    async () => selectDirectoryRows().where(PUBLIC_DIRECTORY_PREDICATE),
    'artists-directory-count',
    2
  );
  return filterPublicDiscoveryIdentities(
    rows.map(row => ({ ...row, handle: row.username }))
  ).length;
}

const cachedArtistsDirectoryProfiles = unstable_cache(
  queryArtistsDirectoryCatalog,
  ['artists-directory-v3'],
  {
    revalidate: 3600,
    tags: [CACHE_TAGS.ARTISTS_DIRECTORY, CACHE_TAGS.PUBLIC_PROFILE],
  }
);

const cachedArtistsDirectoryCount = unstable_cache(
  queryArtistsDirectoryCount,
  ['artists-directory-count-v2'],
  {
    revalidate: 3600,
    tags: [CACHE_TAGS.ARTISTS_DIRECTORY, CACHE_TAGS.PUBLIC_PROFILE],
  }
);

// Keep transient failures outside the shared cache. A failed refresh can retain
// the last good value, while a cold failure is retried on the next request.
export async function loadArtistsDirectoryProfiles(
  cursorParam?: string
): Promise<ArtistsDirectoryCatalogResult> {
  if (!process.env.DATABASE_URL) return { status: 'unavailable' };
  try {
    return await cachedArtistsDirectoryProfiles(cursorParam);
  } catch (error) {
    Sentry.captureException(error);
    return { status: 'unavailable' };
  }
}

export async function loadArtistsDirectoryCount(): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await cachedArtistsDirectoryCount();
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}
