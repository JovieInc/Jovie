/**
 * Performance measurement utilities for E2E tests
 *
 * Following patterns from smoke-test-utils.ts for consistency.
 */

import type { Page } from '@playwright/test';
import {
  getEndUserPerfRouteById,
  getRouteTimingBudgets,
} from '@/scripts/performance-route-manifest';
import type {
  PerformanceBudget,
  PerformanceMetrics,
} from './performance-types';

/**
 * Performance budgets aligned with production Web Vitals thresholds
 *
 * Source: lib/monitoring/web-vitals.ts lines 97-105
 */
function budgetFromRoute(
  routeId: string,
  extras?: Pick<
    PerformanceBudget,
    'apiResponseTime' | 'domContentLoaded' | 'loadTime'
  >
): PerformanceBudget {
  const route = getEndUserPerfRouteById(routeId);
  if (!route) {
    throw new Error(`Missing performance route budget for ${routeId}`);
  }

  const timings = new Map(
    getRouteTimingBudgets(route).map(entry => [entry.metric, entry.budget])
  );

  return {
    apiResponseTime: extras?.apiResponseTime,
    cls: timings.get('cumulative-layout-shift'),
    domContentLoaded: extras?.domContentLoaded,
    fcp: timings.get('first-contentful-paint'),
    inp: timings.get('first-input-delay'),
    lcp: timings.get('largest-contentful-paint'),
    loadTime: extras?.loadTime,
    ttfb: timings.get('time-to-first-byte'),
  };
}

export const PERFORMANCE_BUDGETS = {
  publicProfile: budgetFromRoute('public-profile-main', {
    domContentLoaded: 3000,
    loadTime: 4000,
  }),
  homepage: budgetFromRoute('home', {
    domContentLoaded: 5000,
    loadTime: 6000,
  }),
  dashboard: budgetFromRoute('creator-releases', {
    domContentLoaded: 4000,
    loadTime: 5000,
  }),
  onboarding: budgetFromRoute('onboarding', {
    apiResponseTime: 200,
    domContentLoaded: 2000,
    loadTime: 3000,
  }),
  onboardingHandle: budgetFromRoute('onboarding-resume-handle', {
    domContentLoaded: 2200,
    loadTime: 3200,
  }),
  onboardingSpotify: budgetFromRoute('onboarding-resume-spotify', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingArtistConfirm: budgetFromRoute('onboarding-resume-artist-confirm', {
    domContentLoaded: 2200,
    loadTime: 3200,
  }),
  onboardingUpgrade: budgetFromRoute('onboarding-resume-upgrade', {
    domContentLoaded: 2200,
    loadTime: 3200,
  }),
  onboardingDsp: budgetFromRoute('onboarding-resume-dsp', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingSocial: budgetFromRoute('onboarding-resume-social', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingReleases: budgetFromRoute('onboarding-resume-releases', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingLateArrivals: budgetFromRoute('onboarding-resume-late-arrivals', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingProfileReady: budgetFromRoute('onboarding-resume-profile-ready', {
    domContentLoaded: 2400,
    loadTime: 3400,
  }),
  onboardingCheckout: budgetFromRoute('onboarding-checkout', {
    domContentLoaded: 2600,
    loadTime: 3600,
  }),

  // Release pages
  release: budgetFromRoute('public-release', {
    domContentLoaded: 3500,
    loadTime: 4500,
  }),

  // Creator shell pages
  chat: budgetFromRoute('creator-chat', {
    domContentLoaded: 4000,
    loadTime: 5000,
  }),
  releases: budgetFromRoute('creator-releases', {
    domContentLoaded: 4000,
    loadTime: 5000,
  }),

  // Billing
  billing: budgetFromRoute('billing', {
    domContentLoaded: 4000,
    loadTime: 5000,
  }),

  spotifySearchWarm: {
    apiResponseTime: 200,
  },
  spotifySearchAlphabet: {
    apiResponseTime: 150,
  },
  spotifySearchUi: {
    loadTime: 900,
  },
  onboardingLateArrivalTransition: {
    loadTime: 2600,
  },
} as const satisfies Record<string, PerformanceBudget>;

/**
 * Measure page load performance using Navigation Timing API
 */
export async function measurePageLoad(
  page: Page
): Promise<PerformanceMetrics['navigation']> {
  return page.evaluate(() => {
    const timing = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;
    if (!timing) {
      throw new Error('Navigation timing not available');
    }

    return {
      loadTime: timing.loadEventEnd - timing.startTime,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.startTime,
      ttfb: timing.responseStart - timing.startTime,
      dnsTime: timing.domainLookupEnd - timing.domainLookupStart,
      connectionTime: timing.connectEnd - timing.connectStart,
      requestTime: timing.responseStart - timing.requestStart,
      responseTime: timing.responseEnd - timing.responseStart,
      domProcessingTime: timing.domContentLoadedEventEnd - timing.responseEnd,
    };
  });
}

/**
 * Sample buffered Web Vitals after at least 100ms of supported observation.
 * Wait up to 10 seconds for actual LCP/FCP evidence; unavailable data rejects.
 * This bounded sample is not a final page-lifetime measurement.
 */
export async function measureWebVitals(
  page: Page
): Promise<PerformanceMetrics['vitals']> {
  return page.evaluate(() => {
    const METRIC_TIMEOUT_MS = 100;
    const TOTAL_TIMEOUT_MS = 10000;
    const types = ['largest-contentful-paint', 'paint', 'layout-shift'];

    return new Promise<PerformanceMetrics['vitals']>((resolve, reject) => {
      const vitals: PerformanceMetrics['vitals'] = {};
      const observers: Array<{
        observer: PerformanceObserver;
        consume: (entries: PerformanceEntry[]) => void;
      }> = [];
      let settled = false;
      let observationElapsed = false;
      let clsValue = 0;
      let windowTimer: ReturnType<typeof setTimeout> | undefined;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

      function cleanup(): void {
        clearTimeout(windowTimer);
        clearTimeout(deadlineTimer);
        observers.forEach(({ observer }) => observer.disconnect());
      }

      function fail(message: string): void {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Web Vitals observation unavailable: ${message}`));
      }

      function validValue(
        metric: string,
        value: number | undefined
      ): value is number {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          fail(`invalid ${metric}`);
          return false;
        }
        return true;
      }

      function drain(): void {
        for (const { observer, consume } of observers) {
          if (settled) return;
          consume(observer.takeRecords());
        }
      }

      function checkComplete(): void {
        if (settled || !observationElapsed) return;
        drain();
        if (settled || vitals.lcp === undefined || vitals.fcp === undefined)
          return;
        settled = true;
        cleanup();
        resolve({ ...vitals, cls: clsValue });
      }

      function observe(
        type: string,
        consume: (entries: PerformanceEntry[]) => void
      ): void {
        const observer = new PerformanceObserver(list => {
          if (settled) return;
          consume(list.getEntries());
          checkComplete();
        });
        // Retain constructed observers even if registration throws.
        observers.push({ observer, consume });
        observer.observe({ type, buffered: true });
      }

      try {
        if (
          typeof PerformanceObserver === 'undefined' ||
          !types.every(type =>
            PerformanceObserver.supportedEntryTypes?.includes(type)
          )
        ) {
          fail('unsupported observer capability');
          return;
        }
        observe(types[0], entries => {
          const lastEntry = entries.at(-1);
          if (lastEntry && validValue('lcp', lastEntry.startTime)) {
            vitals.lcp = lastEntry.startTime;
          }
        });
        observe(types[1], entries => {
          const entry = entries.find(
            item => item.name === 'first-contentful-paint'
          );
          if (entry && validValue('fcp', entry.startTime))
            vitals.fcp = entry.startTime;
        });
        observe(types[2], entries => {
          for (const entry of entries) {
            const shift = entry as PerformanceEntry & {
              value?: number;
              hadRecentInput?: boolean;
            };
            if (shift.hadRecentInput) continue;
            if (!validValue('cls', shift.value)) return;
            clsValue += shift.value;
            if (!validValue('cls', clsValue)) return;
          }
        });

        const timing = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (timing) vitals.ttfb = timing.responseStart - timing.startTime;

        windowTimer = setTimeout(() => {
          observationElapsed = true;
          checkComplete();
        }, METRIC_TIMEOUT_MS);
        deadlineTimer = setTimeout(() => {
          checkComplete();
          if (!settled) {
            const missing = ['lcp', 'fcp'].filter(
              metric => vitals[metric as 'lcp' | 'fcp'] === undefined
            );
            fail(`missing ${missing.join(', ')}`);
          }
        }, TOTAL_TIMEOUT_MS);
      } catch {
        fail('observer registration failed');
      }
    });
  });
}

/**
 * Measure resource loading performance (scripts, images, CSS)
 */
export async function measureResourceLoad(
  page: Page
): Promise<PerformanceMetrics['resources']> {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType(
      'resource'
    ) as PerformanceResourceTiming[];

    const scripts = resources.filter(r => r.initiatorType === 'script');
    const images = resources.filter(r => r.initiatorType === 'img');
    const css = resources.filter(
      r => r.initiatorType === 'link' && r.name.includes('.css')
    );

    let slowestResource:
      | NonNullable<PerformanceMetrics['resources']>['slowestResource']
      | undefined;
    let maxDuration = 0;

    resources.forEach(resource => {
      const duration = resource.duration;
      if (duration > maxDuration) {
        maxDuration = duration;
        slowestResource = {
          url: resource.name,
          duration: duration,
          size: resource.transferSize || 0,
        };
      }
    });

    return {
      scriptCount: scripts.length,
      scriptTotalSize: scripts.reduce(
        (sum, r) => sum + (r.transferSize || 0),
        0
      ),
      imageCount: images.length,
      imageTotalSize: images.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      cssCount: css.length,
      cssTotalSize: css.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      slowestResource,
    };
  });
}

/**
 * Setup API request monitoring
 *
 * Returns a cleanup function to stop monitoring and retrieve captured requests.
 */
export function setupApiMonitoring(page: Page): {
  cleanup: () => Promise<PerformanceMetrics['apiRequests']>;
} {
  const apiRequests: Array<{
    url: string;
    method: string;
    duration: number;
    status: number;
    startTime: number;
  }> = [];

  const responseHandler = async (response: any) => {
    try {
      const request = response.request();
      const url = request.url();

      // Only track API requests (not static assets)
      if (url.includes('/api/') || url.includes('/trpc/')) {
        const timing = response.timing();
        apiRequests.push({
          url,
          method: request.method(),
          duration: timing.responseEnd - timing.requestStart,
          status: response.status(),
          startTime: Date.now(),
        });
      }
    } catch (_e) {
      // Ignore errors from response handling
    }
  };

  page.on('response', responseHandler);

  return {
    cleanup: async () => {
      page.off('response', responseHandler);
      return apiRequests.map(({ startTime, ...rest }) => rest);
    },
  };
}

/**
 * Measure all performance metrics comprehensively
 */
export async function measureAllPerformanceMetrics(
  page: Page,
  options?: {
    includeResources?: boolean;
    includeApiRequests?: boolean;
  }
): Promise<PerformanceMetrics> {
  const { includeResources = false, includeApiRequests = false } =
    options || {};

  const [navigation, vitals] = await Promise.all([
    measurePageLoad(page),
    measureWebVitals(page),
  ]);

  const metrics: PerformanceMetrics = {
    navigation,
    vitals,
  };

  if (includeResources) {
    metrics.resources = await measureResourceLoad(page);
  }

  if (includeApiRequests) {
    // Note: API monitoring must be set up before navigation
    // This option is mainly for documentation purposes
    metrics.apiRequests = [];
  }

  return metrics;
}

/**
 * Measure timing of a user interaction
 *
 * @param page - Playwright page
 * @param interaction - Async function performing the interaction
 * @returns Duration in milliseconds
 */
export async function measureInteractionTiming(
  page: Page,
  interaction: () => Promise<void>
): Promise<number> {
  const startTime = Date.now();
  await interaction();
  const endTime = Date.now();
  return endTime - startTime;
}
