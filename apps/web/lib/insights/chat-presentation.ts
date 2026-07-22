import { normalizeInsightTitleForDedup } from '@/lib/insights/insight-dedup';
import type {
  InsightCategory,
  InsightResponse,
  InsightType,
} from '@/types/insights';

const PRIORITY_SCORES = {
  high: 300,
  medium: 200,
  low: 100,
} as const;

const CATEGORY_SCORES: Record<InsightCategory, number> = {
  growth: 80,
  revenue: 90,
  engagement: 70,
  content: 65,
  geographic: 55,
  platform: 50,
  timing: 35,
  tour: 40,
};

const TYPE_SCORES: Partial<Record<InsightType, number>> = {
  subscriber_surge: 120,
  subscriber_churn: 115,
  capture_rate_change: 105,
  tip_hotspot: 110,
  release_momentum: 85,
  engagement_quality: 80,
  peak_activity: 45,
  platform_preference: 60,
  referrer_surge: 70,
};

function getInsightScore(
  insight: Pick<InsightResponse, 'priority' | 'category' | 'insightType'>
) {
  return (
    PRIORITY_SCORES[insight.priority] +
    CATEGORY_SCORES[insight.category] +
    (TYPE_SCORES[insight.insightType] ?? 0)
  );
}

export function sortInsightsForChat<T extends InsightResponse>(insights: T[]) {
  return [...insights].sort((a, b) => {
    const scoreDelta = getInsightScore(b) - getInsightScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Client-side defensive dedupe for chat cards (no dataSnapshot available).
 * Collapses near-identical titles within the same insight type family so
 * already-persisted tool results cannot re-show the same signal 3×.
 */
export function dedupeChatInsightCards<T extends InsightResponse>(
  insights: readonly T[]
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const insight of insights) {
    const key = `${insight.category}|${insight.insightType}|${normalizeInsightTitleForDedup(insight.title)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(insight);
  }

  return deduped;
}

const PROMPT_BY_TYPE: Partial<Record<InsightType, string>> = {
  subscriber_surge:
    'What should I focus on this week based on my audience and subscribers?',
  subscriber_churn:
    'What should I focus on this week based on my audience and subscribers?',
  capture_rate_change:
    'What should I focus on this week based on my audience and subscribers?',
  release_momentum: 'Which release is getting traction right now?',
  tip_hotspot: 'Where am I seeing the strongest monetization signals?',
  city_growth: 'Which cities are heating up for me right now?',
  new_market: 'Which cities are heating up for me right now?',
  declining_market: 'Which cities are heating up for me right now?',
  tour_gap: 'Which cities are heating up for me right now?',
  tour_timing: 'Which cities are heating up for me right now?',
  engagement_quality:
    'What engagement signals should I pay attention to right now?',
  peak_activity: 'What engagement signals should I pay attention to right now?',
  device_shift: 'What engagement signals should I pay attention to right now?',
  platform_preference: 'Which sources and platforms are working best for me?',
  referrer_surge: 'Which sources and platforms are working best for me?',
};

export function buildInsightPrompt(
  insight: Pick<InsightResponse, 'insightType' | 'title'>
) {
  return (
    PROMPT_BY_TYPE[insight.insightType] ??
    `Explain this insight: ${insight.title}`
  );
}
