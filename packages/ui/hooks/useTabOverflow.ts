'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TabOverflowOption<T extends string = string> {
  readonly value: T;
  readonly label: React.ReactNode;
  readonly disabled?: boolean;
}

export interface UseTabOverflowOptions<T extends string> {
  /** All tab options in declaration order */
  readonly options: readonly TabOverflowOption<T>[];
  /** Currently active tab value */
  readonly activeValue: T;
  /** Set to false to disable overflow detection (render all tabs) */
  readonly enabled?: boolean;
  /** Minimum number of tabs that must overflow before collapse kicks in. Default: 2 */
  readonly minOverflowCount?: number;
}

export interface UseTabOverflowResult<T extends string> {
  /** Ref to attach to the container that holds the tabs */
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to the "More" button for width measurement */
  readonly moreButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Callback ref to register individual tab elements for measurement */
  readonly setTabRef: (value: string, el: HTMLElement | null) => void;
  /** Tabs that fit in the visible area */
  readonly visibleOptions: readonly TabOverflowOption<T>[];
  /** Tabs that go into the overflow menu */
  readonly overflowOptions: readonly TabOverflowOption<T>[];
  /** Whether any tabs are overflowing */
  readonly hasOverflow: boolean;
  /** Whether the initial measurement has completed */
  readonly hasMeasured: boolean;
}

/**
 * Hook that detects which tabs fit in a container and which should overflow
 * into a "More" dropdown menu. Uses ResizeObserver for responsive behavior.
 *
 * Tab order is always stable (no swapping). When the active tab is in overflow,
 * the consumer should show an indicator on the "More" button.
 */
export function useTabOverflow<T extends string>({
  options,
  activeValue,
  enabled = true,
  minOverflowCount = 2,
}: UseTabOverflowOptions<T>): UseTabOverflowResult<T> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const rafId = useRef<number>(0);

  const [visibleCount, setVisibleCount] = useState<number>(options.length);
  const [hasMeasured, setHasMeasured] = useState(false);

  const setTabRef = useCallback((value: string, el: HTMLElement | null) => {
    if (el) {
      tabRefsMap.current.set(value, el);
    } else {
      tabRefsMap.current.delete(value);
    }
  }, []);

  const computeOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      setVisibleCount(options.length);
      setHasMeasured(true);
      return;
    }

    const containerWidth = container.clientWidth;

    // Zero-width container (hidden drawer) — don't measure yet
    if (containerWidth === 0) {
      return;
    }

    // Measure More button width (rendered hidden for measurement)
    const moreButtonWidth = moreButtonRef.current
      ? moreButtonRef.current.offsetWidth
      : 36; // fallback

    // Measure each tab using offsetLeft + offsetWidth
    // This automatically accounts for gap, padding, box model
    let lastFittingIndex = options.length - 1;

    for (let i = 0; i < options.length; i++) {
      const tabEl = tabRefsMap.current.get(options[i].value);
      if (!tabEl) continue;

      const tabRight = tabEl.offsetLeft + tabEl.offsetWidth;
      const wouldOverflowCount = options.length - (i + 1);

      if (wouldOverflowCount > 0) {
        // Need to reserve space for the More button + gap
        const gap = 4; // gap-1 = 4px
        if (tabRight + gap + moreButtonWidth > containerWidth) {
          lastFittingIndex = i - 1;
          break;
        }
      } else {
        // Last tab — check if it fits without More button
        if (tabRight > containerWidth) {
          lastFittingIndex = i - 1;
          break;
        }
      }
    }

    const newVisibleCount = Math.max(0, lastFittingIndex + 1);
    const overflowCount = options.length - newVisibleCount;

    // If fewer than minOverflowCount tabs would overflow, show all tabs
    // (fall back to scroll mode in the consumer)
    if (overflowCount > 0 && overflowCount < minOverflowCount) {
      setVisibleCount(options.length);
    } else {
      setVisibleCount(newVisibleCount);
    }

    setHasMeasured(true);
  }, [options, enabled, minOverflowCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      setVisibleCount(options.length);
      setHasMeasured(true);
      return;
    }

    const handleResize = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(computeOverflow);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    // Initial measurement
    handleResize();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId.current);
    };
  }, [computeOverflow, enabled, options]);

  // Recompute when options change (labels might have different widths)
  useEffect(() => {
    if (enabled && hasMeasured) {
      computeOverflow();
    }
  }, [options, enabled, hasMeasured, computeOverflow]);

  const hasOverflow = visibleCount < options.length;
  const visibleOptions = options.slice(0, visibleCount);
  const overflowOptions = options.slice(visibleCount);

  return {
    containerRef,
    moreButtonRef,
    setTabRef,
    visibleOptions,
    overflowOptions,
    hasOverflow,
    hasMeasured,
  };
}
