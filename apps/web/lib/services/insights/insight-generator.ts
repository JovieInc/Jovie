import { createHash } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';
import { INSIGHT_MODEL } from '@/lib/constants/ai-models';
import type { GeneratedInsight, MetricSnapshot } from '@/types/insights';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { MAX_INSIGHTS_PER_RUN, MIN_CONFIDENCE } from './thresholds';

/**
 * Surviving insight types after pruning low-value / broken types.
 *
 * Killed: peak_activity (repeat machine), tour_gap (incomplete data),
 * tour_timing (incomplete data), tip_hotspot (most artists lack tips),
 * device_shift (low-value signal).
 *
 * DB enums are unchanged for backwards compatibility.
 */
const SURVIVING_INSIGHT_TYPES = [
  'city_growth',
  'new_market',
  'declining_market',
  'subscriber_surge',
  'subscriber_churn',
  'release_momentum',
  'platform_preference',
  'referrer_surge',
  'engagement_quality',
  'capture_rate_change',
] as const;

const SURVIVING_CATEGORIES = [
  'geographic',
  'growth',
  'content',
  'platform',
  'engagement',
] as const;

/**
 * Zod schema for validating AI-generated insights.
 */
const generatedInsightSchema = z.object({
  insightType: z.enum(SURVIVING_INSIGHT_TYPES),
  category: z.enum(SURVIVING_CATEGORIES),
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string().max(120),
  description: z.string().max(500),
  actionSuggestion: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
  dataSnapshot: z.record(z.string(), z.unknown()),
  expiresInDays: z.number().int().min(1).max(90),
});

const insightsResponseSchema = z.object({
  insights: z.array(generatedInsightSchema).max(MAX_INSIGHTS_PER_RUN),
});

export interface InsightGenerationResult {
  insights: GeneratedInsight[];
  promptTokens: number;
  completionTokens: number;
  modelUsed: string;
}

// ---------------------------------------------------------------------------
// Data freshness gate — prevent regenerating unchanged insights
// ---------------------------------------------------------------------------

/**
 * Maps each insight type to the MetricSnapshot keys that feed it.
 * Used to compute a content hash for freshness comparison.
 */
const INSIGHT_DATA_KEYS: Record<string, (m: MetricSnapshot) => unknown> = {
  city_growth: m => m.geographic,
  new_market: m => m.geographic,
  declining_market: m => m.geographic,
  subscriber_surge: m => m.subscribers,
  subscriber_churn: m => m.subscribers,
  capture_rate_change: m => m.engagement,
  release_momentum: m => m.content,
  platform_preference: m => m.content.clicksByLinkType,
  referrer_surge: m => m.referrers,
  engagement_quality: m => m.engagement.intentDistributionCurrent,
};

/**
 * Computes a SHA-256 hash for the data slice that feeds an insight type.
 */
export function computeDataHash(
  insightType: string,
  metrics: MetricSnapshot
): string {
  const extractor = INSIGHT_DATA_KEYS[insightType];
  const data = extractor ? extractor(metrics) : null;
  return createHash('sha256')
    .update(JSON.stringify(data ?? ''))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Identifies insight types whose underlying data hasn't changed since
 * the last generation run. Returns the types that should be excluded.
 */
export function findStaleTypes(
  metrics: MetricSnapshot,
  existingInsights: { insightType: string; metadata: Record<string, unknown> }[]
): string[] {
  const stale: string[] = [];
  for (const existing of existingInsights) {
    const previousHash = existing.metadata?.dataHash;
    if (typeof previousHash !== 'string') continue;
    const currentHash = computeDataHash(existing.insightType, metrics);
    if (currentHash === previousHash) {
      stale.push(existing.insightType);
    }
  }
  return stale;
}

/**
 * Generates AI-powered insights from aggregated analytics metrics.
 *
 * Uses Claude via the Vercel AI SDK gateway with structured output
 * to produce typed, validated insights.
 */
export async function generateInsights(
  metrics: MetricSnapshot,
  existingInsightTypes: string[],
  staleTypes: string[] = []
): Promise<InsightGenerationResult> {
  // Merge existing + stale types into the exclusion list
  const allExcluded = [...new Set([...existingInsightTypes, ...staleTypes])];

  const { object, usage } = await generateObject({
    model: gateway(INSIGHT_MODEL),
    schema: insightsResponseSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(metrics, allExcluded, staleTypes),
    temperature: 0.3,
    maxOutputTokens: 4096,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'jovie-insight-generator',
      metadata: { model: INSIGHT_MODEL },
    },
  });

  // Filter out low-confidence insights
  const validInsights = object.insights.filter(
    insight => insight.confidence >= MIN_CONFIDENCE
  );

  // Attach data hashes to each insight's dataSnapshot for future freshness checks
  const insightsWithHashes: GeneratedInsight[] = validInsights.map(insight => ({
    ...insight,
    dataSnapshot: {
      ...insight.dataSnapshot,
      dataHash: computeDataHash(insight.insightType, metrics),
    },
  }));

  return {
    insights: insightsWithHashes,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    modelUsed: INSIGHT_MODEL,
  };
}

export { SURVIVING_CATEGORIES, SURVIVING_INSIGHT_TYPES };
