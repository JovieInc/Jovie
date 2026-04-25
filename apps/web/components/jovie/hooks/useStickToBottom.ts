'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Scroll distance (px) from bottom before considering "scrolled away". */
const SCROLL_THRESHOLD = 200;

interface UseStickToBottomOptions {
  /** Number of messages — resets sticky state when this changes */
  messageCount: number;
}

interface UseStickToBottomReturn {
  /** Whether the scroll is currently pinned to the bottom */
  isStuckToBottom: boolean;
  /** Manually set stuck state (e.g., when clicking scroll-to-bottom button) */
  setStuckToBottom: (stuck: boolean) => void;
  /** Scroll event handler — attach to the scroll container */
  onScroll: () => void;
  /** Ref to attach to the virtualizer's total-size inner container */
  totalSizeRef: React.RefCallback<HTMLDivElement>;
  /** Ref to attach to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Implements sticky-to-bottom scroll behavior for virtualized chat.
 *
 * Uses ResizeObserver on the total-size container to detect content growth
 * during streaming (where message count doesn't change but content grows).
 *
 * Rules:
 * - Stuck by default and on new messages
 * - Released when user scrolls up past threshold
 * - Re-attached when user scrolls back to bottom
 * - Resize-driven scroll uses `behavior: 'auto'` (instant, no lag)
 * - Manual scroll-to-bottom button should use virtualizer.scrollToIndex + setStuckToBottom(true)
 */
export function useStickToBottom({
  messageCount,
}: UseStickToBottomOptions): UseStickToBottomReturn {
  const [isStuckToBottom, setIsStuckToBottom] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const isStuckRef = useRef(true);
  const previousHeightRef = useRef(0);

  // Reset stuck state when message count changes (new message sent/received)
  useEffect(() => {
    if (messageCount > 0) {
      setIsStuckToBottom(true);
      isStuckRef.current = true;
    }
  }, [messageCount]);

  // Scroll handler — detect user scrolling up
  const onScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    if (distanceFromBottom > SCROLL_THRESHOLD) {
      if (isStuckRef.current) {
        setIsStuckToBottom(false);
        isStuckRef.current = false;
      }
    } else if (distanceFromBottom <= 2) {
      // User scrolled back to bottom
      if (!isStuckRef.current) {
        setIsStuckToBottom(true);
        isStuckRef.current = true;
      }
    }
  }, []);

  // Manual set (for scroll-to-bottom button)
  const setStuckToBottom = useCallback((stuck: boolean) => {
    setIsStuckToBottom(stuck);
    isStuckRef.current = stuck;
  }, []);

  // ResizeObserver callback — scroll to bottom when stuck and content grows
  const totalSizeRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;
    if (typeof ResizeObserver === 'undefined') return;

    previousHeightRef.current = node.getBoundingClientRect().height;

    const observer = new ResizeObserver(entries => {
      if (!isStuckRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const nextHeight = entries[0]?.contentRect.height ?? 0;
      const previousHeight = previousHeightRef.current;
      previousHeightRef.current = nextHeight;

      if (nextHeight <= previousHeight) {
        return;
      }

      // Use instant scroll to avoid lag during streaming
      container.scrollTop = container.scrollHeight;
    });

    observer.observe(node);
    observerRef.current = observer;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return {
    isStuckToBottom,
    setStuckToBottom,
    onScroll,
    totalSizeRef,
    scrollContainerRef,
  };
}
