import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual';

/**
 * Virtualizer range extractor that keeps the newest transcript message
 * mounted (JOV-8481).
 *
 * TanStack Virtual mounts only the rows inside the scroll window. When that
 * window excludes the last message — a stale window before the virtualizer
 * recalculates after a new reply lands, or the tail pinned below the
 * viewport — `scrollIntoView` (and `[data-index]` lookups) against the newest
 * message find no element and silently no-op. Feed this to `useVirtualizer`'s
 * `rangeExtractor` so the tail index is always part of the mounted window.
 */
export function chatTranscriptRangeWithPinnedTail(range: Range): number[] {
  const indexes = defaultRangeExtractor(range);
  const tailIndex = range.count - 1;
  if (tailIndex >= 0 && !indexes.includes(tailIndex)) {
    indexes.push(tailIndex);
  }
  return indexes;
}
