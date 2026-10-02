/**
 * Chat empty-state greeting + insight (JOV-7150). Replaces the "Just ask"
 * heading and chip/suggestion state with one personal sentence: a
 * real insight sentence when one exists, otherwise a time-of-day greeting
 * by first name. Never fabricates a number — the insight is either a real, active
 * `/api/insights/summary` entry or a real profile-completeness signal, or
 * omitted entirely.
 */

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

/**
 * Resolves the one-sentence insight, or null when none is real.
 *
 * `topInsightTitle` is the top active entry from `/api/insights/summary`
 * (Pro-only, server-computed from real analytics — covers both "a live
 * release" via the `release_momentum` insight type and "a real stat
 * change" via subscriber/engagement insight types). Falls back to a
 * profile-completeness sentence when there is no active insight. Returns
 * null — greeting alone — when neither is real.
 */
export function resolveChatEmptyStateInsight({
  topInsightTitle,
  isProfileComplete,
  isFirstSession,
}: {
  readonly topInsightTitle?: string | null;
  readonly isProfileComplete: boolean;
  readonly isFirstSession: boolean;
}): string | null {
  const trimmedInsight = topInsightTitle?.trim();
  if (trimmedInsight) return trimmedInsight;
  if (isProfileComplete && isFirstSession) {
    return 'Your profile is ready to share.';
  }
  return null;
}
