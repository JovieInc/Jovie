'use client';

import { useEffect, useState } from 'react';

/**
 * Detects if the current device supports touch input.
 * More reliable than just checking for mobile screen size.
 */
export function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          // @ts-expect-error - msMaxTouchPoints is IE/Edge specific
          navigator.msMaxTouchPoints > 0
      );
    };

    checkTouch();

    // Also listen for first touch event as a fallback
    const handleTouch = () => {
      setIsTouchDevice(true);
      globalThis.removeEventListener('touchstart', handleTouch);
    };

    globalThis.addEventListener('touchstart', handleTouch, { passive: true });

    return () => {
      globalThis.removeEventListener('touchstart', handleTouch);
    };
  }, []);

  return isTouchDevice;
}
