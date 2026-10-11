import { describe, expect, it } from 'vitest';
import {
  CHAT_TRANSCRIPT_ROW_ESTIMATE_PX,
  CHAT_TRANSCRIPT_WINDOW,
  CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION,
  CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY,
  chatTranscriptHasOlderHistory,
  chatTranscriptVisibleTail,
  measureChatTranscriptRow,
} from '@/lib/chat/transcript-window';

describe('CHAT_TRANSCRIPT_WINDOW (JOV-5044 recertify)', () => {
  it('virtualizes early so short-but-growing threads stay at 60fps', () => {
    expect(CHAT_TRANSCRIPT_WINDOW.virtualizeAfterMessageCount).toBe(8);
    expect(CHAT_TRANSCRIPT_WINDOW.overscanRowCount).toBe(5);
  });

  it('loads a newest-first persisted window instead of the whole thread', () => {
    expect(CHAT_TRANSCRIPT_WINDOW.initialMessageWindow).toBe(40);
    expect(CHAT_TRANSCRIPT_WINDOW.initialMessageWindow).toBeGreaterThan(
      CHAT_TRANSCRIPT_WINDOW.virtualizeAfterMessageCount
    );
  });

  it('returns the visible tail without copying a short thread', () => {
    const short = ['a', 'b', 'c'];
    expect(chatTranscriptVisibleTail(short, 40)).toBe(short);
    expect(chatTranscriptVisibleTail(['1', '2', '3', '4', '5'], 3)).toEqual([
      '3',
      '4',
      '5',
    ]);
  });

  it('keeps a stable JOV-INV-012 product identity for Symphony writeback', () => {
    expect(CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY).toBe(
      'chat-transcript-window:v1'
    );
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.kind).toBe('product');
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.variantIdentity).toBe(
      CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY
    );
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.exposure).toContain(
      'chat_timeline.transition'
    );
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.exposure).toContain(
      'chat_first_token'
    );
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.primaryMetric).toContain(
      'completed in-chat tool actions'
    );
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.optimizerOwner).toBe('Symphony');
    expect(CHAT_TRANSCRIPT_WINDOW_OPTIMIZATION.rollback).toContain(
      'chat-transcript-window:v1'
    );
  });

  it('offers older history when cache or the server says more exists', () => {
    expect(
      chatTranscriptHasOlderHistory({ cachedCount: 10, fetchedHasMore: false })
    ).toBe(false);
    expect(
      chatTranscriptHasOlderHistory({ cachedCount: 41, fetchedHasMore: false })
    ).toBe(true);
    expect(
      chatTranscriptHasOlderHistory({ cachedCount: 2, fetchedHasMore: true })
    ).toBe(true);
  });

  it('returns the real row height once the viewport is laid out', () => {
    const row = { getBoundingClientRect: () => ({ height: 132 }) };
    const container = { clientHeight: 800 };
    expect(measureChatTranscriptRow(row as never, container as never)).toBe(
      132
    );
  });

  it('refuses to cache collapsed row heights from a hidden viewport (JOV-6702)', () => {
    // Rows read ~0-1px while the scroll container is unlaid-out (workspace
    // switch / first paint); caching that blanks the transcript forever.
    const collapsedRow = { getBoundingClientRect: () => ({ height: 1 }) };
    const hiddenContainer = { clientHeight: 0 };
    expect(
      measureChatTranscriptRow(collapsedRow as never, hiddenContainer as never)
    ).toBe(CHAT_TRANSCRIPT_ROW_ESTIMATE_PX);
    expect(
      measureChatTranscriptRow(
        collapsedRow as never,
        {
          clientHeight: 800,
        } as never
      )
    ).toBe(CHAT_TRANSCRIPT_ROW_ESTIMATE_PX);
    expect(measureChatTranscriptRow(collapsedRow as never, null)).toBe(
      CHAT_TRANSCRIPT_ROW_ESTIMATE_PX
    );
  });
});
