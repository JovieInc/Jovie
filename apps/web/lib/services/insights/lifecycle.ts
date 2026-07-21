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
import { normalizeInsightTitleForDedup } from '@/lib/insights/insight-dedup';
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

// Keep in sync with INSIGHT_PRIORITY_ORDER so DB and JS ordering match.
const INSIGHT_PRIORITY_RANK: Record<InsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const INSIGHT_DEDUP_READ_LIMIT = 150;
const INSIGHT_SUMMARY_CANDIDATE_LIMIT = 50;
const FALLBACK_PRIORITY_RANK = 99;

type InsightDedupCandidate = {
  insightType: string;
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

  const candidateLimit = Math.min(limit * 3, INSIGHT_DEDUP_READ_LIMIT);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(aiInsights)
      .where(whereClause)
      .orderBy(INSIGHT_PRIORITY_ORDER, desc(aiInsights.createdAt))
      .limit(candidateLimit)
      .offset(offset),
    db
      .select({ total: drizzleSql<number>`count(*)::int` })
      .from(aiInsights)
      .where(whereClause),
  ]);
  const dedupedRows = dedupeVisibleInsights(rows);
  const pagedRows = dedupedRows.slice(0, limit);

  return {
    insights: pagedRows.map(formatInsightResponse),
    total: totalRows[0]?.total ?? 0,
  };
}

/**
 * Fetches a summary for the dashboard widget (top 3 insights).
 */
export async function getInsightsSummary(
  creatorProfileId: string
): Promise<InsightsSummaryResponse> {
  const now = new Date();

  const activeWhereClause = and(
    eq(aiInsights.creatorProfileId, creatorProfileId),
    eq(aiInsights.status, 'active'),
    gte(aiInsights.expiresAt, now)
  );

  const [insights, lastRun, totalRows] = await Promise.all([
    db
      .select()
      .from(aiInsights)
      .orderBy(INSIGHT_PRIORITY_ORDER, desc(aiInsights.createdAt))
      .where(activeWhereClause)
      .limit(INSIGHT_SUMMARY_CANDIDATE_LIMIT),
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
    db
      .select({ total: drizzleSql<number>`count(*)::int` })
      .from(aiInsights)
      .where(activeWhereClause),
  ]);

  const dedupedInsights = dedupeVisibleInsights(insights);
  const sortedInsights = sortInsightsForChat(
    dedupedInsights.map(formatInsightResponse)
  );

  return {
    insights: sortedInsights.slice(0, 3),
    totalActive: totalRows[0]?.total ?? 0,
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
        getPriorityRank(left.priority) - getPriorityRank(right.priority) ||
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
  const family = getInsightDedupFamily(insight.insightType);
  const sourceKey = getInsightSourceKey(insight.dataSnapshot);
  if (sourceKey) {
    return `${insight.category}|${family}|${sourceKey}`;
  }

  // Near-duplicate fallback: same signal family + title fingerprint so LLM
  // variants ("3 New Subscribers…" vs "… (300% Growth)") collapse to one card.
  return `${insight.category}|${family}|title:${normalizeInsightTitleForDedup(insight.title)}`;
}

function getPriorityRank(priority: InsightPriority): number {
  return INSIGHT_PRIORITY_RANK[priority] ?? FALLBACK_PRIORITY_RANK;
}

function getInsightDedupFamily(insightType: string): string {
  switch (insightType) {
    case 'city_growth':
    case 'new_market':
      return 'city_growth';
    default:
      return insightType;
  }
}

function getInsightSourceKey(dataSnapshot: unknown): string | null {
  if (!dataSnapshot || typeof dataSnapshot !== 'object') {
    return null;
  }

  const snapshot = dataSnapshot as Record<string, unknown>;
  const city = getSnapshotToken(snapshot, 'city', ['location', 'city']);
  const country = getSnapshotToken(snapshot, 'country', [
    'location',
    'country',
  ]);
  if (city) {
    return country ? `city:${city}|${country}` : `city:${city}`;
  }

  const market = getSnapshotToken(snapshot, 'market');
  if (market) {
    return `market:${market}`;
  }

  const release = getSnapshotToken(snapshot, 'release');
  if (release) {
    return `release:${release}`;
  }

  const referrer = getSnapshotToken(snapshot, 'referrer');
  if (referrer) {
    return `referrer:${referrer}`;
  }

  // spikeDate is deliberately NOT a discriminator: it is the measurement
  // window of the same developing event, not a distinct subject. Keying on
  // it let every daily snapshot of one spike produce its own card
  // (JOV-3522: 3x "3 New Subscribers").
  const deviceType = getSnapshotToken(snapshot, 'deviceType');
  if (deviceType) {
    return `deviceType:${deviceType}`;
  }

  const linkType = getSnapshotToken(snapshot, 'linkType');
  if (linkType) {
    return `linkType:${linkType}`;
  }

  return null;
}

function getSnapshotToken(
  snapshot: Record<string, unknown>,
  key: string,
  nestedPath?: readonly string[]
): string | null {
  const topLevelValue = normalizeSnapshotToken(snapshot[key]);
  if (topLevelValue) {
    return topLevelValue;
  }

  if (!nestedPath) {
    return null;
  }

  let value: unknown = snapshot;
  for (const segment of nestedPath) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    value = (value as Record<string, unknown>)[segment];
  }

  return normalizeSnapshotToken(value);
}

function normalizeSnapshotToken(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized : null;
}
