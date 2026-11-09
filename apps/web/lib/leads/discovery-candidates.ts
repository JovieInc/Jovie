import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type LeadSignalSnapshot,
  leadSearchResults,
  leads,
} from '@/lib/db/schema/leads';
import { sqlArray } from '@/lib/db/sql-helpers';
import { captureError } from '@/lib/error-tracking';
import {
  extractBeaconsHandle,
  isBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import {
  extractLinktreeHandle,
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import type { BuyerPrescreenResult } from './buyer-signals';
import { recordLeadFunnelEvent } from './funnel-events';
import type { SearchOutcome, SearchProviderName } from './google-cse';
import {
  buildSearchEvidence,
  discoverySignalSnapshot,
  mergeSearchEvidence,
  prescreenFromSearchEvidence,
} from './search-evidence';

export { queryImpliedDomains } from './search-evidence';

export interface DiscoveryCandidate {
  /** Lead identity key; Beacons handles carry a `beacons:` prefix. */
  linktreeHandle: string;
  linktreeUrl: string;
  discoverySource: 'google_cse';
  discoveryQuery: string;
  sourcePlatform: 'linktree' | 'beacons';
  sourceHandle: string;
  sourceUrl: string;
  /** Carries the search evidence; nobody read the page. */
  signalSnapshot: LeadSignalSnapshot;
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
    searchTools:
      screened.candidate.signalSnapshot.searchEvidence?.[0]?.tools ?? [],
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
    const insertedHandles = new Set(insertedRows.map(row => row.handle));
    await mergeEvidenceIntoExistingLeads(
      screened.filter(s => !insertedHandles.has(s.candidate.linktreeHandle))
    );
    return {
      inserted: insertedRows.length,
      duplicates: screened.length - insertedRows.length,
    };
  } catch (error) {
    if (!isMissingLeadInsertColumnError(error)) throw error;
    return insertWithLegacyFallback(screened, queryCostShareUsd);
  }
}

/**
 * A lead already on file that a new query found again gains that query's
 * search evidence, so a page seen under several tool queries scores on all
 * of them, even when this one query alone would not pass the pre-screen.
 * Best-effort: a failed merge never fails the discovery run.
 */
export async function mergeEvidenceIntoExistingLeads(
  duplicates: readonly ScreenedCandidate[]
): Promise<void> {
  if (duplicates.length === 0 || typeof db.select !== 'function') return;
  const byHandle = new Map(
    duplicates.map(s => [s.candidate.linktreeHandle, s.candidate])
  );
  try {
    const existing = await db
      .select({
        id: leads.id,
        handle: leads.linktreeHandle,
        signalSnapshot: leads.signalSnapshot,
      })
      .from(leads)
      .where(inArray(leads.linktreeHandle, [...byHandle.keys()]));
    await Promise.all(
      existing.map(row => {
        const candidate = byHandle.get(row.handle);
        if (!candidate) return undefined;
        const base = row.signalSnapshot ?? candidate.signalSnapshot;
        return db
          .update(leads)
          .set({
            signalSnapshot: {
              ...base,
              searchEvidence: mergeSearchEvidence(
                row.signalSnapshot?.searchEvidence,
                candidate.signalSnapshot.searchEvidence ?? []
              ),
            },
          })
          .where(eq(leads.id, row.id));
      })
    );
  } catch (error) {
    await captureError('Lead search evidence merge failed', error, {
      route: 'leads/discovery',
      contextData: { duplicates: duplicates.length },
    });
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
  rank: number,
  sourcePlatform: LinkPage['platform']
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
      sourcePlatform,
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

interface LinkPage {
  readonly platform: 'linktree' | 'beacons';
  readonly handle: string;
  readonly url: string;
  /** Lead identity key; namespaced so a Beacons handle never hits Linktree's. */
  readonly key: string;
}

/** Identifies a Linktree or Beacons profile from a result URL alone. */
function linkPageOf(link: string): LinkPage | null {
  if (isLinktreeUrl(link)) {
    const handle = extractLinktreeHandle(link);
    if (!handle) return null;
    const url = `https://linktr.ee/${handle}`;
    return { platform: 'linktree', handle, url, key: handle };
  }
  if (isBeaconsUrl(link)) {
    const handle = extractBeaconsHandle(link);
    if (!handle) return null;
    const url = `https://beacons.ai/${handle}`;
    return { platform: 'beacons', handle, url, key: `beacons:${handle}` };
  }
  return null;
}

/**
 * Turns one page of search results into pre-screened, unseen Linktree and
 * Beacons candidates. The pre-screen reads the title and snippet the paid
 * query already returned, plus the tool domains the query quoted, so it costs
 * nothing extra and never requests the page. Seen-checks run in parallel.
 */
export async function screenSearchResults(
  results: SearchOutcome['results'],
  query: string,
  currentOffset: number,
  provider: SearchProviderName
): Promise<{ screened: ScreenedCandidate[]; duplicatesSkipped: number }> {
  const firstByKey = new Map<
    string,
    { item: SearchOutcome['results'][number]; rank: number; page: LinkPage }
  >();
  let duplicatesSkipped = 0;
  for (const [index, item] of results.entries()) {
    const page = linkPageOf(item.link);
    if (!page) continue;
    // A repeat inside one page is one candidate (the insert counts it once).
    if (firstByKey.has(page.key)) continue;
    firstByKey.set(page.key, { item, rank: currentOffset + index, page });
  }

  const entries = [...firstByKey.values()];
  const seen = await Promise.all(
    entries.map(({ item, rank, page }) =>
      shouldSkipSeenSearchResult(query, item.link, rank, page.platform)
    )
  );

  const screened: ScreenedCandidate[] = [];
  entries.forEach(({ item, page }, index) => {
    if (seen[index]) {
      duplicatesSkipped++;
      return;
    }
    const evidence = buildSearchEvidence({
      query,
      provider,
      title: item.title,
      snippet: item.snippet,
    });
    screened.push({
      candidate: {
        linktreeHandle: page.key,
        linktreeUrl: page.url,
        discoverySource: 'google_cse',
        discoveryQuery: query,
        sourcePlatform: page.platform,
        sourceHandle: page.handle,
        sourceUrl: page.url,
        signalSnapshot: discoverySignalSnapshot({
          query,
          sourcePlatform: page.platform,
          evidence,
        }),
      },
      // The same scorer qualification later runs on the stored evidence.
      prescreen: prescreenFromSearchEvidence({
        handle: page.handle,
        displayName: null,
        evidence: [evidence],
      }),
    });
  });

  return { screened, duplicatesSkipped };
}
