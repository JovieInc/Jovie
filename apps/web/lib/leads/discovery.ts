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

export interface DiscoveryResult {
  queriesUsed: number;
  candidatesProcessed: number;
  newLeadsFound: number;
  duplicatesSkipped: number;
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
  const result: DiscoveryResult = {
    queriesUsed: 0,
    candidatesProcessed: 0,
    newLeadsFound: 0,
    duplicatesSkipped: 0,
  };

  if (keywords.length === 0) return result;

  const enabledKeywords = keywords.filter(k => k.enabled);
  if (enabledKeywords.length === 0) return result;

  const remainingBudget = settings.dailyQueryBudget - settings.queriesUsedToday;
  if (remainingBudget <= 0) return result;

  let queryIndex = settings.lastDiscoveryQueryIndex % enabledKeywords.length;

  // Use up to 10 queries per cron run (15-min interval × ~96 runs/day = ~960 queries max)
  const queriesThisRun = Math.min(remainingBudget, 10);

  for (let i = 0; i < queriesThisRun; i++) {
    const keyword = enabledKeywords[queryIndex];
    if (!keyword) break;

    try {
      const results = await searchGoogleCSE(keyword.query);
      const candidatesByHandle = buildCandidateMap(results, keyword.query);
      const candidates = Array.from(candidatesByHandle.values());
      result.candidatesProcessed += candidates.length;
      await insertCandidates(candidates, result);

      // Update keyword stats
      await db
        .update(discoveryKeywords)
        .set({
          lastUsedAt: new Date(),
          resultsFoundTotal: keyword.resultsFoundTotal + results.length,
        })
        .where(eq(discoveryKeywords.id, keyword.id));
    } catch (error) {
      await captureError('Discovery query failed', error, {
        route: 'leads/discovery',
        contextData: { query: keyword.query },
      });
    }

    result.queriesUsed++;
    queryIndex = (queryIndex + 1) % enabledKeywords.length;
  }

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
