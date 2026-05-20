'use client';

import { useEffect, useState } from 'react';

const BANNER_SELECTOR = '[data-testid="cookie-banner"]';
const DEFAULT_OFFSET = 16;
const GAP = 16;

/**
 * Returns the bottom offset (in px) that the Sonner toaster should use
 * to avoid overlapping the cookie consent banner.
 *
 * When the banner is visible: banner height + 16px bottom offset (GAP) so toasts
 * float above the fixed bottom-right card without overlap.
 * When hidden: the default 16px offset.
 *
 * Also, the offset value (h + 16) is the correct value for --cookie-banner-h CSS var
 * (see CookieBannerSection) so profile shells + QR cards reserve full occupied space.
 *
 * Uses MutationObserver + ResizeObserver. Floating card redesign keeps the same
 * measurement contract.
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
