'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  startTime: number;
  directionLocked: boolean;
  isVertical: boolean;
}

interface UseSwipeModeOptions {
  readonly count: number;
  readonly initialIndex?: number;
  readonly velocityThreshold?: number;
  readonly distanceThreshold?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useSwipeMode({
  count,
  initialIndex = 0,
  velocityThreshold = 0.3,
  distanceThreshold = 0.18,
}: UseSwipeModeOptions) {
  const [activeIndex, setActiveIndexState] = useState(() =>
    clamp(initialIndex, 0, Math.max(count - 1, 0))
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<SwipeState | null>(null);
  const activeIndexRef = useRef(activeIndex);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const setActiveIndex = useCallback(
    (nextIndex: number) => {
      setActiveIndexState(clamp(nextIndex, 0, Math.max(count - 1, 0)));
      setDragOffset(0);
      setIsDragging(false);
    },
    [count]
  );

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;

    swipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      startTime: Date.now(),
      directionLocked: false,
      isVertical: false,
    };
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const state = swipeRef.current;
      if (!state) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;

      if (!state.directionLocked) {
        if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
          return;
        }

        state.directionLocked = true;
        state.isVertical = Math.abs(deltaY) > Math.abs(deltaX);

        if (state.isVertical) {
          setIsDragging(false);
          return;
        }
      }

      if (state.isVertical) {
        return;
      }

      state.currentX = touch.clientX;

      const atStart = activeIndexRef.current === 0 && deltaX > 0;
      const atEnd = activeIndexRef.current === count - 1 && deltaX < 0;
      const resistance = atStart || atEnd ? 0.35 : 1;

      setDragOffset(deltaX * resistance);
    },
    [count]
  );

  const handleTouchEnd = useCallback(() => {
    const state = swipeRef.current;
    swipeRef.current = null;

    if (!state || state.isVertical) {
      setDragOffset(0);
      setIsDragging(false);
      return;
    }

    const containerWidth = containerRef.current?.offsetWidth ?? 1;
    const deltaX = state.currentX - state.startX;
    const elapsed = Date.now() - state.startTime;
    const velocity = Math.abs(deltaX) / Math.max(elapsed, 1);
    const distanceRatio = Math.abs(deltaX) / containerWidth;

    let nextIndex = activeIndexRef.current;

    if (velocity > velocityThreshold || distanceRatio > distanceThreshold) {
      if (deltaX < 0) {
        nextIndex += 1;
      } else if (deltaX > 0) {
        nextIndex -= 1;
      }
    }

    setActiveIndex(nextIndex);
  }, [distanceThreshold, setActiveIndex, velocityThreshold]);

  return {
    activeIndex,
    containerRef,
    dragOffset,
    isDragging,
    setActiveIndex,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
