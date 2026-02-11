import { tool } from 'ai';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { aiInsightGenerationLimiter } from '@/lib/rate-limit';
import { aggregateMetrics } from '@/lib/services/insights/data-aggregator';
import { generateInsights } from '@/lib/services/insights/insight-generator';
import { getExistingInsightTypes } from '@/lib/services/insights/lifecycle';
import type { GeneratedInsight } from '@/types/insights';

/** Map focus areas to insight categories for filtering */
const FOCUS_CATEGORIES: Record<string, string[]> = {
  all: [],
  growth: ['growth'],
  revenue: ['revenue'],
  geographic: ['geographic', 'tour'],
  engagement: ['engagement', 'timing', 'platform'],
};

/**
 * Creates the generateInsights tool for on-demand AI insight generation from chat.
 * This calls the existing insight generator and returns insights ephemerally (not persisted to DB).
 */
export function createGenerateInsightsTool(
  profileId: string,
  userId: string
) {
  return tool({
    description:
      "Generate AI-powered insights from the artist's analytics data. Use this when the artist asks you to analyze their data, find trends, or wants a comprehensive overview of how they're doing. This calls an AI model internally and may take a few seconds.",
    inputSchema: z.object({
      focus: z
        .enum(['all', 'growth', 'revenue', 'geographic', 'engagement'])
        .default('all')
        .describe("Focus area for insight generation. Default: 'all'"),
    }),
    execute: async ({ focus }) => {
      // Rate limit check — 3 per hour per user
      const rateLimitResult = await aiInsightGenerationLimiter.limit(userId);
      if (!rateLimitResult.success) {
        return {
          success: false,
          error:
            'Insight generation rate limit reached. You can generate insights up to 3 times per hour. Please try again later.',
        };
      }

      try {
        // 1. Aggregate metrics (30-day period)
        const metrics = await aggregateMetrics(profileId, 30);

        // 2. Check for existing insight types to avoid duplicates
        const existingTypes = await getExistingInsightTypes(profileId);

        // 3. Generate AI insights
        const result = await generateInsights(metrics, existingTypes);

        // 4. Filter by focus area if specified
        let insights: GeneratedInsight[] = result.insights;
        const focusCategories = FOCUS_CATEGORIES[focus] ?? [];
        if (focusCategories.length > 0) {
          insights = insights.filter(i =>
            focusCategories.includes(i.category)
          );
        }

        if (insights.length === 0) {
          return {
            success: true,
            insights: [],
            message:
              focus === 'all'
                ? "Not enough data to generate meaningful insights yet. As you get more traffic and engagement, I'll be able to find trends for you."
                : `No ${focus}-related insights could be generated from the current data. Try 'all' for a broader analysis.`,
          };
        }

        // 5. Format for chat display (NOT stored in DB — ephemeral)
        return {
          success: true,
          insights: insights.map(formatInsightForChat),
          summary: {
            total: insights.length,
            focus,
            highPriority: insights.filter(i => i.priority === 'high').length,
            mediumPriority: insights.filter(i => i.priority === 'medium')
              .length,
            lowPriority: insights.filter(i => i.priority === 'low').length,
          },
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'ai-chat', tool: 'generateInsights' },
          extra: { profileId, focus },
        });
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to generate insights';
        return { success: false, error: message };
      }
    },
  });
}

function formatInsightForChat(insight: GeneratedInsight) {
  return {
    type: insight.insightType,
    category: insight.category,
    priority: insight.priority,
    title: insight.title,
    description: insight.description,
    action: insight.actionSuggestion,
    confidence: insight.confidence,
  };
}
