import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatJankMonitor } from '@/components/jovie/hooks/useChatJankMonitor';
import {
  JANK_EVENT_NAMES,
  type JankEventName,
  type JankPayload,
} from '@/lib/chat/jank-monitor';

function makeMessage(
  id: string,
  role: UIMessage['role'],
  text: string
): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;
}

function makeRef(
  el: HTMLDivElement | null = null
): React.RefObject<HTMLDivElement | null> {
  return { current: el };
}

type HookProps = Parameters<typeof useChatJankMonitor>[0];

describe('useChatJankMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('emits no_visible_feedback_after_send when no bubble appears within 150ms', () => {
    const emit = vi.fn<(e: JankEventName, p: JankPayload) => void>();
    const scrollRef = makeRef();
    const initial: HookProps = {
      conversationId: 'c1',
      messages: [makeMessage('existing', 'assistant', 'prior')] as UIMessage[],
      status: 'ready',
      isStuckToBottom: true,
      scrollContainerRef: scrollRef,
      enabled: true,
      emit,
    };

    const { result, rerender } = renderHook(
      (p: HookProps) => useChatJankMonitor(p),
      { initialProps: initial }
    );

    act(() => {
      result.current.onSend();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Any rerender triggers observeMessages, which checks the feedback timer.
    // Pass a fresh array to force the useMemo / useEffect to refire.
    rerender({
      ...initial,
      messages: [makeMessage('existing', 'assistant', 'prior')],
    });

    const names = emit.mock.calls.map(c => c[0] as JankEventName);
    expect(names).toContain(JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND);
  });

  it('does not emit feedback warning when user bubble appears quickly', () => {
    const emit = vi.fn();
    const scrollRef = makeRef();

    const initial: HookProps = {
      conversationId: 'c1',
      messages: [] as UIMessage[],
      status: 'ready',
      isStuckToBottom: true,
      scrollContainerRef: scrollRef,
      enabled: true,
      emit,
    };

    const { result, rerender } = renderHook(
      (p: HookProps) => useChatJankMonitor(p),
      { initialProps: initial }
    );

    act(() => {
      result.current.onSend();
    });

    // User bubble arrives within the window
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({
      ...initial,
      messages: [makeMessage('u1', 'user', 'hi')],
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({
      ...initial,
      messages: [makeMessage('u1', 'user', 'hi')],
    });

    const names = emit.mock.calls.map(c => c[0] as JankEventName);
    expect(names).not.toContain(
      JANK_EVENT_NAMES.NO_VISIBLE_FEEDBACK_AFTER_SEND
    );
  });

  it('observes message changes and emits duplicate events via the hook', () => {
    const emit = vi.fn();
    const scrollRef = makeRef();
    const initial: HookProps = {
      conversationId: 'c1',
      messages: [] as UIMessage[],
      status: 'ready',
      isStuckToBottom: true,
      scrollContainerRef: scrollRef,
      enabled: true,
      emit,
    };

    const { rerender } = renderHook((p: HookProps) => useChatJankMonitor(p), {
      initialProps: initial,
    });

    // Snapshot contains the same id twice → duplicate event.
    rerender({
      ...initial,
      messages: [
        makeMessage('dup', 'assistant', 'hi'),
        makeMessage('dup', 'assistant', 'hi'),
      ],
    });

    const names = emit.mock.calls.map(c => c[0] as JankEventName);
    expect(names).toContain(JANK_EVENT_NAMES.MESSAGE_DUPLICATED);
  });

  it('does not run any observation when enabled=false', () => {
    const emit = vi.fn();
    const scrollRef = makeRef();
    const initial: HookProps = {
      conversationId: 'c1',
      messages: [
        makeMessage('dup', 'assistant', 'hi'),
        makeMessage('dup', 'assistant', 'hi'),
      ],
      status: 'ready',
      isStuckToBottom: true,
      scrollContainerRef: scrollRef,
      enabled: false,
      emit,
    };

    renderHook((p: HookProps) => useChatJankMonitor(p), {
      initialProps: initial,
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('cleans up the stall interval on unmount', () => {
    const emit = vi.fn();
    const scrollRef = makeRef();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook((p: HookProps) => useChatJankMonitor(p), {
      initialProps: {
        conversationId: 'c1',
        messages: [makeMessage('a', 'assistant', 'hi')],
        status: 'streaming',
        isStuckToBottom: true,
        scrollContainerRef: scrollRef,
        enabled: true,
        emit,
      },
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
