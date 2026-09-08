/**
 * Shared chat transcript window (JOV-5874 recertifies JOV-5044).
 *
 * Web `/app/chat` and Mac Electron host this same renderer (JOV-INV-013).
 * iOS mirrors these numbers in `ChatTranscriptWindow`. Do not copy a Grok Bot
 * dispatcher and do not add a Swift Mac chat shell.
 *
 * JOV-INV-012 product contract uses the existing analytics, model-experiment,
 * audience-event, YouTube-experiment, and release-to-revenue surfaces.
 */
export const CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY =
  'chat-transcript-window:v1' as const;

export const CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION = {
  kind: 'product',
  variantIdentity: CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY,
  exposure:
    'analytics `chat_timeline.transition` plus UX latency `chat_first_token` / `chat_send_round_trip` on `/app/chat` (Mac Electron hosts the same renderer)',
  outcome:
    'artist-business-outcome completed in-chat tool actions per eligible chat session',
  attribution:
    'analytics session plus UX latency samples; model-experiment receipts if a bounded chat-window variant is promoted',
  contextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'genre-or-cohort',
    'artist-plus-career-era-or-lifecycle',
    'content-variant',
  ],
  hypothesis:
    'A Grok Bot-smooth composer and windowed transcript increases completed artist work in chat without increasing complaint or trust failures',
  primaryMetric:
    'artist-business-outcome: completed in-chat tool actions per eligible session',
  guardrails: ['complaint', 'trust', 'brand'],
  privacy:
    'first-party consented creator chat behavior only; no sensitive demographic inference or cross-platform identity stitching',
  optimizerOwner: 'Symphony',
  cadence: 'weekly decision with writeback',
  decisionWriteback: 'model-experiment promotion receipt',
  rollback:
    'revert `chat-transcript-window:v1` to the prior unwindowed iOS fetch and disabled-while-sending composer; do not auto-promote identity changes',
} as const;

export const CHAT_TRANSCRIPT_WINDOW = {
  /** Virtualize rendering once the thread grows past this many rows. */
  virtualizeAfterMessageCount: 8,
  /** TanStack virtualizer overscan. Keep per-token work on the live row. */
  overscanRowCount: 5,
  /**
   * Initial persisted-history window (newest first). Older rows load on
   * demand via `before` — do not mount the whole thread.
   */
  initialMessageWindow: 40,
} as const;

export type ChatTranscriptWindow = typeof CHAT_TRANSCRIPT_WINDOW;

export function chatTranscriptVisibleTail<T>(
  items: readonly T[],
  windowSize: number = CHAT_TRANSCRIPT_WINDOW.initialMessageWindow
): readonly T[] {
  if (items.length <= windowSize) return items;
  return items.slice(items.length - windowSize);
}

export function chatTranscriptHasOlderHistory(input: {
  readonly cachedCount: number;
  readonly fetchedHasMore: boolean;
  readonly windowSize?: number;
}): boolean {
  const windowSize =
    input.windowSize ?? CHAT_TRANSCRIPT_WINDOW.initialMessageWindow;
  return input.fetchedHasMore || input.cachedCount > windowSize;
}
