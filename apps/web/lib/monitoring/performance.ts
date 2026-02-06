'use client';

import * as Sentry from '@sentry/nextjs';
import { track } from '@/lib/analytics';

declare global {
  var joviePerformanceObservers:
    | {
        navigation?: PerformanceObserver;
        resource?: PerformanceObserver;
      }
    | undefined;
}

/**
 * Performance Tracker class for monitoring various performance aspects
 */
export class PerformanceTracker {
  /**
   * Track page load performance metrics
   * @param pageName The name of the page being tracked
   */
  trackPageLoad(pageName: string): () => void {
    if (typeof window === 'undefined' || !window.performance) {
      return () => {};
    }

    // Create observer for navigation timing
    if (globalThis.joviePerformanceObservers?.navigation) {
      globalThis.joviePerformanceObservers.navigation.disconnect();
      globalThis.joviePerformanceObservers.navigation = undefined;
    }

    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming;

          this.sendMetric('page_load', {
            page: pageName,
            dns: navEntry.domainLookupEnd - navEntry.domainLookupStart,
            connection: navEntry.connectEnd - navEntry.connectStart,
            request: navEntry.responseStart - navEntry.requestStart,
            response: navEntry.responseEnd - navEntry.responseStart,
            dom: navEntry.domContentLoadedEventEnd - navEntry.responseEnd,
            load: navEntry.loadEventEnd - navEntry.loadEventStart,
            total: navEntry.loadEventEnd - navEntry.startTime,
            type: navEntry.type,
          });
        }
      });
    });

    // Start observing navigation entries
    try {
      observer.observe({ entryTypes: ['navigation'] });
    } catch (error) {
      Sentry.captureException(error, {
        extra: { context: 'navigation_timing_observer' },
      });
    }

    globalThis.joviePerformanceObservers ??= {};
    globalThis.joviePerformanceObservers.navigation = observer;

    return () => {
      observer.disconnect();
      if (globalThis.joviePerformanceObservers?.navigation === observer) {
        globalThis.joviePerformanceObservers.navigation = undefined;
      }
    };
  }

  /**
   * Track resource load performance
   * @param resourceType Type of resources to track (e.g., 'script', 'img', 'css')
   */
  trackResourceLoad(resourceType?: string): () => void {
    if (typeof window === 'undefined' || !window.performance) {
      return () => {};
    }

    if (globalThis.joviePerformanceObservers?.resource) {
      globalThis.joviePerformanceObservers.resource.disconnect();
      globalThis.joviePerformanceObservers.resource = undefined;
    }

    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;

          // Skip if resourceType is specified and doesn't match
          if (resourceType && !resourceEntry.name.includes(resourceType)) {
            return;
          }

          this.sendMetric('resource_load', {
            name: resourceEntry.name,
            type: resourceEntry.initiatorType,
            size: resourceEntry.transferSize,
            duration: resourceEntry.duration,
            protocol: resourceEntry.nextHopProtocol,
          });
        }
      });
    });

    try {
      observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      Sentry.captureException(error, {
        extra: { context: 'resource_timing_observer' },
      });
    }

    globalThis.joviePerformanceObservers ??= {};
    globalThis.joviePerformanceObservers.resource = observer;

    return () => {
      observer.disconnect();
      if (globalThis.joviePerformanceObservers?.resource === observer) {
        globalThis.joviePerformanceObservers.resource = undefined;
      }
    };
  }

  /**
   * Send metric to analytics
   */
  private sendMetric(metricType: string, data: Record<string, unknown>) {
    track(`performance_${metricType}`, data);
  }
}
