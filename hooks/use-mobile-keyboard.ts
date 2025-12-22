'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Detects when the mobile virtual keyboard is visible.
 * Uses visualViewport API for accurate detection on iOS/Android.
 */
export function useMobileKeyboard() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    // Store initial viewport height to detect keyboard
    const initialHeight = viewport.height;

    const handleResize = () => {
      // Keyboard is visible when viewport height shrinks significantly (> 100px)
      const heightDiff = initialHeight - viewport.height;
      const keyboardOpen = heightDiff > 100;

      setIsKeyboardVisible(keyboardOpen);
      setKeyboardHeight(keyboardOpen ? heightDiff : 0);
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}

/**
 * Scrolls an element into view when focused, accounting for mobile keyboard.
 * Should be called on input focus events.
 */
export function useScrollIntoViewOnFocus() {
  const scrollIntoView = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    // Small delay to let keyboard appear
    setTimeout(() => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }, 300);
  }, []);

  return scrollIntoView;
}
