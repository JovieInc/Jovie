'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Scroll distance (px) from bottom before considering "scrolled away". */
export const SCROLL_THRESHOLD = 200;

interface UseStickToBottomReturn {
  /** Whether the scroll is currently pinned to the bottom */
  isStuckToBottom: boolean;
  /** Manually set stuck state (e.g., when clicking scroll-to-bottom button) */
  setStuckToBottom: (stuck: boolean) => void;
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

/**
 * Implements sticky-to-bottom scroll behavior for virtualized chat.
 *
 * Uses IntersectionObserver on a bottom sentinel (no sync layout reads on scroll)
 * and a rAF-batched ResizeObserver to follow content growth during streaming.
 * Scroll-to-bottom only fires when the sentinel is already in view; appending
 * a new message while the user is scrolled away does NOT force them back down.
 */
export function useStickToBottom(
  messageCount?: number
): UseStickToBottomReturn {
  const [isStuckToBottom, setIsStuckToBottom] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const isStuckRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);

  const setStuckToBottom = useCallback((stuck: boolean) => {
    setIsStuckToBottom(stuck);
    isStuckRef.current = stuck;
  }, []);

  const updateStuckFromIntersection = useCallback((intersecting: boolean) => {
    if (isStuckRef.current === intersecting) return;
    isStuckRef.current = intersecting;
    setIsStuckToBottom(intersecting);
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!isStuckRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      container.scrollTop = container.scrollHeight;
    });
  }, []);
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
          const entry = entries[0];
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
    isStuckToBottom,
    setStuckToBottom,
    onScroll,
    totalSizeRef,
    scrollContainerRef,
    bottomSentinelRef,
  };
}
