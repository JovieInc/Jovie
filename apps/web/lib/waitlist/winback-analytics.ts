import 'server-only';

import { trackServerEvent } from '@/lib/server-analytics';

/**
 * Win-back funnel events (founder dispatch 2026-11-09). All win-back
 * emissions go through this single helper so the production
 * `trackServerEvent` call sites stay pinned in one inventory entry.
 *
 * `winback_opened`, `returned` and `paid` are registered for the funnel now
 * and wire up as their observation points land (email open tracking,
 * setup completion, subscription payment).
 */
export const WINBACK_ANALYTICS_EVENTS = [
  'requalify_matched',
  'data_certified',
  'winback_drafted',
  'winback_approved',
  'winback_sent',
  'winback_opened',
  'winback_clicked',
  'returned',
  'paid',
] as const;

export type WinbackAnalyticsEvent = (typeof WINBACK_ANALYTICS_EVENTS)[number];

const WINBACK_EVENT_SET = new Set<string>(WINBACK_ANALYTICS_EVENTS);

export type WinbackEventProperties = {
  readonly entry_id?: string;
  readonly capability_key?: string;
  readonly batch_id?: string;
  readonly template_version?: string;
  readonly winback_cohort?: string;
};

export async function trackWinbackEvent(
  event: WinbackAnalyticsEvent,
  properties: WinbackEventProperties
): Promise<void> {
  if (!WINBACK_EVENT_SET.has(event)) return;
  await trackServerEvent(event, { ...properties });
}
