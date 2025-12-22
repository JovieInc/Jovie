// Export all monitoring utilities

// Re-export types with aliases to avoid conflicts
export type { Metric as WebVitalsMetric } from 'web-vitals';
export type {
  AlertRule as MonitoringAlertRule,
  AlertSeverity as MonitoringAlertSeverity,
} from './alerts';
export * from './alerts';
// Export API and middleware monitoring with aliases to avoid conflicts
export { withPerformanceMonitoring as withApiPerformanceMonitoring } from './api';
export * from './database';
export { withPerformanceMonitoring as withMiddlewarePerformanceMonitoring } from './middleware';
export * from './performance';
export * from './regression';
export * from './user-journey';
export * from './web-vitals';

// Export a convenience function to initialize all monitoring
export async function initAllMonitoring() {
  if (typeof window !== 'undefined') {
    // Initialize Web Vitals
    const webVitalsModule = await import('./web-vitals');
    webVitalsModule.initWebVitals();

    // Initialize Performance Tracking
    const performanceModule = await import('./performance');
    const performanceTracker = new performanceModule.PerformanceTracker();

    // Get the current page name from the URL
    const pageName = window.location.pathname;

    // Track page load performance
    performanceTracker.trackPageLoad(pageName);

    // Track resource loading
    performanceTracker.trackResourceLoad();

    // Initialize Regression Detection
    const regressionModule = await import('./regression');
    const regressionDetector = new regressionModule.RegressionDetector();

    // Initialize Performance Alerts
    const alertsModule = await import('./alerts');
    const performanceAlerts = new alertsModule.PerformanceAlerts();

    // Return the initialized trackers for further configuration
    return {
      performanceTracker,
      regressionDetector,
      performanceAlerts,
    };
  }

  return null;
}
