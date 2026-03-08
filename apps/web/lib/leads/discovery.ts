import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type DiscoveryKeyword,
  discoveryKeywords,
  type LeadPipelineSettings,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import {
  extractLinktreeHandle,
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { searchGoogleCSE } from './google-cse';

export interface DiscoveryResult {
  queriesUsed: number;
  candidatesProcessed: number;
  newLeadsFound: number;
  duplicatesSkipped: number;
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
      const candidatesByHandle = new Map<
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

        candidatesByHandle.set(handle, {
          linktreeHandle: handle,
          linktreeUrl: `https://linktr.ee/${handle}`,
          discoverySource: 'google_cse',
          discoveryQuery: keyword.query,
        });
      }

      const candidates = Array.from(candidatesByHandle.values());
      result.candidatesProcessed += candidates.length;

      if (candidates.length > 0) {
        const insertedRows = await db
          .insert(leads)
          .values(candidates)
          .onConflictDoNothing({ target: leads.linktreeHandle })
          .returning({ id: leads.id });

        result.newLeadsFound += insertedRows.length;
        result.duplicatesSkipped += candidates.length - insertedRows.length;
      }

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
