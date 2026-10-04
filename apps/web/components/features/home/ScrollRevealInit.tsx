'use client';

import { useEffect } from 'react';

/**
 * Fallback for browsers without CSS scroll-driven animations: registers an
 * IntersectionObserver that adds `.revealed` to every `.reveal-on-scroll`
 * element when it enters the viewport. Where `animation-timeline: view()` is
 * supported, globals.css runs the reveal on its own and this does nothing.
 * Rendered once in the marketing layout — no per-component setup needed.
 */
export function ScrollRevealInit() {
  useEffect(() => {
    if (globalThis.CSS?.supports?.('animation-timeline: view()')) {
      return;
    }

    document.documentElement.classList.add('reveal-js');

    const elements = document.querySelectorAll('.reveal-on-scroll');
    if (!elements.length) {
      return () => {
        document.documentElement.classList.remove('reveal-js');
      };
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      document.documentElement.classList.remove('reveal-js');
      observer.disconnect();
    };
  }, []);

  return null;
}
