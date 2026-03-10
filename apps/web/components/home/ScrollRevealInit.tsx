'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Registers an IntersectionObserver that adds `.revealed` to every
 * `.reveal-on-scroll` element when it enters the viewport.
 * Re-arms on each pathname change so SPA navigations within the marketing
 * layout correctly reveal newly rendered elements.
 */
export function ScrollRevealInit() {
  const pathname = usePathname();

  useEffect(() => {
    // Signal to CSS that JS is available — enables the reveal-on-scroll animations.
    // Without this class, elements remain fully visible (safe fallback for no-JS).
    document.documentElement.classList.add('reveal-js');

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
  }, [pathname]);

  return null;
}
