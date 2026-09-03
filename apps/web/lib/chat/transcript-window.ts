/**
 * Shared chat transcript window (JOV-5874 recertifies JOV-5044).
 *
 * Web `/app/chat` and Mac Electron host this same renderer (JOV-INV-013).
 * iOS mirrors these numbers in `ChatTranscriptWindow`. Do not copy a Grok Bot
 * dispatcher and do not add a Swift Mac chat shell.
 */
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
