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
 * Measure Core Web Vitals using PerformanceObserver
 *
 * Waits up to 10 seconds for LCP and FCP to be captured.
 */
export async function measureWebVitals(
  page: Page
): Promise<PerformanceMetrics['vitals']> {
  return page.evaluate(() => {
    const METRIC_TIMEOUT_MS = 100;
    const TOTAL_TIMEOUT_MS = 10000;
    const EXPECTED_METRICS = 3; // LCP, FCP, CLS

    return new Promise(resolve => {
      const vitals: PerformanceMetrics['vitals'] = {};
      const observers: PerformanceObserver[] = [];
      let metricsCollected = 0;

      function checkComplete(): void {
        metricsCollected++;
        if (metricsCollected >= EXPECTED_METRICS) {
          observers.forEach(obs => obs.disconnect());
          resolve(vitals);
        }
      }

      function setupMetricObserver(
        observerFn: () => PerformanceObserver,
        metricKey: keyof PerformanceMetrics['vitals'],
        defaultValue: number
      ): void {
        try {
          const observer = observerFn();
          observers.push(observer);
        } catch (_e) {
          // Metric not supported in this browser
        }

        setTimeout(() => {
          if (vitals[metricKey] === undefined) {
            vitals[metricKey] = defaultValue as never;
          }
          checkComplete();
        }, METRIC_TIMEOUT_MS);
      }

      // Measure LCP (Largest Contentful Paint)
      setupMetricObserver(
        () => {
          const observer = new PerformanceObserver(list => {
            const entries = list.getEntries();
            const lastEntry = entries[
              entries.length - 1
            ] as PerformanceEntry & {
              renderTime?: number;
              loadTime?: number;
            };
            vitals.lcp = lastEntry.renderTime || lastEntry.loadTime || 0;
          });
          observer.observe({
            type: 'largest-contentful-paint',
            buffered: true,
          });
          return observer;
        },
        'lcp',
        0
      );

      // Measure FCP (First Contentful Paint)
      setupMetricObserver(
        () => {
          const observer = new PerformanceObserver(list => {
            const fcpEntry = list
              .getEntries()
              .find(entry => entry.name === 'first-contentful-paint');
            if (fcpEntry) {
              vitals.fcp = fcpEntry.startTime;
            }
          });
          observer.observe({ type: 'paint', buffered: true });
          return observer;
        },
        'fcp',
        0
      );

      // Measure CLS (Cumulative Layout Shift)
      setupMetricObserver(
        () => {
          let clsValue = 0;
          const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              const layoutShiftEntry = entry as PerformanceEntry & {
                value?: number;
                hadRecentInput?: boolean;
              };
              if (!layoutShiftEntry.hadRecentInput) {
                clsValue += layoutShiftEntry.value || 0;
              }
            }
            vitals.cls = clsValue;
          });
          observer.observe({ type: 'layout-shift', buffered: true });
          return observer;
        },
        'cls',
        0
      );

      // Get TTFB from Navigation Timing (synchronous)
      const timing = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;
      if (timing) {
        vitals.ttfb = timing.responseStart - timing.startTime;
      }

      // Fallback timeout to ensure promise resolves
      setTimeout(() => {
        observers.forEach(obs => obs.disconnect());
        resolve(vitals);
      }, TOTAL_TIMEOUT_MS);
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
