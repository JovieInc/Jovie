/**
 * Inbox swipe decision persistence (JOV-3934 / GH #13175).
 *
 * Accept/reject already CAS-update suggested_actions. This module emits a
 * structured decision event into the feedback store so ranking can learn, and
 * supports an optional reject reason without blocking the gesture.
 */

import { createFeedbackItem } from '@/lib/feedback';
import { logger } from '@/lib/utils/logger';

export type InboxDecisionVerdict = 'approved' | 'rejected';

export interface InboxDecisionEvent {
  readonly suggestedActionId: string;
  readonly userId: string | null;
  readonly verdict: InboxDecisionVerdict;
  readonly reason?: string | null;
  readonly cardKind?: string | null;
  readonly surface?: string;
}

/**
 * Emit an idempotent decision event to the feedback store.
 * Uses a deterministic source key so re-swipes update the learning trail
 * without inventing a second event store.
 */
export async function recordInboxDecision(
  event: InboxDecisionEvent
): Promise<{ id: string } | null> {
  const surface = event.surface ?? 'opportunity-inbox';
  const reasonPart = event.reason?.trim()
    ? ` reason=${event.reason.trim().slice(0, 200)}`
    : '';
  const message = `Inbox decision: ${event.verdict} action=${event.suggestedActionId}${reasonPart}`;

  try {
    const item = await createFeedbackItem({
      userId: event.userId,
      message,
      source: 'opportunity-inbox-decision',
      context: {
        pathname: surface,
        userAgent: null,
        timestampIso: new Date().toISOString(),
        suggestedActionId: event.suggestedActionId,
        verdict: event.verdict,
        reason: event.reason ?? null,
        cardKind: event.cardKind ?? null,
        surface,
        decisionKind: 'inbox_swipe',
      },
    });
    return item;
  } catch (error) {
    // Decision telemetry must not fail the accept/reject gesture.
    logger.warn('[inbox-decision] failed to record decision event', {
      suggestedActionId: event.suggestedActionId,
      error,
    });
    return null;
  }
}
