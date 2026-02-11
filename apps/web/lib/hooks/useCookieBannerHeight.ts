'use client';

import { useEffect, useState } from 'react';

const BANNER_SELECTOR = '[data-testid="cookie-banner"]';
const DEFAULT_OFFSET = 16;
const GAP = 16;

/**
 * Returns the bottom offset (in px) that the Sonner toaster should use
 * to avoid overlapping the cookie consent banner.
 *
 * When the banner is visible: banner height + gap (so toasts float above it).
 * When hidden: the default 16px offset.
 *
 * Uses MutationObserver to detect banner mount/unmount and a ResizeObserver
 * to track height changes across breakpoints.
 */
export function useCookieBannerHeight(): number {
  const [offset, setOffset] = useState(DEFAULT_OFFSET);

  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;

    function measure() {
      const banner = document.querySelector(BANNER_SELECTOR);
      if (banner) {
        const height = banner.getBoundingClientRect().height;
        setOffset(height + GAP);

        // Observe size changes (e.g. responsive layout shifts)
        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => {
            const h = banner.getBoundingClientRect().height;
            setOffset(h + GAP);
          });
          resizeObserver.observe(banner);
        }
      } else {
        setOffset(DEFAULT_OFFSET);
        resizeObserver?.disconnect();
        resizeObserver = null;
      }
    }

    measure();

    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return offset;
}
