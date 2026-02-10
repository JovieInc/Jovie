import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { GeneratedInsight, MetricSnapshot } from '@/types/insights';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { MAX_INSIGHTS_PER_RUN, MIN_CONFIDENCE } from './thresholds';

/**
 * Zod schema for validating AI-generated insights.
 */
const generatedInsightSchema = z.object({
  insightType: z.enum([
    'city_growth',
    'new_market',
    'declining_market',
    'tour_gap',
    'tour_timing',
    'subscriber_surge',
    'subscriber_churn',
    'release_momentum',
    'platform_preference',
    'referrer_surge',
    'tip_hotspot',
    'engagement_quality',
    'peak_activity',
    'capture_rate_change',
    'device_shift',
  ]),
  category: z.enum([
    'geographic',
    'growth',
    'content',
    'revenue',
    'tour',
    'platform',
    'engagement',
    'timing',
  ]),
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

/**
 * Generates AI-powered insights from aggregated analytics metrics.
 *
 * Uses Claude via the Vercel AI SDK gateway with structured output
 * to produce typed, validated insights.
 */
export async function generateInsights(
  metrics: MetricSnapshot,
  existingInsightTypes: string[]
): Promise<InsightGenerationResult> {
  const modelId = 'anthropic:claude-sonnet-4-20250514';

  const { object, usage } = await generateObject({
    model: gateway.languageModel(modelId),
    schema: insightsResponseSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(metrics, existingInsightTypes),
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  // Filter out low-confidence insights
  const validInsights = object.insights.filter(
    insight => insight.confidence >= MIN_CONFIDENCE
  );

  return {
    insights: validInsights,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    modelUsed: modelId,
  };
}
