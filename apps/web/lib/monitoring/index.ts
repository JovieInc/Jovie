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
export * from './database-performance';
export { withPerformanceMonitoring as withMiddlewarePerformanceMonitoring } from './middleware';
export * from './performance';
export * from './regression';
export * from './user-journey';
export * from './web-vitals';

// Export a convenience function to initialize all monitoring
// NOTE: Web Vitals are initialized separately in ClientProviders - do NOT initialize here
// NOTE: Resource tracking is DISABLED to reduce analytics costs ($100/day was due to excessive events)
export async function initAllMonitoring() {
  if (typeof window !== 'undefined') {
    // Initialize Performance Tracking (page load only, NOT resource tracking)
    const performanceModule = await import('./performance');
    const performanceTracker = new performanceModule.PerformanceTracker();

    // Get the current page name from the URL
    const pageName = window.location.pathname;

    // Track page load performance (single event per page)
    performanceTracker.trackPageLoad(pageName);

    // DISABLED: trackResourceLoad() was generating 30-50+ events per page
    // This was a major contributor to $100/day analytics spend
    // performanceTracker.trackResourceLoad();

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
