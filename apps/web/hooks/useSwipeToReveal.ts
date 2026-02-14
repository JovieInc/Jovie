'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  /** Whether we've determined this is a horizontal swipe (not vertical scroll) */
  directionLocked: boolean;
  /** Whether the gesture was determined to be vertical (scroll) */
  isVertical: boolean;
  startTime: number;
}

export interface UseSwipeToRevealOptions {
  /** Width of the actions area to reveal (in px). Default: 80 */
  actionsWidth?: number;
  /** Whether swipe is enabled. Default: true */
  enabled?: boolean;
  /** Callback when the item is swiped open */
  onOpen?: () => void;
  /** Callback when the item is swiped closed */
  onClose?: () => void;
  /** Minimum velocity to snap open/close regardless of distance (px/ms). Default: 0.3 */
  velocityThreshold?: number;
  /** Distance threshold as fraction of actionsWidth to snap open. Default: 0.4 */
  snapThreshold?: number;
  /** Resistance factor when over-swiping past actionsWidth. Default: 0.3 */
  overSwipeResistance?: number;
}

export interface UseSwipeToRevealReturn {
  /** Whether the actions are currently revealed */
  isOpen: boolean;
  /** Programmatically close the revealed actions */
  close: () => void;
  /** Programmatically open the revealed actions */
  open: () => void;
  /** The current translateX offset */
  offsetX: number;
  /** Whether the content is currently being dragged */
  isDragging: boolean;
  /** Touch event handlers to spread onto the swipeable element */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  /** Style to apply to the sliding content */
  style: React.CSSProperties;
}

/**
 * Hook for iOS-style swipe-to-reveal actions on list items.
 *
 * Handles horizontal swipe gestures with:
 * - Direction locking (won't interfere with vertical scroll)
 * - Velocity-based snap decisions
 * - Rubber-band resistance on over-swipe
 * - Smooth spring-like transitions
 */
export function useSwipeToReveal({
  actionsWidth = 80,
  enabled = true,
  onOpen,
  onClose,
  velocityThreshold = 0.3,
  snapThreshold = 0.4,
  overSwipeResistance = 0.3,
}: UseSwipeToRevealOptions = {}): UseSwipeToRevealReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const swipeRef = useRef<SwipeState | null>(null);
  const isOpenRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const animateTo = useCallback(
    (target: number, shouldOpen: boolean) => {
      setOffsetX(target);
      setIsDragging(false);

      if (shouldOpen !== isOpenRef.current) {
        setIsOpen(shouldOpen);
        if (shouldOpen) {
          onOpen?.();
        } else {
          onClose?.();
        }
      }
    },
    [onOpen, onClose]
  );

  const close = useCallback(() => {
    animateTo(0, false);
  }, [animateTo]);

  const open = useCallback(() => {
    animateTo(-actionsWidth, true);
  }, [animateTo, actionsWidth]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      if (!touch) return;

      swipeRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        directionLocked: false,
        isVertical: false,
        startTime: Date.now(),
      };

      setIsDragging(true);
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const state = swipeRef.current;
      if (!state || !enabled) return;

      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      // Determine direction on first significant movement
      if (!state.directionLocked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Need at least 5px of movement to determine direction
        if (absDx < 5 && absDy < 5) return;

        if (absDy > absDx) {
          // Vertical scroll - bail out
          state.isVertical = true;
          state.directionLocked = true;
          setIsDragging(false);
          return;
        }

        state.directionLocked = true;
      }

      if (state.isVertical) return;

      state.currentX = touch.clientX;

      // Calculate the target offset
      const baseOffset = isOpenRef.current ? -actionsWidth : 0;
      let newOffset = baseOffset + dx;

      // Clamp: don't allow swiping to the right past 0
      if (newOffset > 0) {
        newOffset = newOffset * overSwipeResistance;
      }

      // Apply rubber-band resistance past the full actions width
      if (newOffset < -actionsWidth) {
        const overshoot = newOffset + actionsWidth;
        newOffset = -actionsWidth + overshoot * overSwipeResistance;
      }

      setOffsetX(newOffset);
    },
    [enabled, actionsWidth, overSwipeResistance]
  );

  const handleTouchEnd = useCallback(() => {
    const state = swipeRef.current;
    if (!state || state.isVertical || !state.directionLocked) {
      setIsDragging(false);
      swipeRef.current = null;
      return;
    }

    const dx = state.currentX - state.startX;
    const elapsed = Date.now() - state.startTime;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    // Decide whether to snap open or closed
    const currentOffset = isOpenRef.current ? -actionsWidth + dx : dx;
    const distancePastThreshold = Math.abs(currentOffset) / actionsWidth;

    let shouldOpen: boolean;

    if (velocity > velocityThreshold) {
      // Fast swipe: direction determines outcome
      shouldOpen = dx < 0;
    } else {
      // Slow swipe: distance determines outcome
      shouldOpen = distancePastThreshold > snapThreshold && currentOffset < 0;
    }

    animateTo(shouldOpen ? -actionsWidth : 0, shouldOpen);
    swipeRef.current = null;
  }, [actionsWidth, velocityThreshold, snapThreshold, animateTo]);

  const style: React.CSSProperties = {
    transform: `translateX(${offsetX}px)`,
    transition: isDragging
      ? 'none'
      : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
    willChange: isDragging ? 'transform' : undefined,
  };

  return {
    isOpen,
    close,
    open,
    offsetX,
    isDragging,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    style,
  };
}
