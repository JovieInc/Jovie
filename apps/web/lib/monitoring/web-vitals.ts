'use client';

import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { track } from '@/lib/analytics';

// Define the metric handler type
export type MetricHandler = (metric: Metric) => void;

declare global {
  // eslint-disable-next-line no-var
  var jovieWebVitalsInitialized: boolean | undefined;
  // eslint-disable-next-line no-var
  var jovieWebVitalsHandlers: Set<MetricHandler> | undefined;
}

function getWebVitalsHandlers(): Set<MetricHandler> {
  if (!globalThis.jovieWebVitalsHandlers) {
    globalThis.jovieWebVitalsHandlers = new Set<MetricHandler>();
  }
  return globalThis.jovieWebVitalsHandlers;
}

/**
 * Initialize Web Vitals tracking
 * @param onMetric Optional custom handler for metrics
 */
export function initWebVitals(onMetric?: MetricHandler) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handlers = getWebVitalsHandlers();
  if (onMetric) {
    handlers.add(onMetric);
  }

  if (!globalThis.jovieWebVitalsInitialized) {
    globalThis.jovieWebVitalsInitialized = true;

    const handleMetric = (metric: Metric) => {
      const currentHandlers = getWebVitalsHandlers();
      currentHandlers.forEach(handler => {
        try {
          handler(metric);
        } catch {
          // ignore handler errors
        }
      });

      sendToAnalytics(metric);
    };

    onCLS(handleMetric);
    onINP(handleMetric);
    onFCP(handleMetric);
    onLCP(handleMetric);
    onTTFB(handleMetric);
  }

  return () => {
    if (onMetric) {
      getWebVitalsHandlers().delete(onMetric);
    }
  };
}

/**
 * Send Web Vitals metrics to analytics
 * Note: We only send to Statsig via track() - Vercel Analytics SpeedInsights
 * was removed to reduce analytics costs. Do NOT add duplicate sending here.
 */
function sendToAnalytics(metric: Metric) {
  // Normalize the metric name to lowercase for consistency
  const name = metric.name.toLowerCase();

  // Create a standardized payload
  const payload = {
    name,
    value: metric.value,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    rating: getRating(name, metric.value),
  };

  // Send to Statsig via our analytics utility (single destination)
  track(`web_vital_${name}`, payload);
}

/**
 * Get performance rating based on metric name and value
 * Using Google's Core Web Vitals thresholds
 * https://web.dev/vitals/
 */
function getRating(
  name: string,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, { good: number; needsImprovement: number }> =
    {
      cls: { good: 0.1, needsImprovement: 0.25 },
      fid: { good: 100, needsImprovement: 300 },
      inp: { good: 200, needsImprovement: 500 },
      lcp: { good: 2500, needsImprovement: 4000 },
      fcp: { good: 1800, needsImprovement: 3000 },
      ttfb: { good: 800, needsImprovement: 1800 },
    };

  const limits = thresholds[name];
  if (!limits) {
    return 'good';
  }

  if (value <= limits.good) {
    return 'good';
  }

  if (value <= limits.needsImprovement) {
    return 'needs-improvement';
  }

  return 'poor';
}

/**
 * Track performance for A/B testing experiments
 */
export function trackPerformanceExperiment(
  experiment: string,
  variant: string
) {
  initWebVitals(metric => {
    sendToAnalytics({
      ...metric,
      // Add experiment context to the metric
      name: `${metric.name}_${experiment}` as typeof metric.name,
      delta: metric.delta,
      value: metric.value,
      id: `${metric.id}_${variant}`,
    });
  });
}
