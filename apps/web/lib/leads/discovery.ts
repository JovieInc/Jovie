import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type DiscoveryKeyword,
  discoveryKeywords,
  type LeadPipelineSettings,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { sqlArray } from '@/lib/db/sql-helpers';
import { captureError } from '@/lib/error-tracking';
import {
  extractLinktreeHandle,
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { searchGoogleCSE } from './google-cse';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

interface DiscoveryCandidate {
  linktreeHandle: string;
  linktreeUrl: string;
  discoverySource: 'google_cse';
  discoveryQuery: string;
}

function isMissingLeadInsertColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return /^column "[a-z_]+" of relation "leads" does not exist$/m.test(
    normalized
  );
}

async function insertCandidatesWithLegacyFallback(
  candidates: DiscoveryCandidate[],
  result: DiscoveryResult
): Promise<void> {
  let insertedCount = 0;

  for (const candidate of candidates) {
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

    if (insertResult.rows[0]?.id) {
      insertedCount++;
    }
  }

  result.newLeadsFound += insertedCount;
  result.duplicatesSkipped += candidates.length - insertedCount;
}

async function insertCandidates(
  candidates: DiscoveryCandidate[],
  result: DiscoveryResult
): Promise<void> {
  if (candidates.length === 0) return;
  try {
    const insertedRows = await db
      .insert(leads)
      .values(candidates)
      .onConflictDoNothing({ target: leads.linktreeHandle })
      .returning({ id: leads.id });
    result.newLeadsFound += insertedRows.length;
    result.duplicatesSkipped += candidates.length - insertedRows.length;
  } catch (error) {
    if (!isMissingLeadInsertColumnError(error)) {
      throw error;
    }

    await insertCandidatesWithLegacyFallback(candidates, result);
  }
}

/**
 * Google CSE free tier supports startIndex 1..91 (pages 1-10, 10 results each).
 * After 91 we reset to 1 to start the cycle over.
 */
const GOOGLE_CSE_MAX_START_INDEX = 91;

/**
 * Resets the daily query budget if the reset time has passed (or was never set).
 * Returns a fresh copy of settings with zeroed counters if a reset occurred.
 *
 * Uses UTC midnight so the reset time is deterministic regardless of server timezone.
 */
export async function resetBudgetIfNeeded(
  settings: LeadPipelineSettings
): Promise<LeadPipelineSettings> {
  const now = new Date();

  // Compute next UTC midnight
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );

  const needsReset =
    !settings.queryBudgetResetsAt || now > settings.queryBudgetResetsAt;

  if (!needsReset) return settings;

  pipelineLog('discovery', 'Resetting daily query budget', {
    previousUsed: settings.queriesUsedToday,
    previousResetAt: settings.queryBudgetResetsAt?.toISOString() ?? null,
    newResetAt: nextMidnightUtc.toISOString(),
  });

  await db
    .update(leadPipelineSettings)
    .set({
      queriesUsedToday: 0,
      queryBudgetResetsAt: nextMidnightUtc,
      updatedAt: now,
    })
    .where(eq(leadPipelineSettings.id, 1));

  return {
    ...settings,
    queriesUsedToday: 0,
    queryBudgetResetsAt: nextMidnightUtc,
  };
}

export interface KeywordDiagnostic {
  keywordId: string;
  query: string;
  rawResultCount: number;
  linktreeUrlsFound: number;
  newLeadsInserted: number;
  duplicatesSkipped: number;
  error: string | null;
  durationMs: number;
  searchOffset: number;
}

export interface DiscoveryResult {
  queriesUsed: number;
  candidatesProcessed: number;
  newLeadsFound: number;
  duplicatesSkipped: number;
  diagnostics: KeywordDiagnostic[];
  budgetRemaining: number;
  keywordRotationIndex: number;
  totalEnabledKeywords: number;
}

function buildCandidateMap(
  results: { link: string }[],
  query: string
): Map<
  string,
  {
    linktreeHandle: string;
    linktreeUrl: string;
    discoverySource: 'google_cse';
    discoveryQuery: string;
  }
> {
  const map = new Map<
    string,
    {
      linktreeHandle: string;
      linktreeUrl: string;
      discoverySource: 'google_cse';
      discoveryQuery: string;
    }
  >();
  for (const item of results) {
    if (!isLinktreeUrl(item.link)) continue;
    const handle = extractLinktreeHandle(item.link);
    if (!handle) continue;
    map.set(handle, {
      linktreeHandle: handle,
      linktreeUrl: `https://linktr.ee/${handle}`,
      discoverySource: 'google_cse',
      discoveryQuery: query,
    });
  }
  return map;
}

/**
 * Runs one discovery cycle: picks keywords, searches Google CSE, inserts new leads.
 * Respects daily query budget and rotates through keywords via lastDiscoveryQueryIndex.
 */
export async function runDiscovery(
  settings: LeadPipelineSettings,
  keywords: DiscoveryKeyword[]
): Promise<DiscoveryResult> {
  const enabledKeywords = keywords.filter(k => k.enabled);
  const remainingBudget = settings.dailyQueryBudget - settings.queriesUsedToday;

  const result: DiscoveryResult = {
    queriesUsed: 0,
    candidatesProcessed: 0,
    newLeadsFound: 0,
    duplicatesSkipped: 0,
    diagnostics: [],
    budgetRemaining: remainingBudget,
    keywordRotationIndex: settings.lastDiscoveryQueryIndex,
    totalEnabledKeywords: enabledKeywords.length,
  };

  if (keywords.length === 0) {
    pipelineWarn('discovery', 'No keywords configured — skipping discovery');
    return result;
  }

  if (enabledKeywords.length === 0) {
    pipelineWarn('discovery', 'All keywords disabled — skipping discovery', {
      totalKeywords: keywords.length,
    });
    return result;
  }

  if (remainingBudget <= 0) {
    pipelineWarn('discovery', 'Daily query budget exhausted', {
      budget: settings.dailyQueryBudget,
      used: settings.queriesUsedToday,
    });
    return result;
  }

  let queryIndex = settings.lastDiscoveryQueryIndex % enabledKeywords.length;

  pipelineLog('discovery', 'Discovery cycle starting', {
    enabledKeywords: enabledKeywords.length,
    remainingBudget,
    startIndex: queryIndex,
  });

  // Use up to 10 queries per cron run (15-min interval × ~96 runs/day = ~960 queries max)
  const queriesThisRun = Math.min(remainingBudget, 10);

  for (let i = 0; i < queriesThisRun; i++) {
    const keyword = enabledKeywords[queryIndex];
    if (!keyword) break;

    // Use stored search offset for pagination — avoids re-fetching page 1 every run.
    // The searchOffset column may not exist yet (pre-migration), so default to 1.
    const currentOffset = keyword.searchOffset ?? 1;

    const diagnostic: KeywordDiagnostic = {
      keywordId: keyword.id,
      query: keyword.query,
      rawResultCount: 0,
      linktreeUrlsFound: 0,
      newLeadsInserted: 0,
      duplicatesSkipped: 0,
      error: null,
      durationMs: 0,
      searchOffset: currentOffset,
    };
    const queryStart = Date.now();

    try {
      const results = await searchGoogleCSE(keyword.query, currentOffset);
      diagnostic.rawResultCount = results.length;

      const candidatesByHandle = buildCandidateMap(results, keyword.query);
      const candidates = Array.from(candidatesByHandle.values());
      diagnostic.linktreeUrlsFound = candidates.length;
      result.candidatesProcessed += candidates.length;

      // Track per-keyword insert stats separately
      const beforeNew = result.newLeadsFound;
      const beforeDups = result.duplicatesSkipped;
      await insertCandidates(candidates, result);
      diagnostic.newLeadsInserted = result.newLeadsFound - beforeNew;
      diagnostic.duplicatesSkipped = result.duplicatesSkipped - beforeDups;

      // Advance search offset for next run. If we got fewer than 10 results
      // or exceeded max, reset to page 1.
      const nextOffset = currentOffset + 10;
      const newSearchOffset =
        results.length < 10 || nextOffset > GOOGLE_CSE_MAX_START_INDEX
          ? 1
          : nextOffset;

      // Update keyword stats + pagination offset
      await db
        .update(discoveryKeywords)
        .set({
          lastUsedAt: new Date(),
          resultsFoundTotal: keyword.resultsFoundTotal + results.length,
          searchOffset: newSearchOffset,
        })
        .where(eq(discoveryKeywords.id, keyword.id));

      pipelineLog('discovery', 'Keyword query complete', {
        query: keyword.query,
        searchOffset: currentOffset,
        nextOffset: newSearchOffset,
        rawResults: diagnostic.rawResultCount,
        linktreeUrls: diagnostic.linktreeUrlsFound,
        newLeads: diagnostic.newLeadsInserted,
        duplicates: diagnostic.duplicatesSkipped,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      diagnostic.error = errorMessage;

      pipelineWarn('discovery', 'Keyword query failed', {
        query: keyword.query,
        searchOffset: currentOffset,
        error: errorMessage,
      });

      await captureError('Discovery query failed', error, {
        route: 'leads/discovery',
        contextData: {
          query: keyword.query,
          keywordId: keyword.id,
          queryIndex,
          searchOffset: currentOffset,
        },
      });
    }

    diagnostic.durationMs = Date.now() - queryStart;
    result.diagnostics.push(diagnostic);
    result.queriesUsed++;
    queryIndex = (queryIndex + 1) % enabledKeywords.length;
  }

  result.budgetRemaining = remainingBudget - result.queriesUsed;
  result.keywordRotationIndex = queryIndex;

  pipelineLog('discovery', 'Discovery cycle complete', {
    queriesUsed: result.queriesUsed,
    candidatesProcessed: result.candidatesProcessed,
    newLeadsFound: result.newLeadsFound,
    duplicatesSkipped: result.duplicatesSkipped,
    budgetRemaining: result.budgetRemaining,
    nextKeywordIndex: queryIndex,
  });

  // Update settings counters
  await db
    .update(leadPipelineSettings)
    .set({
      queriesUsedToday: settings.queriesUsedToday + result.queriesUsed,
      lastDiscoveryQueryIndex: queryIndex,
      updatedAt: new Date(),
    })
    .where(eq(leadPipelineSettings.id, 1));

  return result;
}
