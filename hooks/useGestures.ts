'use client';

import * as React from 'react';

interface GestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinch?: (scale: number) => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  threshold?: number;
  preventScroll?: boolean;
  enabled?: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export function useGestures(options: GestureOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinch,
    onTap,
    onDoubleTap,
    threshold = 50,
    preventScroll = false,
    enabled = true,
  } = options;

  const touchStart = React.useRef<TouchPoint | null>(null);
  const touchEnd = React.useRef<TouchPoint | null>(null);
  const lastTap = React.useRef<number>(0);
  const initialDistance = React.useRef<number>(0);

  const handleTouchStart = React.useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      if (preventScroll) {
        e.preventDefault();
      }

      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };

      // Handle pinch gesture
      if (e.touches.length === 2 && onPinch) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance.current = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
      }
    },
    [enabled, preventScroll, onPinch]
  );

  const handleTouchMove = React.useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      if (preventScroll) {
        e.preventDefault();
      }

      // Handle pinch gesture
      if (e.touches.length === 2 && onPinch && initialDistance.current > 0) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scale = currentDistance / initialDistance.current;
        onPinch(scale);
      }
    },
    [enabled, preventScroll, onPinch]
  );

  const handleTouchEnd = React.useCallback(
    (e: TouchEvent) => {
      if (!enabled || !touchStart.current) return;

      const touch = e.changedTouches[0];
      touchEnd.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };

      const deltaX = touchEnd.current.x - touchStart.current.x;
      const deltaY = touchEnd.current.y - touchStart.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      const timeDelta =
        touchEnd.current.timestamp - touchStart.current.timestamp;

      // Check for tap gestures (small movement, quick timing)
      if (absDeltaX < 10 && absDeltaY < 10 && timeDelta < 300) {
        const now = Date.now();
        const tapDelay = now - lastTap.current;

        if (tapDelay < 300 && tapDelay > 0 && onDoubleTap) {
          // Double tap
          onDoubleTap();
          lastTap.current = 0; // Reset to prevent triple tap
        } else if (onTap) {
          // Single tap
          onTap();
          lastTap.current = now;
        }
        return;
      }

      // Check for swipe gestures
      if (Math.max(absDeltaX, absDeltaY) > threshold) {
        if (absDeltaX > absDeltaY) {
          // Horizontal swipe
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight();
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft();
          }
        } else {
          // Vertical swipe
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown();
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp();
          }
        }
      }

      // Reset
      touchStart.current = null;
      touchEnd.current = null;
      initialDistance.current = 0;
    },
    [
      enabled,
      threshold,
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      onTap,
      onDoubleTap,
    ]
  );

  const bind = React.useMemo(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    }),
    [handleTouchStart, handleTouchMove, handleTouchEnd]
  );

  return bind;
}

// Hook for detecting mobile devices and touch capabilities
export function useMobile() {
  const [isMobile, setIsMobile] = React.useState(false);
  const [isTouch, setIsTouch] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      setIsMobile(mobile);
      setIsTouch(touch);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return { isMobile, isTouch };
}

// Hook for handling swipe-to-close panels
export function useSwipeToClose(
  onClose: () => void,
  threshold: number = 100,
  enabled: boolean = true
) {
  const gestures = useGestures({
    onSwipeLeft: onClose,
    onSwipeRight: onClose,
    threshold,
    enabled,
  });

  return gestures;
}
