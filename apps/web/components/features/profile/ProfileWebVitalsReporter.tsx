'use client';

import { useEffect } from 'react';

const DEFERRED_INIT_DELAY_MS = 300;

/**
 * Lightweight RUM hook for the public profile route group.
 *
 * The profile layout uses `skipCoreProviders` (see [username]/layout.tsx),
 * which omits the CoreProviders web-vitals initializer. Without this
 * component, profile routes don't emit LCP/INP/CLS/FCP/TTFB events to
 * analytics — leaving the highest-traffic surface unmeasured.
 *
 * The component renders nothing, lazy-loads the web-vitals module after
 * first paint, and routes metrics through `initWebVitals()` → analytics
 * + a `web-vitals` CustomEvent that anything subscribing can pick up.
 */
export function ProfileWebVitalsReporter() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    function dispatchWebVital(metric: unknown) {
      const event = new CustomEvent('web-vitals', { detail: metric });
      globalThis.dispatchEvent(event);
    }

    const handle = setTimeout(() => {
      import('@/lib/monitoring/web-vitals')
        .then(mod => {
          const dispose = mod.initWebVitals(dispatchWebVital);
          if (cancelled) {
            dispose();
            return;
          }
          cleanup = dispose;
        })
        .catch(() => {
          // Web vitals are best-effort; never break the profile page.
        });
    }, DEFERRED_INIT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      cleanup?.();
    };
  }, []);

  return null;
}
