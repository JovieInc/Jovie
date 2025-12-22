'use client';

import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { track } from '@/lib/analytics';

// Define the metric handler type
export type MetricHandler = (metric: Metric) => void;

/**
 * Initialize Web Vitals tracking
 * @param onMetric Optional custom handler for metrics
 */
export function initWebVitals(onMetric?: MetricHandler) {
  // Default handler sends metrics to our analytics providers
  const handleMetric = (metric: Metric) => {
    // Always call the custom handler if provided
    if (onMetric) {
      onMetric(metric);
    }

    // Send to our analytics providers
    sendToAnalytics(metric);
  };

  // Initialize all Core Web Vitals metrics
  onCLS(handleMetric); // Cumulative Layout Shift
  onINP(handleMetric); // Interaction to Next Paint (replaces FID)
  onFCP(handleMetric); // First Contentful Paint
  onLCP(handleMetric); // Largest Contentful Paint
  onTTFB(handleMetric); // Time to First Byte
}

/**
 * Send Web Vitals metrics to multiple analytics providers
 */
function sendToAnalytics(metric: Metric) {
  // Normalize the metric name to lowercase for consistency
  const name = metric.name.toLowerCase();

  // Create a standardized payload for all providers
  const payload = {
    name,
    value: metric.value,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    rating: getRating(name, metric.value),
  };

  // Send to PostHog via our analytics utility
  track(`web_vital_${name}`, payload);

  // Send to Vercel Analytics if available
  if (typeof window !== 'undefined' && window.va) {
    window.va('event', {
      name: `web_vital_${name}`,
      properties: payload,
    });
  }
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
  switch (name) {
    case 'cls':
      return value <= 0.1
        ? 'good'
        : value <= 0.25
          ? 'needs-improvement'
          : 'poor';
    case 'fid':
      return value <= 100
        ? 'good'
        : value <= 300
          ? 'needs-improvement'
          : 'poor';
    case 'lcp':
      return value <= 2500
        ? 'good'
        : value <= 4000
          ? 'needs-improvement'
          : 'poor';
    case 'fcp':
      return value <= 1800
        ? 'good'
        : value <= 3000
          ? 'needs-improvement'
          : 'poor';
    case 'ttfb':
      return value <= 800
        ? 'good'
        : value <= 1800
          ? 'needs-improvement'
          : 'poor';
    default:
      return 'good';
  }
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
