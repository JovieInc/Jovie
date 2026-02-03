/**
 * TypeScript types for performance metrics in E2E tests
 */

export interface PerformanceMetrics {
  navigation: {
    loadTime: number;
    domContentLoaded: number;
    ttfb: number;
    dnsTime: number;
    connectionTime: number;
    requestTime: number;
    responseTime: number;
    domProcessingTime: number;
  };

  vitals: {
    lcp?: number;
    fcp?: number;
    cls?: number;
    inp?: number;
    ttfb?: number;
  };

  resources?: {
    scriptCount: number;
    scriptTotalSize: number;
    imageCount: number;
    imageTotalSize: number;
    cssCount: number;
    cssTotalSize: number;
    slowestResource?: {
      url: string;
      duration: number;
      size: number;
    };
  };

  apiRequests?: Array<{
    url: string;
    method: string;
    duration: number;
    status: number;
  }>;
}

export interface PerformanceBudget {
  lcp?: number;
  fcp?: number;
  cls?: number;
  inp?: number;
  ttfb?: number;
  domContentLoaded?: number;
  loadTime?: number;
  apiResponseTime?: number;
}

export interface PerformanceViolation {
  metric: string;
  actual: number;
  budget: number;
  severity: 'warning' | 'critical';
}
