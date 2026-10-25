'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { observeDesktopVisualActivity } from '@/lib/desktop/electron-bridge';

/** Scroll distance (px) from bottom before considering "scrolled away". */
export const SCROLL_THRESHOLD = 200;

const SERVER_STUCK = () => true;

interface StuckStore {
  getSnapshot: () => boolean;
  setStuck: (stuck: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

function createStuckStore(): StuckStore {
  let stuck = true;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => stuck,
    setStuck: next => {
      if (stuck === next) return;
      stuck = next;
      for (const listener of listeners) listener();
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface StickToBottomController {
  /** Manually set stuck state (e.g., when clicking scroll-to-bottom button) */
  setStuckToBottom: (stuck: boolean) => void;
  /** Notifies subscribers without rendering the controller's caller. */
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  /**
   * Legacy scroll handler — stuck detection is driven by IntersectionObserver.
   * Kept as a no-op so existing call sites can keep `onScroll={onScroll}`.
   */
  onScroll: () => void;
  /** Ref to attach to the virtualizer's total-size inner container */
  totalSizeRef: React.RefCallback<HTMLDivElement>;
  /** Ref to attach to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to a 1px sentinel at the bottom of the transcript */
  bottomSentinelRef: React.RefCallback<HTMLDivElement>;
}

interface UseStickToBottomReturn extends StickToBottomController {
  /** Whether the scroll is currently pinned to the bottom */
  isStuckToBottom: boolean;
}

/**
 * Implements sticky-to-bottom scroll behavior for virtualized chat.
 *
 * Uses IntersectionObserver on a bottom sentinel (no sync layout reads on scroll)
 * and a rAF-batched ResizeObserver to follow content growth during streaming.
 * Scroll-to-bottom only fires when the sentinel is already in view; appending
 * a new message while the user is scrolled away does NOT force them back down.
 */
export function useStickToBottomController(
  messageCount?: number
): StickToBottomController {
  const [store] = useState(createStuckStore);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const isStuckRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const visualActiveRef = useRef(true);
  const restoringPinnedRef = useRef(false);

  const setStuckToBottom = useCallback(
    (stuck: boolean) => {
      if (!stuck) restoringPinnedRef.current = false;
      isStuckRef.current = stuck;
      store.setStuck(stuck);
    },
    [store]
  );

  const updateStuckFromIntersection = useCallback(
    (intersecting: boolean) => {
      if (!visualActiveRef.current || restoringPinnedRef.current) return;
      if (isStuckRef.current === intersecting) return;
      isStuckRef.current = intersecting;
      store.setStuck(intersecting);
    },
    [store]
  );

  const scheduleScrollToBottom = useCallback(() => {
    if (!visualActiveRef.current || scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!visualActiveRef.current || !isStuckRef.current) {
        restoringPinnedRef.current = false;
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) {
        restoringPinnedRef.current = false;
        return;
      }

      const clientHeight = container.clientHeight;
      if (clientHeight > 0) {
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - clientHeight;
        // The sentinel observer delivers after the scroll. A resize in that
        // gap used to assign scrollTop and jump the transcript back down,
        // which is a dropped frame on the way through the list.
        if (distanceFromBottom > SCROLL_THRESHOLD) {
          restoringPinnedRef.current = false;
          setStuckToBottom(false);
          return;
        }
      }

      container.scrollTop = container.scrollHeight;
      if (restoringPinnedRef.current) {
        // IO callbacks can deliver hidden samples after this restoration frame.
        // Drain those samples; subsequent user-scroll observations still apply.
        intersectionObserverRef.current?.takeRecords();
      }
      restoringPinnedRef.current = false;
    });
  }, [setStuckToBottom]);

  useEffect(
    () =>
      observeDesktopVisualActivity(active => {
        if (active === visualActiveRef.current) return;
        visualActiveRef.current = active;
        if (!active) {
          restoringPinnedRef.current = false;
          if (scrollRafRef.current !== null) {
            cancelAnimationFrame(scrollRafRef.current);
            scrollRafRef.current = null;
          }
        } else if (isStuckRef.current) {
          // Ignore the pre-restoration offscreen sentinel from hidden growth.
          restoringPinnedRef.current = true;
          scheduleScrollToBottom();
        }
      }),
    [scheduleScrollToBottom]
  );
  // Only re-pin on the initial load (0 → positive), never on per-message appends.
  // Pinning on every messageCount change forced the viewport back to bottom
  // whenever a new row was appended even when the user had scrolled up (JOV-11948).
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    if (messageCount === undefined) return;
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    if (prev === 0 && messageCount > 0) {
      setStuckToBottom(true);
    }
  }, [messageCount, setStuckToBottom]);

  const attachSentinelObserver = useCallback(
    (sentinel: HTMLDivElement | null) => {
      sentinelNodeRef.current = sentinel;

      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect();
        intersectionObserverRef.current = null;
      }

      if (!sentinel) return;

      const root = scrollContainerRef.current;
      if (!root || typeof IntersectionObserver === 'undefined') return;

      const observer = new IntersectionObserver(
        entries => {
          // This observer watches one sentinel; a delayed callback may batch
          // several states, so the last sampled state is authoritative.
          const entry = entries.at(-1);
          if (!entry) return;
          updateStuckFromIntersection(entry.isIntersecting);
        },
        {
          root,
          threshold: 0,
          rootMargin: `0px 0px ${SCROLL_THRESHOLD}px 0px`,
        }
      );

      observer.observe(sentinel);
      intersectionObserverRef.current = observer;
    },
    [updateStuckFromIntersection]
  );

  const bottomSentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      attachSentinelObserver(node);
    },
    [attachSentinelObserver]
  );

  useEffect(() => {
    if (!sentinelNodeRef.current) return;
    attachSentinelObserver(sentinelNodeRef.current);
  }, [attachSentinelObserver]);

  const totalSizeRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (!node || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => {
        scheduleScrollToBottom();
      });

      observer.observe(node);
      resizeObserverRef.current = observer;
    },
    [scheduleScrollToBottom]
  );

  const onScroll = useCallback(() => {
    // Stuck detection is handled by IntersectionObserver — avoid layout reads here.
  }, []);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      intersectionObserverRef.current?.disconnect();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return {
    setStuckToBottom,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    onScroll,
    totalSizeRef,
    scrollContainerRef,
    bottomSentinelRef,
  };
}

export function useStickToBottom(
  messageCount?: number
): UseStickToBottomReturn {
  const controller = useStickToBottomController(messageCount);
  const isStuckToBottom = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    SERVER_STUCK
  );
  return { ...controller, isStuckToBottom };
}
