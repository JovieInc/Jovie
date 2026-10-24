import { describe, expect, it } from 'vitest';
import { chatTranscriptRangeWithPinnedTail } from '@/components/jovie/chat-transcript-range';

function range(startIndex: number, endIndex: number, count: number) {
  return { startIndex, endIndex, overscan: 5, count, lane: 0 };
}

describe('chatTranscriptRangeWithPinnedTail (JOV-8481)', () => {
  it('mounts the newest message when the virtual window excludes it', () => {
    // A stale/out-of-sync window (e.g. rows reported before the newest reply
    // landed) must still mount the newest row, or scrollIntoView to the live
    // tail finds no element.
    const indexes = chatTranscriptRangeWithPinnedTail(range(0, 1, 9));
    expect(indexes).toContain(8);
    expect(indexes).toContain(0);
    expect(indexes).toContain(1);
    expect(chatTranscriptRangeWithPinnedTail(range(0, 4, 20))).toContain(19);
  });

  it('does not duplicate the tail when the window already includes it', () => {
    const indexes = chatTranscriptRangeWithPinnedTail(range(3, 9, 10));
    expect(indexes.filter(index => index === 9)).toHaveLength(1);
    expect(indexes).toContain(3);
  });

  it('renders nothing for an empty thread', () => {
    expect(chatTranscriptRangeWithPinnedTail(range(0, 0, 0))).toEqual([]);
  });
});
