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

export function buildInsightPrompt(
  insight: Pick<InsightResponse, 'insightType' | 'title'>
) {
  switch (insight.insightType) {
    case 'subscriber_surge':
    case 'subscriber_churn':
    case 'capture_rate_change':
      return 'What should I focus on this week based on my audience and subscribers?';
    case 'release_momentum':
      return 'Which release is getting traction right now?';
    case 'tip_hotspot':
      return 'Where am I seeing the strongest monetization signals?';
    case 'city_growth':
    case 'new_market':
    case 'declining_market':
    case 'tour_gap':
    case 'tour_timing':
      return 'Which cities are heating up for me right now?';
    case 'engagement_quality':
    case 'peak_activity':
    case 'device_shift':
      return 'What engagement signals should I pay attention to right now?';
    case 'platform_preference':
    case 'referrer_surge':
      return 'Which sources and platforms are working best for me?';
    default:
      return `Explain this insight: ${insight.title}`;
  }
}
