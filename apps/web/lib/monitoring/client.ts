'use client';

import { PerformanceTracker } from './performance';
import { RegressionDetector } from './regression';

let hasInitialized = false;

declare global {
  // Holds the current web-vitals listener for cleanup across HMR.
  // eslint-disable-next-line no-var
  var jovieWebVitalsListener: ((event: Event) => void) | undefined;
}

export function initAllMonitoring(): void {
  if (hasInitialized) {
    return;
  }

  hasInitialized = true;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const performanceTracker = new PerformanceTracker();
    performanceTracker.trackPageLoad(window.location.pathname);

    const regressionDetector = new RegressionDetector();

    const handler = (event: Event) => {
      const custom = event as CustomEvent;
      const detail = custom.detail as Record<string, unknown> | undefined;

      const name = typeof detail?.name === 'string' ? detail.name : null;
      const value = typeof detail?.value === 'number' ? detail.value : null;

      if (!name || value === null) {
        return;
      }

      regressionDetector.addSample(name, value);
    };

    if (
      typeof globalThis !== 'undefined' &&
      globalThis.jovieWebVitalsListener
    ) {
      globalThis.removeEventListener(
        'web-vitals',
        globalThis.jovieWebVitalsListener
      );
    }

    globalThis.addEventListener('web-vitals', handler);
    if (typeof globalThis !== 'undefined') {
      globalThis.jovieWebVitalsListener = handler;
    }
  } catch {
    // ignore monitoring init errors
  }
}
