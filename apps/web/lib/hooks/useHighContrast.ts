'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'jovie-high-contrast';

function getInitialState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Hook for managing high contrast mode.
 *
 * Reads/writes the .high-contrast class on <html> and syncs to localStorage.
 * Does not require React context — CSS custom properties on :root handle all visuals.
 */
export function useHighContrast() {
  const [isHighContrast, setIsHighContrast] = useState(getInitialState);

  useEffect(() => {
    const root = document.documentElement;
    if (isHighContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(isHighContrast));
    } catch {
      // localStorage may be unavailable (e.g. private browsing, storage quota exceeded)
    }
  }, [isHighContrast]);

  const setHighContrast = useCallback((value: boolean) => {
    setIsHighContrast(value);
  }, []);

  const toggleHighContrast = useCallback(() => {
    setIsHighContrast((prev: boolean) => !prev);
  }, []);

  return {
    isHighContrast,
    setHighContrast,
    toggleHighContrast,
  };
}
