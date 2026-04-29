'use client';

import { useEffect } from 'react';

/**
 * JS fallback that ensures marketing pages can scroll even if
 * the CSS `:has(.marketing-system)` override doesn't apply
 * (older browsers, hydration timing, etc.).
 */
export function MarketingScrollUnlock() {
  useEffect(() => {
    // Only set on html — setting on body promotes overflow-x:clip to
    // overflow-x:hidden, which creates a scroll container that breaks
    // position:sticky inside the page.
    document.documentElement.style.overflowY = 'auto';
    return () => {
      document.documentElement.style.removeProperty('overflow-y');
    };
  }, []);

  return null;
}
