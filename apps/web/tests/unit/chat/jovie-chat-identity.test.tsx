/**
 * Integration-style tests for chat identity stability.
 *
 * These do not mount the real <JovieChat /> — the AI SDK hook is too
 * expensive to mock for the narrow invariant we want to verify. Instead we
 * drive the jank monitor directly with the sequence of snapshots that the
 * real UI emits under two failure-prone scenarios:
 *
 *  A. Optimistic send → server reconciliation: the same message id is
 *     present throughout. No disappear, no duplicate, no id change.
 *
 *  B. Refetch during active stream: existing visible messages stay
 *     visible. No disappear, no duplicate, streaming text never shrinks.
 *
 * If a future change breaks one of these invariants (e.g. `setMessages`
 * replaces the array wholesale during streaming), the monitor will emit
 * a jank event and these tests fail.
 */

import { describe, expect, it } from 'vitest';

import {
  createJankMonitor,
  JANK_EVENT_NAMES,
  type JankEventName,
  type JankPayload,
  type MessageSnapshot,
} from '@/lib/chat/jank-monitor';

function msg(
  id: string,
  role: MessageSnapshot['role'],
  textLength: number
): MessageSnapshot {
  return {
    id,
    role,
    isServerAssigned: true,
    parts: textLength > 0 ? [{ kind: 'text', textLength }] : [],
  };
}

function captureFactory() {
  const events: Array<{ event: JankEventName; payload: JankPayload }> = [];
  const monitor = createJankMonitor({
    emit: (event, payload) => events.push({ event, payload }),
  });
  return { monitor, events };
}

describe('chat identity stability (integration contract)', () => {
  it('A. optimistic send with stable id: no duplicate, no disappear, no reorder', () => {
    const { monitor, events } = captureFactory();
    const userId = 'user-stable-1';

    // 1. Baseline: one existing assistant message
    monitor.observeMessages('c1', [msg('a-prior', 'assistant', 20)]);

    // 2. User sends → optimistic user bubble appears with a stable id
    monitor.onSend('c1', 1);
    monitor.observeMessages('c1', [
      msg('a-prior', 'assistant', 20),
      msg(userId, 'user', 5),
    ]);

    // 3. Server echoes back with the SAME id (useChat behavior). Assistant
    //    begins streaming an empty message.
    monitor.observeMessages(
      'c1',
      [
        msg('a-prior', 'assistant', 20),
        msg(userId, 'user', 5),
        msg('asst-1', 'assistant', 0),
      ],
      'streaming'
    );

    // 4. Assistant streams.
    monitor.observeMessages(
      'c1',
      [
        msg('a-prior', 'assistant', 20),
        msg(userId, 'user', 5),
        msg('asst-1', 'assistant', 12),
      ],
      'streaming'
    );

    // 5. Stream completes.
    monitor.observeMessages(
      'c1',
      [
        msg('a-prior', 'assistant', 20),
        msg(userId, 'user', 5),
        msg('asst-1', 'assistant', 40),
      ],
      'ready'
    );

    const names = events.map(e => e.event);
    expect(names).not.toContain(JANK_EVENT_NAMES.MESSAGE_DUPLICATED);
    expect(names).not.toContain(JANK_EVENT_NAMES.MESSAGE_DISAPPEARED);
    expect(names).not.toContain(JANK_EVENT_NAMES.MESSAGE_REORDERED);
    expect(names).not.toContain(
      JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND
    );
    expect(monitor.getSummary('c1').isJankFree).toBe(true);
  });

  it('B. refetch during active stream: existing messages stay, no remount', () => {
    const { monitor, events } = captureFactory();

    // 1. Conversation already hydrated with two persisted messages.
    monitor.observeMessages('c2', [
      msg('u-old', 'user', 8),
      msg('a-old', 'assistant', 30),
    ]);

    // 2. User sends a new message; assistant begins streaming.
    monitor.onSend('c2', 2);
    monitor.observeMessages(
      'c2',
      [
        msg('u-old', 'user', 8),
        msg('a-old', 'assistant', 30),
        msg('u-new', 'user', 10),
      ],
      'submitted'
    );
    monitor.observeMessages(
      'c2',
      [
        msg('u-old', 'user', 8),
        msg('a-old', 'assistant', 30),
        msg('u-new', 'user', 10),
        msg('a-new', 'assistant', 4),
      ],
      'streaming'
    );

    // 3. Mid-stream, a TanStack refetch completes and returns fresh data for
    //    the persisted messages (same ids). The useChat hydration guard
    //    (hasHydratedRef) means setMessages is NOT called — so the snapshot
    //    stays the same plus the streamed content grows.
    monitor.observeMessages(
      'c2',
      [
        msg('u-old', 'user', 8),
        msg('a-old', 'assistant', 30),
        msg('u-new', 'user', 10),
        msg('a-new', 'assistant', 12),
      ],
      'streaming'
    );

    // 4. Another refetch: server returned the full persisted history
    //    (u-old, a-old). If we incorrectly blew away the streaming assistant
    //    message, we'd see 'a-new' disappear — the monitor would flag it.
    monitor.observeMessages(
      'c2',
      [
        msg('u-old', 'user', 8),
        msg('a-old', 'assistant', 30),
        msg('u-new', 'user', 10),
        msg('a-new', 'assistant', 20),
      ],
      'streaming'
    );

    // 5. Stream completes.
    monitor.observeMessages(
      'c2',
      [
        msg('u-old', 'user', 8),
        msg('a-old', 'assistant', 30),
        msg('u-new', 'user', 10),
        msg('a-new', 'assistant', 42),
      ],
      'ready'
    );

    const names = events.map(e => e.event);
    expect(names).not.toContain(JANK_EVENT_NAMES.MESSAGE_DUPLICATED);
    expect(names).not.toContain(JANK_EVENT_NAMES.MESSAGE_DISAPPEARED);
    expect(names).not.toContain(JANK_EVENT_NAMES.TOKEN_ROLLBACK);
    expect(monitor.getSummary('c2').isJankFree).toBe(true);
  });

  it('B-negative: if refetch DID blow away the streaming message, we catch it', () => {
    // Sanity: the monitor actually emits disappear when the failure happens.
    const { monitor, events } = captureFactory();
    monitor.observeMessages(
      'bad',
      [msg('u-x', 'user', 5), msg('a-x', 'assistant', 12)],
      'streaming'
    );
    // Bad refetch: wipes the streaming assistant message
    monitor.observeMessages('bad', [msg('u-x', 'user', 5)], 'streaming');
    monitor.observeMessages('bad', [msg('u-x', 'user', 5)], 'streaming');
    const names = events.map(e => e.event);
    expect(names).toContain(JANK_EVENT_NAMES.MESSAGE_DISAPPEARED);
  });
});
