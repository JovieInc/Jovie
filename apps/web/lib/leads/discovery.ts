import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type DiscoveryKeyword,
  discoveryKeywords,
  type LeadPipelineSettings,
  leadPipelineSettings,
} from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { prescreenFailReason } from './buyer-signals';
import { SEARCH_QUERY_COST_USD } from './constants';
import {
  insertScreenedCandidates,
  mergeEvidenceIntoExistingLeads,
  screenSearchResults,
} from './discovery-candidates';
import { type SearchStatus, searchWebWithStatus } from './google-cse';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

/**
 * Search providers support startIndex 1..91 (pages 1-10, 10 results each).
 * After 91, reset to 1 to start the cycle over.
 */
const SEARCH_MAX_START_INDEX = 91;

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
  /** Candidates the free buyer pre-screen passed / failed for this query. */
  prescreenPassed: number;
  prescreenFailed: number;
  newLeadsInserted: number;
  duplicatesSkipped: number;
  error: string | null;
  providerStatus: SearchStatus | null;
  durationMs: number;
  searchOffset: number;
}

export interface DiscoveryResult {
  queriesUsed: number;
  candidatesProcessed: number;
  newLeadsFound: number;
  duplicatesSkipped: number;
  diagnostics: KeywordDiagnostic[];
  /** Fail reasons from the free pre-screen; failures never reach paid steps. */
  prescreenFailReasons: Record<string, number>;
  /** Spend counter for the run log: paid queries over pre-screen passes. */
  cost: {
    estimatedQueryUsd: number;
    passedLeads: number;
    usdPerPassedLead: number | null;
  };
  budgetRemaining: number;
  keywordRotationIndex: number;
  totalEnabledKeywords: number;
}

/**
 * Runs one discovery cycle: picks keywords, searches the web, inserts new leads.
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
    prescreenFailReasons: {},
    cost: { estimatedQueryUsd: 0, passedLeads: 0, usdPerPassedLead: null },
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
      prescreenPassed: 0,
      prescreenFailed: 0,
      newLeadsInserted: 0,
      duplicatesSkipped: 0,
      error: null,
      providerStatus: null,
      durationMs: 0,
      searchOffset: currentOffset,
    };
    const queryStart = Date.now();
    let stopRun = false;
    let lastQueryCostUsd = 0;

    try {
      const outcome = await searchWebWithStatus(keyword.query, currentOffset);
      lastQueryCostUsd = SEARCH_QUERY_COST_USD[outcome.provider] ?? 0;
      const results = outcome.results;
      diagnostic.providerStatus = outcome.status;
      diagnostic.rawResultCount = results.length;

      if (outcome.status !== 'ok' && outcome.status !== 'empty') {
        // Provider failure — this is not zero demand. Do not advance or reset
        // pagination, do not record keyword success stats, and do not let the
        // run look like a successful empty query.
        diagnostic.error =
          outcome.error ?? `provider status: ${outcome.status}`;
        pipelineWarn('discovery', 'Keyword query provider failure', {
          query: keyword.query,
          searchOffset: currentOffset,
          providerStatus: outcome.status,
          error: diagnostic.error,
        });
        await captureError(
          'Discovery query provider failure',
          new Error(diagnostic.error),
          {
            route: 'leads/discovery',
            contextData: {
              query: keyword.query,
              keywordId: keyword.id,
              queryIndex,
              searchOffset: currentOffset,
              providerStatus: outcome.status,
            },
          }
        );
        // Quota, auth and missing-config failures will affect every remaining
        // keyword — stop the run instead of burning attempts.
        stopRun =
          outcome.status === 'not_configured' ||
          outcome.status === 'quota_exceeded' ||
          outcome.status === 'unauthorized';
      } else {
        const { screened, duplicatesSkipped } = await screenSearchResults(
          results,
          keyword.query,
          currentOffset,
          outcome.provider
        );
        const passed = screened.filter(c => c.prescreen.decision === 'pass');
        for (const failed of screened) {
          if (failed.prescreen.decision === 'pass') continue;
          const reason = prescreenFailReason(failed.prescreen);
          result.prescreenFailReasons[reason] =
            (result.prescreenFailReasons[reason] ?? 0) + 1;
        }
        result.duplicatesSkipped += duplicatesSkipped;
        diagnostic.linktreeUrlsFound = screened.length;
        diagnostic.prescreenPassed = passed.length;
        diagnostic.prescreenFailed = screened.length - passed.length;
        result.candidatesProcessed += screened.length;
        result.cost.passedLeads += passed.length;

        // Only pre-screen passes become leads, so qualification, Spotify
        // enrichment and approval never run on a candidate the free check
        // already rejected.
        const counts = await insertScreenedCandidates(
          passed,
          passed.length > 0 ? lastQueryCostUsd / passed.length : 0
        );
        // A failed candidate may already be a lead (found by another tool
        // query); its evidence still counts toward that lead's score.
        await mergeEvidenceIntoExistingLeads(
          screened.filter(c => c.prescreen.decision !== 'pass')
        );
        result.newLeadsFound += counts.inserted;
        result.duplicatesSkipped += counts.duplicates;
        diagnostic.newLeadsInserted = counts.inserted;
        diagnostic.duplicatesSkipped = counts.duplicates;

        // Advance search offset for next run. If we got fewer than 10 results
        // or exceeded max, reset to page 1.
        const nextOffset = currentOffset + 10;
        const newSearchOffset =
          results.length < 10 || nextOffset > SEARCH_MAX_START_INDEX
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
      }
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
    // Only count a query against the budget when a provider request was
    // actually executed — 'not_configured' makes no billable call.
    if (diagnostic.providerStatus !== 'not_configured') {
      result.queriesUsed++;
      result.cost.estimatedQueryUsd += lastQueryCostUsd;
    }
    queryIndex = (queryIndex + 1) % enabledKeywords.length;
    if (stopRun) break;
  }

  result.budgetRemaining = remainingBudget - result.queriesUsed;
  result.cost.estimatedQueryUsd =
    Math.round(result.cost.estimatedQueryUsd * 10_000) / 10_000;
  result.cost.usdPerPassedLead =
    result.cost.passedLeads > 0
      ? Math.round(
          (result.cost.estimatedQueryUsd / result.cost.passedLeads) * 10_000
        ) / 10_000
      : null;
  result.keywordRotationIndex = queryIndex;

  pipelineLog('discovery', 'Discovery cycle complete', {
    queriesUsed: result.queriesUsed,
    candidatesProcessed: result.candidatesProcessed,
    newLeadsFound: result.newLeadsFound,
    duplicatesSkipped: result.duplicatesSkipped,
    prescreenFailReasons: result.prescreenFailReasons,
    cost: result.cost,
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
