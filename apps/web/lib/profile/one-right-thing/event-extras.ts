import type { FeaturedDecision } from './engine';

/**
 * Event extras attached to every featured impression and tap, so each can be
 * grouped by item kind and reason code (and segmented by arrival channel).
 * Nulls are omitted: PAC extras only carry string, number and boolean values.
 */
export function featuredEventExtras(
  decision: FeaturedDecision | null | undefined
): Record<string, string> | undefined {
  if (!decision) return undefined;
  return {
    featured_kind: decision.kind,
    featured_reason: decision.reason,
    featured_channel: decision.context.channel,
    ...(decision.context.source
      ? { featured_source: decision.context.source }
      : {}),
  };
}
