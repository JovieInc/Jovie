import type { InsightResponse, InsightType } from '@/types/insights';

/** Home welcomes the person and offers one real next step (JOV-7150). */

export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First token of a real display name. Never invents a name. */
export function getChatEmptyStateFirstName(
  displayName: string | null | undefined
): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function getChatEmptyStateGreetingText(
  firstName: string | null,
  date: Date = new Date()
): string {
  const timeOfDay = getTimeOfDayGreeting(date);
  return firstName ? `${timeOfDay}, ${firstName}.` : `${timeOfDay}.`;
}

export interface ChatEmptyStateAction {
  readonly insightId: string;
  readonly suggestion: string;
  readonly prompt: string;
  readonly expiresAt: number;
}

// Existing chat can draft or analyze these concrete tasks. Model prose is
// context, never customer-facing proof that a result has already occurred.
const ACTION_BY_TYPE: Record<InsightType, string> = {
  release_momentum: 'Draft a release update',
  subscriber_surge: 'Draft a fan update',
  subscriber_churn: 'Draft a fan update',
  tip_hotspot: 'Review your tip flow with Jovie',
  capture_rate_change: 'Review your signup flow with Jovie',
  city_growth: 'Plan your next show',
  new_market: 'Plan your next show',
  declining_market: 'Plan your next show',
  tour_gap: 'Plan your next show',
  tour_timing: 'Plan your next show',
  platform_preference: 'Review your traffic sources',
  referrer_surge: 'Review your traffic sources',
  engagement_quality: 'Plan your next fan update',
  peak_activity: 'Plan when to share your next update',
  device_shift: 'Review your audience experience',
};

/**
 * Summary order is owned by the server. Model-written titles/confidence do not
 * certify a win. Only offer a current actionable entry, as a contextual draft;
 * activating it does not claim execution or mark the Insight acted on.
 */
export function resolveChatEmptyStateInsight(
  insights: readonly InsightResponse[],
  now = Date.now()
): ChatEmptyStateAction | null {
  for (const insight of insights) {
    const suggestion = insight.actionSuggestion?.trim();
    const supportedAction = ACTION_BY_TYPE[insight.insightType];
    const expiresAt = Date.parse(insight.expiresAt);
    if (
      insight.status !== 'active' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      !insight.id?.trim() ||
      !insight.title?.trim() ||
      !suggestion ||
      !supportedAction ||
      suggestion.length > 240
    ) {
      continue;
    }

    // Conversion is Jovie's work. Do not turn its shortfall into artist homework.
    const conversionFlow =
      insight.insightType === 'tip_hotspot'
        ? 'tip'
        : insight.insightType === 'capture_rate_change'
          ? 'signup'
          : null;
    return {
      insightId: insight.id,
      expiresAt,
      suggestion: supportedAction,
      prompt: conversionFlow
        ? `Review my ${conversionFlow} flow and identify a concrete improvement Jovie can make.\n\nInsight ${insight.id}: ${insight.title}`
        : `Help me with this next step: ${supportedAction}. Ask for any missing facts; do not invent results.\n\nInsight ${insight.id}: ${insight.title}\nSuggested context: ${suggestion}`,
    };
  }
  return null;
}
