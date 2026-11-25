'use client';

import { useEffect, useState } from 'react';
import { SHELL_RAIL_MOTION_MS } from '@/components/shell/rail-motion';

/** A shell rail mid-flight, as published by `useRailMotionPhase`. */
const RAIL_MOVING_SELECTOR =
  '[data-rail-phase="opening"], [data-rail-phase="closing"]';

/** How often a held measurement re-checks whether the rail has settled. */
const RAIL_SETTLE_POLL_MS = 48;

/** A phase that never settles must not hold a measurement forever. */
const RAIL_MAX_SETTLE_POLLS = Math.ceil(
  (SHELL_RAIL_MOTION_MS + 180) / RAIL_SETTLE_POLL_MS
);

function isShellRailMoving(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector(RAIL_MOVING_SELECTOR) !== null
  );
}

/**
 * Container width via one ResizeObserver. Non-positive measurements are
 * ignored so the first paint can stay on the wide column set until layout
 * has actually been measured.
 *
 * While a shell rail is opening or closing, the container is resized on
 * every animation frame. Those intermediate widths are held and only the
 * settled width is committed, so a rail toggle costs one render of the
 * consumer instead of one per frame. Outside rail motion every measurement
 * commits immediately, exactly as before.
 */
export function useContainerWidth(
  node: HTMLElement | null,
  initialWidth: number
): number {
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    if (!node) return;

    let held: number | null = null;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const commit = (measured: number) => {
      if (!Number.isFinite(measured) || measured <= 0) return;
      setWidth(current => (current === measured ? current : measured));
    };

    const releaseWhenSettled = () => {
      timer = null;
      if (held === null) return;
      polls += 1;
      if (polls < RAIL_MAX_SETTLE_POLLS && isShellRailMoving()) {
        timer = setTimeout(releaseWhenSettled, RAIL_SETTLE_POLL_MS);
        return;
      }
      const settled = held;
      held = null;
      commit(settled);
    };

    const observe = (measured: number) => {
      if (held !== null) {
        // Already holding for a moving rail: keep only the latest width.
        held = measured;
        return;
      }
      if (!isShellRailMoving()) {
        commit(measured);
        return;
      }
      held = measured;
      polls = 0;
      timer = setTimeout(releaseWhenSettled, RAIL_SETTLE_POLL_MS);
    };

    const cancelHold = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      held = null;
    };

    commit(node.getBoundingClientRect().width);

    if (typeof ResizeObserver !== 'function') {
      const onResize = () => observe(node.getBoundingClientRect().width);
      globalThis.addEventListener('resize', onResize);
      return () => {
        globalThis.removeEventListener('resize', onResize);
        cancelHold();
      };
    }

    const observer = new ResizeObserver(entries => {
      observe(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelHold();
    };
  }, [node]);

  return width;
}
