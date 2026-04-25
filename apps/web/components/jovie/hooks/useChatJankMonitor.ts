'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  createJankMonitor,
  type JankEventName,
  type JankMonitor,
  type JankPayload,
  type JankSummary,
  type MessageSnapshot,
  type PartSnapshot,
} from '@/lib/chat/jank-monitor';
import { logger } from '@/lib/utils/logger';

/** Client-local id prefixes (anything else is treated as server-assigned). */
const CLIENT_ID_PREFIXES = ['cmd-', 'client-', 'temp-'];

function isServerId(id: string): boolean {
  return !CLIENT_ID_PREFIXES.some(p => id.startsWith(p));
}

/**
 * Convert an AI SDK `UIMessage['parts']` array to our framework-free
 * `PartSnapshot[]`. We collapse tool parts and unknown parts into
 * coarse-grained buckets — we only need enough fidelity to detect rollback
 * and tool-pending state.
 */
function toPartSnapshots(parts: UIMessage['parts']): PartSnapshot[] {
  const out: PartSnapshot[] = [];
  for (const p of parts) {
    const type = (p as { type?: string }).type;
    if (type === 'text') {
      const text = (p as { text?: string }).text ?? '';
      out.push({ kind: 'text', textLength: text.length });
    } else if (type === 'reasoning') {
      const text = (p as { text?: string }).text ?? '';
      out.push({ kind: 'reasoning', textLength: text.length });
    } else if (type === 'step-start') {
      out.push({ kind: 'step-start' });
    } else if (
      typeof type === 'string' &&
      (type.startsWith('tool-') || type === 'dynamic-tool')
    ) {
      const state = (p as { state?: string }).state;
      out.push({ kind: 'tool', toolState: state });
    } else {
      out.push({ kind: 'other' });
    }
  }
  return out;
}

function toMessageSnapshots(messages: readonly UIMessage[]): MessageSnapshot[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role as MessageSnapshot['role'],
    isServerAssigned: isServerId(m.id),
    parts: toPartSnapshots(m.parts),
  }));
}

function hasActivePendingTool(messages: readonly UIMessage[]): boolean {
  for (const m of messages) {
    for (const p of m.parts) {
      const type = (p as { type?: string }).type;
      if (
        typeof type === 'string' &&
        (type.startsWith('tool-') || type === 'dynamic-tool')
      ) {
        const state = (p as { state?: string }).state;
        if (
          state === 'input-streaming' ||
          state === 'input-available' ||
          state === 'approval-requested' ||
          state === 'approval-responded'
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export type UseChatJankMonitorOptions = {
  conversationId: string | null;
  messages: readonly UIMessage[];
  status: string;
  isStuckToBottom: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  /** Override the default emit (track + logger) for tests. */
  emit?: (event: JankEventName, payload: JankPayload) => void;
};

export type UseChatJankMonitorReturn = {
  /** Call from the chat submit handler so feedback latency can be timed. */
  onSend: () => void;
  /** Exposed for tests and future dashboard wiring. */
  getSummary: () => JankSummary;
};

const STALL_TICK_INTERVAL_MS = 500;

export function useChatJankMonitor({
  conversationId,
  messages,
  status,
  isStuckToBottom,
  scrollContainerRef,
  enabled = true,
  emit,
}: UseChatJankMonitorOptions): UseChatJankMonitorReturn {
  const lastUserInputAtRef = useRef<number>(0);
  const prevStuckRef = useRef<boolean>(true);

  const defaultEmit = useCallback<
    (event: JankEventName, payload: JankPayload) => void
  >((event, payload) => {
    try {
      track(event, payload as Record<string, unknown>);
    } catch {
      // analytics sink failure must not affect chat
    }
    logger.info(event, payload, 'chat-jank');
  }, []);

  const emitFn = emit ?? defaultEmit;

  // Lazy-init the monitor via useState (one instance per mount). When emitFn
  // changes (test-only), recreate the monitor in an effect to avoid touching
  // refs during render.
  const [monitor, setMonitor] = useState<JankMonitor>(() =>
    createJankMonitor({ emit: emitFn })
  );
  const initialEmitRef = useRef(emitFn);
  useEffect(() => {
    if (emitFn === initialEmitRef.current) return;
    setMonitor(createJankMonitor({ emit: emitFn }));
  }, [emitFn]);

  const snapshots = useMemo(() => toMessageSnapshots(messages), [messages]);
  const pendingTool = useMemo(() => hasActivePendingTool(messages), [messages]);

  // ── Observe messages ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    monitor.observeMessages(conversationId, snapshots, status);
  }, [enabled, conversationId, snapshots, status, monitor]);

  // ── Stream stall polling ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (status !== 'streaming') return;
    const interval = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      monitor.tickStall(conversationId, {
        status,
        hasActivePendingTool: pendingTool,
      });
    }, STALL_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, status, conversationId, pendingTool, monitor]);

  // ── Scroll container input listeners ─────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const markUserInput = () => {
      lastUserInputAtRef.current = Date.now();
    };

    container.addEventListener('wheel', markUserInput, { passive: true });
    container.addEventListener('touchmove', markUserInput, { passive: true });
    container.addEventListener('keydown', markUserInput);
    // Capture keyboard scroll from window (PgUp/PgDn when chat is focused)
    globalThis.window?.addEventListener('keydown', markUserInput);

    return () => {
      container.removeEventListener('wheel', markUserInput);
      container.removeEventListener('touchmove', markUserInput);
      container.removeEventListener('keydown', markUserInput);
      globalThis.window?.removeEventListener('keydown', markUserInput);
    };
  }, [enabled, scrollContainerRef]);

  // ── isStuckToBottom transitions ──────────────────────────────
  useEffect(() => {
    if (!enabled) {
      prevStuckRef.current = isStuckToBottom;
      return;
    }
    const wasStuck = prevStuckRef.current;
    prevStuckRef.current = isStuckToBottom;
    // Only care about true → false (anchor broke).
    if (wasStuck && !isStuckToBottom) {
      const sinceInput = Date.now() - lastUserInputAtRef.current;
      monitor.onScrollAnchorBroken(conversationId, {
        withinUserInputMs: sinceInput,
      });
    } else if (!wasStuck && isStuckToBottom) {
      monitor.onScrollAnchorRestored(conversationId);
    }
  }, [enabled, isStuckToBottom, conversationId, monitor]);

  const onSend = useCallback(() => {
    if (!enabled) return;
    monitor.onSend(conversationId, messages.length);
  }, [enabled, conversationId, messages.length, monitor]);

  const getSummary = useCallback<() => JankSummary>(
    () => monitor.getSummary(conversationId),
    [conversationId, monitor]
  );

  return { onSend, getSummary };
}
