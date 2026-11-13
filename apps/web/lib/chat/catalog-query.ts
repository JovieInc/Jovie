import 'server-only';

import {
  and,
  asc,
  desc,
  sql as drizzleSql,
  eq,
  ilike,
  isNull,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  discogReleases,
  providerLinks,
  providers,
} from '@/lib/db/schema/content';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrNull } from '@/lib/utils/date';
import { DISCOGRAPHY_PROMPT_ROW_LIMIT } from './discography-prompt';
import { extractEntities } from './tokens';
import type { ChatReleaseLookup, ReleaseContext } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cap on provider-link evidence per lookup; keeps tool output bounded. */
const PROVIDER_LINK_LIMIT = 20;

/** Bound on per-turn beyond-slice token hydration queries. */
const TOKEN_HYDRATION_LIMIT = 8;

/** Candidate rows scanned when a turn names a release outside the shown list. */
const NAMED_CANDIDATE_LIMIT = 20;

/** Named releases appended to the discography section. */
const NAMED_PROMPT_LIMIT = 3;

/**
 * Unquoted single-word titles shorter than this are too easy to false-match
 * ("love", "single"). Quoted titles and multi-word titles stay eligible.
 */
const UNQUOTED_SINGLE_WORD_MIN = 8;

function releaseColumns() {
  return {
    id: discogReleases.id,
    title: discogReleases.title,
    releaseType: discogReleases.releaseType,
    releaseDate: discogReleases.releaseDate,
    artworkUrl: discogReleases.artworkUrl,
    spotifyPopularity: discogReleases.spotifyPopularity,
    totalTracks: discogReleases.totalTracks,
    upc: discogReleases.upc,
    label: discogReleases.label,
    distributor: discogReleases.distributor,
    metadata: discogReleases.metadata,
  };
}

type ReleaseRow = {
  id: string;
  title: string;
  releaseType: string;
  releaseDate: Date | string | null;
  artworkUrl: string | null;
  spotifyPopularity: number | null;
  totalTracks: number;
  upc: string | null;
  label: string | null;
  distributor: string | null;
  metadata: Record<string, unknown> | null;
};

/** Deterministic known-dates-first ordering for every release query here. */
function releaseOrder() {
  return [
    drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`,
    desc(discogReleases.id),
  ] as const;
}

async function queryOwnedReleases(
  ownership: ReturnType<typeof and>,
  filter: ReturnType<typeof and>,
  withOrder: boolean
): Promise<ReleaseRow[]> {
  const query = db
    .select(releaseColumns())
    .from(discogReleases)
    .where(and(ownership, filter));
  const ordered = withOrder ? query.orderBy(...releaseOrder()) : query;
  return ordered.limit(1);
}

/**
 * Owned release lookup for chat tool executors, against the FULL catalog
 * rather than the per-turn prompt slice (dogfood 2026-11-10: a release past
 * the 50-row slice was reported as "not found").
 *
 * - Scoped to `profileId` and live rows only (soft-deleted/archived excluded),
 *   so a lookup can never resolve another artist's release.
 * - Title matching: exact (case-insensitive) first, then substring. Both
 *   tiers order `releaseDate DESC NULLS LAST` with an id tiebreaker so
 *   duplicate or undated titles resolve deterministically (known dates first).
 * - Returns identity + catalog identifiers + provider links so tool output
 *   can ground statements about the release with evidence.
 * - Throws on DB failure: callers surface an error/unavailable outcome
 *   rather than a false "not found".
 */
export async function findOwnedReleaseForChat(
  profileId: string,
  input: { releaseId?: string; releaseTitle?: string }
): Promise<ChatReleaseLookup | null> {
  const releaseId = input.releaseId?.trim();
  const releaseTitle = input.releaseTitle?.trim();
  if (!releaseId && !releaseTitle) return null;

  const ownership = and(
    eq(discogReleases.creatorProfileId, profileId),
    isNull(discogReleases.deletedAt)
  );

  let row: ReleaseRow | undefined;

  if (releaseId) {
    // Guard the uuid column: a malformed id would throw at the DB boundary
    // where the in-memory resolver used to return null.
    if (!UUID_PATTERN.test(releaseId)) return null;
    row = (
      await db
        .select(releaseColumns())
        .from(discogReleases)
        .where(and(ownership, eq(discogReleases.id, releaseId)))
        .limit(1)
    )[0];
  } else if (releaseTitle) {
    row = (
      await queryOwnedReleases(
        ownership,
        drizzleSql`lower(${discogReleases.title}) = lower(${releaseTitle})`,
        true
      )
    )[0];
    if (!row) {
      const escaped = releaseTitle.replaceAll(/[\\%_]/g, match => `\\${match}`);
      row = (
        await queryOwnedReleases(
          ownership,
          ilike(discogReleases.title, `%${escaped}%`),
          true
        )
      )[0];
    }
  } else {
    return null;
  }

  if (!row) return null;

  const links = await db
    .select({
      provider: providers.displayName,
      url: providerLinks.url,
      isPrimary: providerLinks.isPrimary,
    })
    .from(providerLinks)
    .innerJoin(providers, eq(providers.id, providerLinks.providerId))
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, row.id)
      )
    )
    // Primary links first, then a stable alphabetical order.
    .orderBy(desc(providerLinks.isPrimary), asc(providers.displayName))
    .limit(PROVIDER_LINK_LIMIT);

  return {
    ...row,
    releaseDate: toISOStringOrNull(row.releaseDate),
    canvasStatus: getCanvasStatusFromMetadata(row.metadata),
    providerLinks: links.map(link => ({
      provider: link.provider,
      url: link.url,
      isPrimary: link.isPrimary,
    })),
  };
}

function matchesExact(release: ReleaseContext, title: string): boolean {
  return release.title.toLowerCase() === title.toLowerCase();
}

function matchesPartial(release: ReleaseContext, title: string): boolean {
  return release.title.toLowerCase().includes(title.toLowerCase());
}

/**
 * Resolve a release the artist referenced by id or title, with explicit
 * precedence (dogfood 2026-11-10, Astra review): local exact → owned database
 * exact → local partial → owned database partial. A local substring match
 * (e.g. a loaded "Title — Remix") must never beat a full-catalog exact match
 * ("Title" beyond the loaded slice).
 *
 * `match: 'exact'` stops after the exact tiers, for callers with their own
 * ambiguity handling. DB failures propagate so callers never answer a false
 * "not found".
 */
export async function resolveChatRelease(
  profileId: string | null,
  releases: readonly ReleaseContext[],
  input: {
    releaseId?: string;
    releaseTitle?: string;
    match?: 'exact' | 'any';
  }
): Promise<ReleaseContext | null> {
  const releaseId = input.releaseId?.trim();
  const releaseTitle = input.releaseTitle?.trim();

  if (releaseId) {
    const local = releases.find(item => item.id === releaseId) ?? null;
    if (local) return local;
    if (!profileId) return null;
    return findOwnedReleaseForChat(profileId, { releaseId });
  }

  if (!releaseTitle) return null;

  const localExact =
    releases.find(item => matchesExact(item, releaseTitle)) ?? null;
  if (localExact) return localExact;

  if (profileId) {
    const ownedExact = await findOwnedReleaseForChat(profileId, {
      releaseTitle,
    });
    // findOwnedReleaseForChat itself tries exact before partial; only an
    // exact result counts in the exact tier.
    if (
      ownedExact &&
      ownedExact.title.toLowerCase() === releaseTitle.toLowerCase()
    ) {
      return ownedExact;
    }
    if (input.match === 'exact') return null;

    const localPartial =
      releases.find(item => matchesPartial(item, releaseTitle)) ?? null;
    if (localPartial) return localPartial;
    return ownedExact; // owned partial match, or null when nothing matched
  }

  if (input.match === 'exact') return null;
  return releases.find(item => matchesPartial(item, releaseTitle)) ?? null;
}

/**
 * Resolve `@release:<id>` entity tokens whose ids are missing from the loaded
 * slice, through the same ownership-scoped query (Astra review: beyond-slice
 * token hydration). Bounded and deduplicated; supplements hydration input
 * only — it never inflates catalog counts or lifts the prompt cap. Token
 * labels are never trusted; ids are resolved against the owned catalog.
 */
export async function resolveOwnedReleaseTokensForHydration(
  releases: readonly ReleaseContext[],
  userTexts: readonly string[],
  profileId: string | null
): Promise<ReleaseContext[]> {
  if (!profileId) return [];
  const loadedIds = new Set(releases.map(release => release.id));
  const missingIds: string[] = [];
  for (const text of userTexts) {
    for (const token of extractEntities(text)) {
      if (
        token.kind === 'release' &&
        !loadedIds.has(token.id) &&
        !missingIds.includes(token.id) &&
        UUID_PATTERN.test(token.id)
      ) {
        missingIds.push(token.id);
      }
    }
  }
  const resolved: ReleaseContext[] = [];
  for (const id of missingIds.slice(0, TOKEN_HYDRATION_LIMIT)) {
    const release = await findOwnedReleaseForChat(profileId, {
      releaseId: id,
    });
    if (release) resolved.push(release);
  }
  return resolved;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleMentioned(blob: string, title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < 2) return false;
  const lowerBlob = blob.toLowerCase();
  const needle = trimmed.toLowerCase();
  const quoted =
    lowerBlob.includes(`"${needle}"`) ||
    lowerBlob.includes(`'${needle}'`) ||
    lowerBlob.includes(`“${needle}”`) ||
    lowerBlob.includes(`‘${needle}’`);
  if (quoted) return true;
  const specific =
    trimmed.length >= UNQUOTED_SINGLE_WORD_MIN ||
    (trimmed.length >= 4 && /\s/u.test(trimmed));
  if (!specific) return false;
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?:[^\\p{L}\\p{N}]|$)`,
    'iu'
  );
  return pattern.test(lowerBlob);
}

function toReleaseContext(row: ReleaseRow): ReleaseContext {
  return {
    id: row.id,
    title: row.title,
    releaseType: row.releaseType,
    releaseDate: toISOStringOrNull(row.releaseDate),
    artworkUrl: row.artworkUrl,
    spotifyPopularity: row.spotifyPopularity,
    totalTracks: row.totalTracks,
    canvasStatus: getCanvasStatusFromMetadata(row.metadata),
    metadata: row.metadata,
  };
}

/**
 * Releases the artist named in prose that are not already in the shown
 * discography rows. Loaded-but-unshown rows are matched in memory; anything
 * past the loaded slice is one profile-scoped scan. Callers must skip this
 * when the catalog read itself failed.
 */
export async function resolveNamedOwnedReleasesForPrompt(
  releases: readonly ReleaseContext[],
  userTexts: readonly string[],
  profileId: string | null
): Promise<ReleaseContext[]> {
  const blob = userTexts.join('\n').trim();
  if (blob.length === 0) return [];

  const shown = releases.slice(0, DISCOGRAPHY_PROMPT_ROW_LIMIT);
  const shownIds = new Set(shown.map(release => release.id));
  const shownTitles = new Set(
    shown.map(release => release.title.toLowerCase())
  );
  const picked: ReleaseContext[] = [];

  const consider = (release: ReleaseContext) => {
    if (picked.length >= NAMED_PROMPT_LIMIT) return;
    if (
      shownIds.has(release.id) ||
      shownTitles.has(release.title.toLowerCase())
    ) {
      return;
    }
    if (picked.some(item => item.id === release.id)) return;
    if (!titleMentioned(blob, release.title)) return;
    picked.push(release);
  };

  for (const release of releases.slice(DISCOGRAPHY_PROMPT_ROW_LIMIT)) {
    consider(release);
  }
  if (!profileId || picked.length >= NAMED_PROMPT_LIMIT) return picked;

  const rows = await db
    .select(releaseColumns())
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        isNull(discogReleases.deletedAt),
        drizzleSql`char_length(${discogReleases.title}) >= 2`,
        drizzleSql`strpos(lower(${blob}), lower(${discogReleases.title})) > 0`
      )
    )
    .orderBy(
      drizzleSql`char_length(${discogReleases.title}) desc`,
      ...releaseOrder()
    )
    .limit(NAMED_CANDIDATE_LIMIT);

  for (const row of rows) consider(toReleaseContext(row));
  return picked;
}
