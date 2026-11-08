import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leadSearchResults, leads } from '@/lib/db/schema/leads';
import { sqlArray } from '@/lib/db/sql-helpers';
import {
  extractLinktreeHandle,
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { type BuyerPrescreenResult, prescreenBuyer } from './buyer-signals';
import { recordLeadFunnelEvent } from './funnel-events';
import type { SearchOutcome } from './google-cse';

export interface DiscoveryCandidate {
  linktreeHandle: string;
  linktreeUrl: string;
  discoverySource: 'google_cse';
  discoveryQuery: string;
  sourcePlatform: 'linktree';
  sourceHandle: string;
  sourceUrl: string;
}

export interface ScreenedCandidate {
  readonly candidate: DiscoveryCandidate;
  readonly prescreen: BuyerPrescreenResult;
}

export interface InsertCounts {
  inserted: number;
  duplicates: number;
}

const SEARCH_RESULT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function isMissingLeadInsertColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^column "[a-z_]+" of relation "leads" does not exist$/m.test(
    message.toLowerCase()
  );
}

function discoveredEventMetadata(
  screened: ScreenedCandidate,
  queryCostShareUsd: number
) {
  return {
    discoverySource: 'google_cse',
    prescreenScore: screened.prescreen.score,
    prescreenReasons: screened.prescreen.reasons,
    replacedTools: screened.prescreen.replacedTools,
    queryCostShareUsd,
  };
}

async function recordDiscovered(
  insertedHandles: ReadonlyArray<{ id: string; handle: string }>,
  screened: readonly ScreenedCandidate[],
  queryCostShareUsd: number
): Promise<void> {
  const byHandle = new Map(screened.map(s => [s.candidate.linktreeHandle, s]));
  await Promise.all(
    insertedHandles.map(({ id, handle }) => {
      const match = byHandle.get(handle);
      return recordLeadFunnelEvent(
        {
          leadId: id,
          eventType: 'discovered',
          metadata: match
            ? discoveredEventMetadata(match, queryCostShareUsd)
            : { discoverySource: 'google_cse' },
        },
        { idempotent: false }
      );
    })
  );
}

async function insertWithLegacyFallback(
  screened: readonly ScreenedCandidate[],
  queryCostShareUsd: number
): Promise<InsertCounts> {
  const inserted: { id: string; handle: string }[] = [];
  for (const { candidate } of screened) {
    const insertResult = await db.execute<{ id: string }>(drizzleSql`
      insert into "leads" (
        "linktree_handle",
        "linktree_url",
        "discovery_source",
        "discovery_query",
        "music_tools_detected"
      ) values (
        ${candidate.linktreeHandle},
        ${candidate.linktreeUrl},
        ${candidate.discoverySource},
        ${candidate.discoveryQuery},
        ${sqlArray([])}
      )
      on conflict ("linktree_handle") do nothing
      returning "id"
    `);
    const id = insertResult.rows[0]?.id;
    if (id) inserted.push({ id, handle: candidate.linktreeHandle });
  }
  await recordDiscovered(inserted, screened, queryCostShareUsd);
  return {
    inserted: inserted.length,
    duplicates: screened.length - inserted.length,
  };
}

/**
 * Inserts pre-screen passes only; the discovered event records the pre-screen
 * score, reasons and this lead's share of the paid query that found it.
 */
export async function insertScreenedCandidates(
  screened: readonly ScreenedCandidate[],
  queryCostShareUsd: number
): Promise<InsertCounts> {
  if (screened.length === 0) return { inserted: 0, duplicates: 0 };
  try {
    const insertedRows = await db
      .insert(leads)
      .values(screened.map(s => s.candidate))
      .onConflictDoNothing({ target: leads.linktreeHandle })
      .returning({ id: leads.id, handle: leads.linktreeHandle });
    await recordDiscovered(insertedRows, screened, queryCostShareUsd);
    return {
      inserted: insertedRows.length,
      duplicates: screened.length - insertedRows.length,
    };
  } catch (error) {
    if (!isMissingLeadInsertColumnError(error)) throw error;
    return insertWithLegacyFallback(screened, queryCostShareUsd);
  }
}

function normalizeSearchResultUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    parsed.search = '';
    let normalizedPath = parsed.pathname;
    while (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    parsed.pathname = normalizedPath || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function shouldSkipSeenSearchResult(
  query: string,
  rawUrl: string,
  rank: number
): Promise<boolean> {
  if (typeof db.select !== 'function') {
    return false;
  }

  const normalizedResultUrl = normalizeSearchResultUrl(rawUrl);
  if (!normalizedResultUrl) {
    return true;
  }

  try {
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - SEARCH_RESULT_COOLDOWN_MS);
    const [existing] = await db
      .select({
        id: leadSearchResults.id,
        lastSeenAt: leadSearchResults.lastSeenAt,
        timesSeen: leadSearchResults.timesSeen,
      })
      .from(leadSearchResults)
      .where(
        drizzleSql`${leadSearchResults.query} = ${query} and ${leadSearchResults.normalizedResultUrl} = ${normalizedResultUrl}`
      )
      .limit(1);

    if (existing) {
      await db
        .update(leadSearchResults)
        .set({
          lastSeenAt: now,
          timesSeen: existing.timesSeen + 1,
          lastRank: rank,
          updatedAt: now,
        })
        .where(eq(leadSearchResults.id, existing.id));

      return existing.lastSeenAt >= recentCutoff;
    }

    await db.insert(leadSearchResults).values({
      query,
      normalizedResultUrl,
      sourcePlatform: 'linktree',
      firstSeenAt: now,
      lastSeenAt: now,
      timesSeen: 1,
      lastRank: rank,
      updatedAt: now,
    });
  } catch {
    return false;
  }

  return false;
}

/**
 * Turns one page of search results into pre-screened, unseen Linktree
 * candidates. The pre-screen reads the title and snippet the paid query
 * already returned, so it costs nothing extra. Seen-checks run in parallel.
 */
export async function screenSearchResults(
  results: SearchOutcome['results'],
  query: string,
  currentOffset: number
): Promise<{ screened: ScreenedCandidate[]; duplicatesSkipped: number }> {
  const firstByHandle = new Map<
    string,
    { item: SearchOutcome['results'][number]; rank: number }
  >();
  let duplicatesSkipped = 0;
  for (const [index, item] of results.entries()) {
    if (!isLinktreeUrl(item.link)) continue;
    const handle = extractLinktreeHandle(item.link);
    if (!handle) continue;
    // A repeat inside one page is one candidate (the insert counts it once).
    if (firstByHandle.has(handle)) continue;
    firstByHandle.set(handle, { item, rank: currentOffset + index });
  }

  const entries = [...firstByHandle.entries()];
  const seen = await Promise.all(
    entries.map(([, { item, rank }]) =>
      shouldSkipSeenSearchResult(query, item.link, rank)
    )
  );

  const screened: ScreenedCandidate[] = [];
  entries.forEach(([handle, { item }], index) => {
    if (seen[index]) {
      duplicatesSkipped++;
      return;
    }
    const url = `https://linktr.ee/${handle}`;
    screened.push({
      candidate: {
        linktreeHandle: handle,
        linktreeUrl: url,
        discoverySource: 'google_cse',
        discoveryQuery: query,
        sourcePlatform: 'linktree',
        sourceHandle: handle,
        sourceUrl: url,
      },
      prescreen: prescreenBuyer({
        handle,
        displayName: null,
        bio: null,
        text: [item.title, item.snippet].filter(Boolean).join('\n'),
        links: [],
      }),
    });
  });

  return { screened, duplicatesSkipped };
}
