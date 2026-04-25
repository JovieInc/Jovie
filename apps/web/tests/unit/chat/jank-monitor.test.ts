import { describe, expect, it, vi } from 'vitest';

import {
  createJankMonitor,
  JANK_EVENT_NAMES,
  type JankEventName,
  type JankPayload,
  type MessageSnapshot,
} from '@/lib/chat/jank-monitor';

type Captured = { event: JankEventName; payload: JankPayload };

function harness(opts?: { nowStart?: number }) {
  const events: Captured[] = [];
  let clock = opts?.nowStart ?? 1_000;
  const now = () => clock;
  const advance = (ms: number) => {
    clock += ms;
  };
  const monitor = createJankMonitor({
    emit: (event, payload) => events.push({ event, payload }),
    now,
  });
  return { monitor, events, advance };
}

function msg(
  id: string,
  role: MessageSnapshot['role'] = 'assistant',
  parts: MessageSnapshot['parts'] = []
): MessageSnapshot {
  return {
    id,
    role,
    isServerAssigned: !id.startsWith('cmd-') && !id.startsWith('client-'),
    parts,
  };
}

function textPart(textLength: number) {
  return { kind: 'text' as const, textLength };
}

function toolPart(toolState: string) {
  return { kind: 'tool' as const, toolState };
}

function eventNames(captured: Captured[]): JankEventName[] {
  return captured.map(e => e.event);
}

describe('jank-monitor', () => {
  describe('disappear / reappear', () => {
    it('emits message_disappeared only after two consecutive missing snapshots (StrictMode defense)', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('b'), msg('c')]);
      // b missing for first time: should NOT emit disappear yet
      monitor.observeMessages('c1', [msg('a'), msg('c')]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.MESSAGE_DISAPPEARED
      );
      advance(10);
      // b still missing — now emit
      monitor.observeMessages('c1', [msg('a'), msg('c')]);
      expect(eventNames(events)).toContain(
        JANK_EVENT_NAMES.MESSAGE_DISAPPEARED
      );
    });

    it('emits message_reappeared when a disappeared id returns within the window', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('b')]);
      monitor.observeMessages('c1', [msg('a')]);
      advance(5);
      monitor.observeMessages('c1', [msg('a')]); // confirms disappear
      advance(10);
      monitor.observeMessages('c1', [msg('a'), msg('b')]);
      expect(eventNames(events)).toContain(JANK_EVENT_NAMES.MESSAGE_REAPPEARED);
    });

    it('does not emit reappear once the reappear window has elapsed', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('b')]);
      monitor.observeMessages('c1', [msg('a')]);
      monitor.observeMessages('c1', [msg('a')]); // disappear confirmed
      advance(6_000); // beyond default 5s window
      monitor.observeMessages('c1', [msg('a'), msg('b')]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.MESSAGE_REAPPEARED
      );
    });

    it('ignores the thinking-placeholder id', () => {
      const { monitor, events } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('thinking-placeholder')]);
      monitor.observeMessages('c1', [msg('a')]);
      monitor.observeMessages('c1', [msg('a')]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.MESSAGE_DISAPPEARED
      );
    });
  });

  describe('duplicates', () => {
    it('emits message_duplicated when the same id appears twice in a snapshot', () => {
      const { monitor, events } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('a')]);
      expect(eventNames(events)).toContain(JANK_EVENT_NAMES.MESSAGE_DUPLICATED);
    });
  });

  describe('reorder', () => {
    it('emits message_reordered when A,B,C becomes A,C,B', () => {
      const { monitor, events } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('b'), msg('c')]);
      monitor.observeMessages('c1', [msg('a'), msg('c'), msg('b')]);
      expect(eventNames(events)).toContain(JANK_EVENT_NAMES.MESSAGE_REORDERED);
    });

    it('does NOT emit reorder when a new message is merely appended', () => {
      const { monitor, events } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('b')]);
      monitor.observeMessages('c1', [msg('a'), msg('b'), msg('c')]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.MESSAGE_REORDERED
      );
    });
  });

  describe('token rollback', () => {
    it('emits token_rollback when a text part shrinks during streaming', () => {
      const { monitor, events } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(5)])],
        'streaming'
      );
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(9)])],
        'streaming'
      );
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(5)])],
        'streaming'
      );
      expect(eventNames(events)).toContain(JANK_EVENT_NAMES.TOKEN_ROLLBACK);
    });

    it('does NOT emit token_rollback when a new part appears after a text part', () => {
      const { monitor, events } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(10)])],
        'streaming'
      );
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(10), { kind: 'step-start' }])],
        'streaming'
      );
      expect(eventNames(events)).not.toContain(JANK_EVENT_NAMES.TOKEN_ROLLBACK);
    });

    it('does NOT emit token_rollback when status is ready (legitimate completion)', () => {
      const { monitor, events } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(10)])],
        'streaming'
      );
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(5)])],
        'ready'
      );
      expect(eventNames(events)).not.toContain(JANK_EVENT_NAMES.TOKEN_ROLLBACK);
    });
  });

  describe('stream stall', () => {
    it('emits stream_stall after 2s without progress and no active tool', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(3)])],
        'streaming'
      );
      advance(2_500);
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: false,
      });
      expect(eventNames(events)).toContain(JANK_EVENT_NAMES.STREAM_STALL);
    });

    it('does NOT emit stream_stall while a tool part is pending', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [toolPart('input-streaming')])],
        'streaming'
      );
      advance(5_000);
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: true,
      });
      expect(eventNames(events)).not.toContain(JANK_EVENT_NAMES.STREAM_STALL);
    });

    it('does NOT double-emit stall within the same stream', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(1)])],
        'streaming'
      );
      advance(3_000);
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: false,
      });
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: false,
      });
      const stallCount = events.filter(
        e => e.event === JANK_EVENT_NAMES.STREAM_STALL
      ).length;
      expect(stallCount).toBe(1);
    });

    it('resets stall gating on progress tick', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(1)])],
        'streaming'
      );
      advance(3_000);
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: false,
      });
      // More progress — should reset and re-arm
      advance(10);
      monitor.observeMessages(
        'c1',
        [msg('a', 'assistant', [textPart(5)])],
        'streaming'
      );
      advance(3_000);
      monitor.tickStall('c1', {
        status: 'streaming',
        hasActivePendingTool: false,
      });
      const stallCount = events.filter(
        e => e.event === JANK_EVENT_NAMES.STREAM_STALL
      ).length;
      expect(stallCount).toBe(2);
    });
  });

  describe('no visible feedback after send', () => {
    it('emits no_visible_feedback_after_send when no new user bubble appears within 150ms', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a', 'user')]);
      monitor.onSend('c1', 1);
      advance(200);
      monitor.observeMessages('c1', [msg('a', 'user')]); // no change
      expect(eventNames(events)).toContain(
        JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND
      );
    });

    it('does NOT emit when user bubble appears quickly', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a', 'user')]);
      monitor.onSend('c1', 1);
      advance(50);
      monitor.observeMessages('c1', [
        msg('a', 'user'),
        msg('new-user', 'user'),
      ]);
      advance(200);
      monitor.observeMessages('c1', [
        msg('a', 'user'),
        msg('new-user', 'user'),
      ]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND
      );
    });

    it('does NOT emit when the thinking placeholder appears within the window', () => {
      const { monitor, events, advance } = harness();
      monitor.observeMessages('c1', [msg('a', 'user')]);
      monitor.onSend('c1', 1);
      advance(50);
      // The snapshot includes the placeholder id, which observeMessages
      // will filter out for continuity tracking but still counts as feedback.
      monitor.observeMessages('c1', [
        msg('a', 'user'),
        msg('thinking-placeholder', 'assistant'),
      ]);
      advance(200);
      monitor.observeMessages('c1', [
        msg('a', 'user'),
        msg('thinking-placeholder', 'assistant'),
      ]);
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND
      );
    });
  });

  describe('unexpected scroll jump', () => {
    it('emits unexpected_scroll_jump when anchor broke without a recent user input', () => {
      const { monitor, events } = harness();
      monitor.onScrollAnchorBroken('c1', { withinUserInputMs: 500 });
      expect(eventNames(events)).toContain(
        JANK_EVENT_NAMES.UNEXPECTED_SCROLL_JUMP
      );
    });

    it('does NOT emit when anchor broke within the user-input grace window', () => {
      const { monitor, events } = harness();
      monitor.onScrollAnchorBroken('c1', { withinUserInputMs: 50 });
      expect(eventNames(events)).not.toContain(
        JANK_EVENT_NAMES.UNEXPECTED_SCROLL_JUMP
      );
    });
  });

  describe('getSummary', () => {
    it('aggregates counts per conversation', () => {
      const { monitor, advance } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('a')]); // duplicate
      monitor.observeMessages('c1', [msg('a'), msg('b'), msg('c')]);
      monitor.observeMessages('c1', [msg('a'), msg('c'), msg('b')]); // reorder
      advance(10);
      const summary = monitor.getSummary('c1');
      expect(summary.duplicateCount).toBe(1);
      expect(summary.reorderCount).toBe(1);
      expect(summary.jankEventCount).toBeGreaterThanOrEqual(2);
      expect(summary.isJankFree).toBe(false);
    });

    it('returns isJankFree=true when no events have been emitted', () => {
      const { monitor } = harness();
      monitor.observeMessages('c2', [msg('a'), msg('b')]);
      monitor.observeMessages('c2', [msg('a'), msg('b'), msg('c')]);
      const summary = monitor.getSummary('c2');
      expect(summary.jankEventCount).toBe(0);
      expect(summary.isJankFree).toBe(true);
    });
  });

  describe('emit contract', () => {
    it('emits with conversationId, timestamp, and streamRevision in the payload', () => {
      const emit = vi.fn();
      const monitor = createJankMonitor({ emit, now: () => 42 });
      monitor.observeMessages('c1', [msg('a'), msg('a')]);
      expect(emit).toHaveBeenCalled();
      const [, payload] = emit.mock.calls[0];
      expect(payload.conversationId).toBe('c1');
      expect(payload.timestamp).toBe(42);
      expect(typeof payload.streamRevision).toBe('number');
    });
  });

  describe('reset', () => {
    it('reset(id) clears state for one conversation without affecting others', () => {
      const { monitor, events } = harness();
      monitor.observeMessages('c1', [msg('a'), msg('a')]);
      monitor.observeMessages('c2', [msg('x'), msg('y')]);
      monitor.reset('c1');
      expect(monitor.getSummary('c1').jankEventCount).toBe(0);
      expect(monitor.getSummary('c2').jankEventCount).toBe(0);
      // events array still reflects what was emitted before reset
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
