import {
  and,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
  lte,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiInsights, insightGenerationRuns } from '@/lib/db/schema/insights';
import { sortInsightsForChat } from '@/lib/insights/chat-presentation';
import { toISOStringSafe } from '@/lib/utils/date';
import type {
  GeneratedInsight,
  InsightCategory,
  InsightPriority,
  InsightResponse,
  InsightsSummaryResponse,
} from '@/types/insights';
import { GENERATION_COOLDOWN_HOURS } from './thresholds';

const INSIGHT_PRIORITY_ORDER = drizzleSql`case ${aiInsights.priority} when 'high' then 0 when 'medium' then 1 when 'low' then 2 end`;

const INSIGHT_PRIORITY_RANK: Record<InsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type InsightDedupCandidate = {
  category: InsightCategory;
  title: string;
  description: string;
  dataSnapshot: unknown;
};

// ---------------------------------------------------------------------------
// Insight Generation Runs
// ---------------------------------------------------------------------------

/**
 * Creates a new insight generation run record.
 */
export async function createGenerationRun(creatorProfileId: string) {
  const [run] = await db
    .insert(insightGenerationRuns)
    .values({ creatorProfileId })
    .returning();
  return run;
}

/**
 * Updates a generation run with results.
 */
export async function completeGenerationRun(
  runId: string,
  data: {
    status: 'completed' | 'failed';
    insightsGenerated: number;
    dataPointsAnalyzed: number;
    modelUsed?: string;
    promptTokens?: number;
    completionTokens?: number;
    durationMs?: number;
    error?: string;
  }
) {
  await db
    .update(insightGenerationRuns)
    .set(data)
    .where(eq(insightGenerationRuns.id, runId));
}

/**
 * Checks if a user can generate insights (respects cooldown period).
 */
export async function canGenerateInsights(
  creatorProfileId: string
): Promise<{ allowed: boolean; nextAllowedAt?: Date }> {
  const cooldownStart = new Date();
  cooldownStart.setHours(cooldownStart.getHours() - GENERATION_COOLDOWN_HOURS);

  const recentRuns = await db
    .select({ createdAt: insightGenerationRuns.createdAt })
    .from(insightGenerationRuns)
    .where(
      and(
        eq(insightGenerationRuns.creatorProfileId, creatorProfileId),
        gte(insightGenerationRuns.createdAt, cooldownStart),
        inArray(insightGenerationRuns.status, [
          'completed',
          'processing',
          'pending',
        ])
      )
    )
    .orderBy(desc(insightGenerationRuns.createdAt))
    .limit(1);

  if (recentRuns.length === 0) {
    return { allowed: true };
  }

  const nextAllowedAt = new Date(recentRuns[0].createdAt);
  nextAllowedAt.setHours(nextAllowedAt.getHours() + GENERATION_COOLDOWN_HOURS);

  return { allowed: false, nextAllowedAt };
}

// ---------------------------------------------------------------------------
// Insight Persistence
// ---------------------------------------------------------------------------

/**
 * Persists generated insights to the database.
 *
 * Uses ON CONFLICT to handle dedup (same type + period), replacing
 * existing insights with the latest generated data.
 */
export async function persistInsights(
  creatorProfileId: string,
  runId: string,
  insights: GeneratedInsight[],
  period: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
): Promise<number> {
  const dedupedInsights = prepareInsightsForPersistence(insights);
  if (dedupedInsights.length === 0) return 0;

  const now = new Date();
  let persisted = 0;

  // Insert each insight individually to handle dedup gracefully
  for (const insight of dedupedInsights) {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + insight.expiresInDays);

    try {
      await db
        .insert(aiInsights)
        .values({
          creatorProfileId,
          insightType: insight.insightType,
          category: insight.category,
          priority: insight.priority,
          title: insight.title,
          description: insight.description,
          actionSuggestion: insight.actionSuggestion,
          confidence: String(insight.confidence),
          dataSnapshot: insight.dataSnapshot,
          periodStart: period.start,
          periodEnd: period.end,
          comparisonPeriodStart: comparisonPeriod.start,
          comparisonPeriodEnd: comparisonPeriod.end,
          expiresAt,
          generationRunId: runId,
        })
        .onConflictDoUpdate({
          target: [
            aiInsights.creatorProfileId,
            aiInsights.insightType,
            aiInsights.periodStart,
            aiInsights.periodEnd,
          ],
          set: {
            title: insight.title,
            description: insight.description,
            actionSuggestion: insight.actionSuggestion,
            confidence: String(insight.confidence),
            priority: insight.priority,
            dataSnapshot: insight.dataSnapshot,
            expiresAt,
            generationRunId: runId,
            status: 'active',
            dismissedAt: null,
            updatedAt: now,
          },
        });
      persisted++;
    } catch (error) {
      // Log but don't fail the entire batch for one insert failure
      console.error(
        `[insights] Failed to persist insight ${insight.insightType}:`,
        error
      );
    }
  }

  return persisted;
}

// ---------------------------------------------------------------------------
// Insight Queries
// ---------------------------------------------------------------------------

/**
 * Fetches active insights for a creator with optional filtering.
 */
export async function getActiveInsights(
  creatorProfileId: string,
  options: {
    category?: InsightCategory[];
    priority?: InsightPriority[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ insights: InsightResponse[]; total: number }> {
  const { limit = 20, offset = 0, category, priority } = options;
  const now = new Date();

  const conditions = [
    eq(aiInsights.creatorProfileId, creatorProfileId),
    eq(aiInsights.status, 'active'),
    gte(aiInsights.expiresAt, now),
  ];

  if (category && category.length > 0) {
    conditions.push(inArray(aiInsights.category, category));
  }
  if (priority && priority.length > 0) {
    conditions.push(inArray(aiInsights.priority, priority));
  }

  const whereClause = and(...conditions);

  const rows = await db
    .select()
    .from(aiInsights)
    .where(whereClause)
    .orderBy(INSIGHT_PRIORITY_ORDER, desc(aiInsights.createdAt));
  const dedupedRows = dedupeVisibleInsights(rows);
  const pagedRows = dedupedRows.slice(offset, offset + limit);

  return {
    insights: pagedRows.map(formatInsightResponse),
    total: dedupedRows.length,
  };
}

/**
 * Fetches a summary for the dashboard widget (top 3 insights).
 */
export async function getInsightsSummary(
  creatorProfileId: string
): Promise<InsightsSummaryResponse> {
  const now = new Date();

  const [insights, lastRun] = await Promise.all([
    db
      .select()
      .from(aiInsights)
      .orderBy(INSIGHT_PRIORITY_ORDER, desc(aiInsights.createdAt))
      .where(
        and(
          eq(aiInsights.creatorProfileId, creatorProfileId),
          eq(aiInsights.status, 'active'),
          gte(aiInsights.expiresAt, now)
        )
      ),
    db
      .select({ createdAt: insightGenerationRuns.createdAt })
      .from(insightGenerationRuns)
      .where(
        and(
          eq(insightGenerationRuns.creatorProfileId, creatorProfileId),
          eq(insightGenerationRuns.status, 'completed')
        )
      )
      .orderBy(desc(insightGenerationRuns.createdAt))
      .limit(1),
  ]);

  const dedupedInsights = dedupeVisibleInsights(insights);
  const sortedInsights = sortInsightsForChat(
    dedupedInsights.map(formatInsightResponse)
  );

  return {
    insights: sortedInsights.slice(0, 3),
    totalActive: dedupedInsights.length,
    lastGeneratedAt: lastRun[0]?.createdAt
      ? toISOStringSafe(lastRun[0].createdAt)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Insight Status Updates
// ---------------------------------------------------------------------------

/**
 * Updates the status of an insight (dismiss or mark as acted on).
 */
export async function updateInsightStatus(
  insightId: string,
  creatorProfileId: string,
  status: 'dismissed' | 'acted_on'
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(aiInsights)
    .set({
      status,
      dismissedAt: status === 'dismissed' ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInsights.id, insightId),
        eq(aiInsights.creatorProfileId, creatorProfileId)
      )
    )
    .returning({ id: aiInsights.id });

  return result.length > 0;
}

/**
 * Expires all insights past their expiration date.
 * Called by the cron job.
 */
export async function expireStaleInsights(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(aiInsights)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(aiInsights.status, 'active'), lte(aiInsights.expiresAt, now)))
    .returning({ id: aiInsights.id });

  return result.length;
}

/**
 * Gets existing active insight types for a creator (for dedup in generation).
 */
export async function getExistingInsightTypes(
  creatorProfileId: string
): Promise<string[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await db
    .select({ insightType: aiInsights.insightType })
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.creatorProfileId, creatorProfileId),
        eq(aiInsights.status, 'active'),
        gte(aiInsights.createdAt, sevenDaysAgo)
      )
    );

  return rows.map(r => r.insightType);
}

export function prepareInsightsForPersistence(
  insights: readonly GeneratedInsight[]
): GeneratedInsight[] {
  return dedupeVisibleInsights(
    [...insights].sort(
      (left, right) =>
        INSIGHT_PRIORITY_RANK[left.priority] -
          INSIGHT_PRIORITY_RANK[right.priority] ||
        right.confidence - left.confidence
    )
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function dedupeVisibleInsights<T extends InsightDedupCandidate>(
  insights: readonly T[]
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const insight of insights) {
    const key = buildInsightDedupKey(insight);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(insight);
  }

  return deduped;
}

function formatInsightResponse(
  row: typeof aiInsights.$inferSelect
): InsightResponse {
  return {
    id: row.id,
    insightType: row.insightType,
    category: row.category,
    priority: row.priority,
    title: row.title,
    description: row.description,
    actionSuggestion: row.actionSuggestion,
    confidence: row.confidence,
    status: row.status,
    periodStart: toISOStringSafe(row.periodStart),
    periodEnd: toISOStringSafe(row.periodEnd),
    createdAt: toISOStringSafe(row.createdAt),
    expiresAt: toISOStringSafe(row.expiresAt),
  };
}

function buildInsightDedupKey(insight: InsightDedupCandidate): string {
  const sourceKey = getInsightSourceKey(insight.dataSnapshot);
  if (sourceKey) {
    return `${insight.category}|${sourceKey}`;
  }

  return `${insight.category}|${normalizeInsightCopy(insight.title)}|${normalizeInsightCopy(insight.description)}`;
}

function getInsightSourceKey(dataSnapshot: unknown): string | null {
  if (!dataSnapshot || typeof dataSnapshot !== 'object') {
    return null;
  }

  const snapshot = dataSnapshot as Record<string, unknown>;
  const city = normalizeSnapshotToken(snapshot.city);
  const country = normalizeSnapshotToken(snapshot.country);
  if (city) {
    return country ? `city:${city}|${country}` : `city:${city}`;
  }

  const market = normalizeSnapshotToken(snapshot.market);
  if (market) {
    return `market:${market}`;
  }

  const release = normalizeSnapshotToken(snapshot.release);
  if (release) {
    return `release:${release}`;
  }

  const referrer = normalizeSnapshotToken(snapshot.referrer);
  if (referrer) {
    return `referrer:${referrer}`;
  }

  const spikeDate = normalizeSnapshotToken(snapshot.spikeDate);
  if (spikeDate) {
    return `spikeDate:${spikeDate}`;
  }

  const deviceType = normalizeSnapshotToken(snapshot.deviceType);
  if (deviceType) {
    return `deviceType:${deviceType}`;
  }

  const linkType = normalizeSnapshotToken(snapshot.linkType);
  if (linkType) {
    return `linkType:${linkType}`;
  }

  return null;
}

function normalizeSnapshotToken(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeInsightCopy(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
