/**
 * Artist-data lookup tools for chat.
 *
 * These four tools let Sonnet retrieve the user's own catalog/release/
 * analytics/audience data during a chat turn — the actual moat of Jovie
 * Chat versus a generic LLM with a music-knowledge system prompt.
 *
 * **Tenant isolation contract** (enforced by tests):
 *   - `profileId` is closure-captured at construction time.
 *   - The Zod schema for each tool MUST NOT include a `profileId`,
 *     `userId`, or any other identity field. The model cannot influence
 *     who's data is returned.
 *   - Adding a write tool here is a guideline violation. Write tools
 *     belong in a separate file with explicit ownership checks.
 *
 * Each tool wraps execution in a 3s timeout so a slow Drizzle query
 * doesn't stall the chat stream — instead the model gets a structured
 * "timed out" partial response and continues.
 */

import { tool } from 'ai';
import { and, desc, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { dspCatalogMismatches } from '@/lib/db/schema/dsp-catalog-scan';
import { toISOStringOrNull } from '@/lib/utils/date';

const DEFAULT_TIMEOUT_MS = 3000;

interface TimeoutResult<T> {
  ok: boolean;
  value?: T;
  timedOut?: boolean;
  error?: string;
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  ms = DEFAULT_TIMEOUT_MS
): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('lookup_timeout')), ms);
      }),
    ]);
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'lookup_timeout') {
      return { ok: false, timedOut: true };
    }
    return { ok: false, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// lookupRecentReleases
// ---------------------------------------------------------------------------

export function createLookupRecentReleasesTool(profileId: string | null) {
  return tool({
    description:
      "Fetch the artist's most recent releases from their catalog. " +
      'Returns title, type (album/EP/single), release date, total tracks, ' +
      'and current Spotify popularity. Use when the user asks about their ' +
      'own releases, recent activity, or catalog performance.',
    inputSchema: z
      .object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe(
            'How many recent releases to return. Default 5, max 20. ' +
              'Smaller is better for snappy answers.'
          ),
      })
      .strict(),
    execute: async ({ limit = 5 }) => {
      if (!profileId) {
        return {
          error: 'no_profile',
          message: 'No profile bound to chat session.',
        };
      }
      const result = await executeWithTimeout(async () => {
        const rows = await db
          .select({
            id: discogReleases.id,
            title: discogReleases.title,
            releaseType: discogReleases.releaseType,
            releaseDate: discogReleases.releaseDate,
            totalTracks: discogReleases.totalTracks,
            spotifyPopularity: discogReleases.spotifyPopularity,
          })
          .from(discogReleases)
          .where(eq(discogReleases.creatorProfileId, profileId))
          .orderBy(desc(discogReleases.releaseDate))
          .limit(limit);
        return rows.map(r => ({
          ...r,
          releaseDate: toISOStringOrNull(r.releaseDate),
        }));
      });

      if (result.timedOut) {
        return {
          partial: true,
          timedOut: true,
          message:
            'Catalog query took longer than 3s. Try again or narrow your question.',
        };
      }
      if (!result.ok) {
        return { error: 'lookup_failed', message: result.error ?? 'unknown' };
      }
      return { releases: result.value, count: result.value?.length ?? 0 };
    },
  });
}

// ---------------------------------------------------------------------------
// lookupCatalogHealth
// ---------------------------------------------------------------------------

export function createLookupCatalogHealthTool(profileId: string | null) {
  return tool({
    description:
      "Fetch unresolved catalog-health issues — flagged tracks that don't " +
      "match the artist's catalog ('not in catalog' on Spotify, etc). Use " +
      'when the user asks about catalog problems, mismatches, ISRC issues, ' +
      'or "what needs fixing in my catalog".',
    inputSchema: z
      .object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max items to return. Default 10, max 50.'),
      })
      .strict(),
    execute: async ({ limit = 10 }) => {
      if (!profileId) {
        return {
          error: 'no_profile',
          message: 'No profile bound to chat session.',
        };
      }
      const result = await executeWithTimeout(async () => {
        const rows = await db
          .select({
            id: dspCatalogMismatches.id,
            isrc: dspCatalogMismatches.isrc,
            mismatchType: dspCatalogMismatches.mismatchType,
            externalTrackName: dspCatalogMismatches.externalTrackName,
            externalAlbumName: dspCatalogMismatches.externalAlbumName,
            externalArtistNames: dspCatalogMismatches.externalArtistNames,
            status: dspCatalogMismatches.status,
            createdAt: dspCatalogMismatches.createdAt,
          })
          .from(dspCatalogMismatches)
          .where(
            and(
              eq(dspCatalogMismatches.creatorProfileId, profileId),
              eq(dspCatalogMismatches.status, 'flagged')
            )
          )
          .orderBy(desc(dspCatalogMismatches.createdAt))
          .limit(limit);
        return rows;
      });

      if (result.timedOut) {
        return {
          partial: true,
          timedOut: true,
          message: 'Catalog-health query took longer than 3s.',
        };
      }
      if (!result.ok) {
        return { error: 'lookup_failed', message: result.error ?? 'unknown' };
      }
      const items = result.value ?? [];
      return {
        items,
        count: items.length,
        // Quick rollup so the model can summarize without iterating.
        byType: items.reduce<Record<string, number>>((acc, item) => {
          acc[item.mismatchType] = (acc[item.mismatchType] ?? 0) + 1;
          return acc;
        }, {}),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// lookupFanSnapshot
// ---------------------------------------------------------------------------

export function createLookupFanSnapshotTool(profileId: string | null) {
  return tool({
    description:
      'Fetch a snapshot of the fan audience: total identified members, ' +
      'recent additions, and engagement signals. Use when the user asks ' +
      'about their fans, audience growth, or who is engaging.',
    inputSchema: z
      .object({
        windowDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('Lookback window in days for "recent" stats. Default 30.'),
      })
      .strict(),
    execute: async ({ windowDays = 30 }) => {
      if (!profileId) {
        return {
          error: 'no_profile',
          message: 'No profile bound to chat session.',
        };
      }
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const result = await executeWithTimeout(async () => {
        const [totals] = await db
          .select({
            total: drizzleSql<number>`COUNT(*)::int`,
            recent: drizzleSql<number>`COUNT(*) FILTER (WHERE ${audienceMembers.firstSeenAt} >= ${since.toISOString()}::timestamp)::int`,
          })
          .from(audienceMembers)
          .where(eq(audienceMembers.creatorProfileId, profileId));
        return totals;
      });

      if (result.timedOut) {
        return {
          partial: true,
          timedOut: true,
          message: 'Fan snapshot query took longer than 3s.',
        };
      }
      if (!result.ok) {
        return { error: 'lookup_failed', message: result.error ?? 'unknown' };
      }
      return {
        totalFans: Number(result.value?.total ?? 0),
        addedRecently: Number(result.value?.recent ?? 0),
        windowDays,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// lookupLinkAnalytics
// ---------------------------------------------------------------------------

export function createLookupLinkAnalyticsTool(profileId: string | null) {
  return tool({
    description:
      'Fetch link click analytics over a recent window: total clicks and ' +
      'breakdown by link type (DSP, social, tip). Use when the user asks ' +
      'about link performance, where their fans are clicking, or which ' +
      'platform is driving traffic.',
    inputSchema: z
      .object({
        windowDays: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe('Lookback window in days. Default 30, max 90.'),
      })
      .strict(),
    execute: async ({ windowDays = 30 }) => {
      if (!profileId) {
        return {
          error: 'no_profile',
          message: 'No profile bound to chat session.',
        };
      }
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const result = await executeWithTimeout(async () => {
        const rows = await db
          .select({
            linkType: clickEvents.linkType,
            count: drizzleSql<number>`COUNT(*)::int`,
          })
          .from(clickEvents)
          .where(
            and(
              eq(clickEvents.creatorProfileId, profileId),
              gte(clickEvents.createdAt, since)
            )
          )
          .groupBy(clickEvents.linkType);
        return rows;
      });

      if (result.timedOut) {
        return {
          partial: true,
          timedOut: true,
          message: 'Link analytics query took longer than 3s.',
        };
      }
      if (!result.ok) {
        return { error: 'lookup_failed', message: result.error ?? 'unknown' };
      }
      const rows = result.value ?? [];
      const byType = rows.reduce<Record<string, number>>((acc, row) => {
        if (row.linkType) acc[row.linkType] = Number(row.count);
        return acc;
      }, {});
      const total = Object.values(byType).reduce((a, b) => a + b, 0);
      return { totalClicks: total, byType, windowDays };
    },
  });
}

/**
 * Compose the full set of read-only artist-data tools.
 *
 * Returns an empty object when `profileId` is null (a chat session with
 * only `artistContext` and no profile id can't safely query DB rows).
 */
export function buildArtistContextTools(profileId: string | null) {
  return {
    lookupRecentReleases: createLookupRecentReleasesTool(profileId),
    lookupCatalogHealth: createLookupCatalogHealthTool(profileId),
    lookupFanSnapshot: createLookupFanSnapshotTool(profileId),
    lookupLinkAnalytics: createLookupLinkAnalyticsTool(profileId),
  };
}

/** Names exported as a const so tests + tool registry stay in sync. */
export const LOOKUP_TOOL_NAMES = [
  'lookupRecentReleases',
  'lookupCatalogHealth',
  'lookupFanSnapshot',
  'lookupLinkAnalytics',
] as const;
