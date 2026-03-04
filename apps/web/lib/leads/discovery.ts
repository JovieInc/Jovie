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

      for (const item of results) {
        if (!isLinktreeUrl(item.link)) continue;

        const handle = extractLinktreeHandle(item.link);
        if (!handle) continue;

        // Attempt insert, skip if duplicate (unique constraint on linktree_handle)
        try {
          await db.insert(leads).values({
            linktreeHandle: handle,
            linktreeUrl: `https://linktr.ee/${handle}`,
            discoverySource: 'google_cse',
            discoveryQuery: keyword.query,
          });
          result.newLeadsFound++;
        } catch (error) {
          // Unique constraint violation = duplicate
          if (error instanceof Error && error.message.includes('unique')) {
            result.duplicatesSkipped++;
          } else {
            throw error;
          }
        }
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
