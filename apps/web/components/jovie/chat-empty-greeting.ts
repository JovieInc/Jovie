import {
  appliesToSegment,
  INSIGHT_ACTIONS,
} from '@/lib/creator/segment-registry';
import type { ResolvedSegment } from '@/lib/creator/segments';
import { resolveSafeFirstName } from '@/lib/email/templates/personalization';
import type { InsightResponse, InsightType } from '@/types/insights';

/** Home welcomes the person and offers one real next step (JOV-7150). */

export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * A person's first-and-last name greets by first name ("Tim White" -> "Tim").
 * Any other display name is an artist or band name and greets whole ("Good
 * Dropouts", "UNMARKED"), never by its first word ("Good afternoon, Good.").
 * Artists are greeted by name: the golden path asserts it.
 */
export function getChatEmptyStateFirstName(
  displayName: string | null | undefined
): string | null {
  const name = displayName?.trim().replaceAll(/\s+/g, ' ') ?? '';
  if (!name) return null;
  return resolveSafeFirstName(name, '') ?? name;
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
  now = Date.now(),
  segment?: ResolvedSegment
): ChatEmptyStateAction | null {
  for (const insight of insights) {
    // Segment gate (JOV-9679): a comedian never gets "Draft a release update".
    // `segment` omitted keeps legacy behavior for callers without a profile.
    if (
      segment !== undefined &&
      !INSIGHT_ACTIONS.some(
        item =>
          item.insightType === insight.insightType &&
          appliesToSegment(item.segments, segment)
      )
    ) {
      continue;
    }
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
