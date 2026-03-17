'use client';

import { useEffect } from 'react';

/**
 * Registers an IntersectionObserver that adds `.revealed` to every
 * `.reveal-on-scroll` element when it enters the viewport.
 * Rendered once in the marketing layout — no per-component setup needed.
 */
export function ScrollRevealInit() {
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal-on-scroll');
    if (!elements.length) return;

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

    return () => observer.disconnect();
  }, []);

  return null;
}
