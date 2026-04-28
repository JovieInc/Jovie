'use client';

import { useEffect } from 'react';

/**
 * Toggles `data-scrolled` on the `.home-viewport` root once the page has
 * scrolled past the threshold, so the header can swap from a transparent
 * docked state to a frosted-glass scrolled state.
 */
export function HomeScrollWatcher() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.home-viewport');
    if (!root) return undefined;

    const apply = () => {
      const scrolled = window.scrollY > 8;
      if (root.dataset.scrolled !== (scrolled ? 'true' : 'false')) {
        root.dataset.scrolled = scrolled ? 'true' : 'false';
      }
    };

    apply();
    window.addEventListener('scroll', apply, { passive: true });
    return () => window.removeEventListener('scroll', apply);
  }, []);

  return null;
}
