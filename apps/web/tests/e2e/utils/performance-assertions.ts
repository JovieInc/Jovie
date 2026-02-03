/**
 * Performance assertion utilities for E2E tests
 *
 * Provides budget validation with warning and critical severity levels.
 */

import type { TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import type {
  PerformanceBudget,
  PerformanceMetrics,
  PerformanceViolation,
} from './performance-types';

/**
 * Assert that performance metrics meet the specified budget
 *
 * - Warning: >budget but <150% budget
 * - Critical: >150% budget (causes test failure)
 *
 * Attaches metrics and violations to test results for CI/CD visibility.
 */
/**
 * Helper to check a single metric against budget
 */
function checkMetric(
  metricName: string,
  actual: number | undefined,
  budgetValue: number | undefined
): PerformanceViolation | null {
  if (budgetValue === undefined || actual === undefined) {
    return null;
  }

  if (actual <= budgetValue) {
    return null;
  }

  const criticalThreshold = budgetValue * 1.5;
  return {
    metric: metricName,
    actual,
    budget: budgetValue,
    severity: actual > criticalThreshold ? 'critical' : 'warning',
  };
}

export async function assertPerformanceBudget(
  metrics: PerformanceMetrics,
  budget: PerformanceBudget,
  testInfo?: TestInfo
): Promise<void> {
  const violations: PerformanceViolation[] = [];

  // Check Web Vitals
  const vitalChecks = [
    checkMetric('LCP', metrics.vitals.lcp, budget.lcp),
    checkMetric('FCP', metrics.vitals.fcp, budget.fcp),
    checkMetric('CLS', metrics.vitals.cls, budget.cls),
    checkMetric('INP', metrics.vitals.inp, budget.inp),
    checkMetric(
      'TTFB',
      metrics.vitals.ttfb ?? metrics.navigation.ttfb,
      budget.ttfb
    ),
  ];

  // Check Navigation Timing
  const navigationChecks = [
    checkMetric(
      'DOM Content Loaded',
      metrics.navigation.domContentLoaded,
      budget.domContentLoaded
    ),
    checkMetric('Load Time', metrics.navigation.loadTime, budget.loadTime),
  ];

  // Collect all violations
  for (const check of [...vitalChecks, ...navigationChecks]) {
    if (check !== null) {
      violations.push(check);
    }
  }

  // Attach metrics to test results
  if (testInfo) {
    await testInfo.attach('performance-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });

    if (violations.length > 0) {
      await testInfo.attach('performance-violations', {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
      });
    }
  }

  // Log warnings
  const warnings = violations.filter(v => v.severity === 'warning');
  if (warnings.length > 0) {
    console.warn('⚠️  Performance budget warnings:');
    warnings.forEach(v => {
      const actual =
        v.metric === 'CLS' ? v.actual.toFixed(3) : v.actual.toFixed(0) + 'ms';
      const budgetStr =
        v.metric === 'CLS' ? v.budget.toFixed(3) : v.budget.toFixed(0) + 'ms';
      console.warn(`   - ${v.metric}: ${actual} (budget: ${budgetStr})`);
    });
  }

  // Assert no critical violations
  const criticalViolations = violations.filter(v => v.severity === 'critical');
  if (criticalViolations.length > 0) {
    const message = `Critical performance violations:\n${criticalViolations
      .map(v => {
        const actual =
          v.metric === 'CLS' ? v.actual.toFixed(3) : v.actual.toFixed(0) + 'ms';
        const budgetStr =
          v.metric === 'CLS' ? v.budget.toFixed(3) : v.budget.toFixed(0) + 'ms';
        return `  - ${v.metric}: ${actual} (budget: ${budgetStr})`;
      })
      .join('\n')}`;

    expect(criticalViolations, message).toHaveLength(0);
  }
}

/**
 * Assert that Web Vitals meet healthy thresholds
 *
 * Based on Chrome's Core Web Vitals thresholds:
 * - LCP: <2.5s good, <4s needs improvement, >4s poor
 * - FCP: <1.8s good, <3s needs improvement, >3s poor
 * - CLS: <0.1 good, <0.25 needs improvement, >0.25 poor
 * - INP: <200ms good, <500ms needs improvement, >500ms poor
 */
export async function assertWebVitalsHealthy(
  vitals: PerformanceMetrics['vitals'],
  testInfo?: TestInfo
): Promise<void> {
  const issues: string[] = [];

  // Check LCP
  if (vitals.lcp !== undefined && vitals.lcp > 4000) {
    issues.push(`LCP is poor: ${vitals.lcp.toFixed(0)}ms (should be <2500ms)`);
  }

  // Check FCP
  if (vitals.fcp !== undefined && vitals.fcp > 3000) {
    issues.push(`FCP is poor: ${vitals.fcp.toFixed(0)}ms (should be <1800ms)`);
  }

  // Check CLS
  if (vitals.cls !== undefined && vitals.cls > 0.25) {
    issues.push(`CLS is poor: ${vitals.cls.toFixed(3)} (should be <0.1)`);
  }

  // Check INP
  if (vitals.inp !== undefined && vitals.inp > 500) {
    issues.push(`INP is poor: ${vitals.inp.toFixed(0)}ms (should be <200ms)`);
  }

  // Attach vitals to test results
  if (testInfo) {
    await testInfo.attach('web-vitals', {
      body: JSON.stringify(vitals, null, 2),
      contentType: 'application/json',
    });
  }

  // Assert no poor metrics
  expect(
    issues,
    `Web Vitals health check failed:\n${issues.join('\n')}`
  ).toHaveLength(0);
}

/**
 * Assert that page load time is within acceptable range
 *
 * Simple assertion for load time checks.
 */
export async function assertFastPageLoad(
  loadTimeMs: number,
  maxLoadTimeMs: number,
  testInfo?: TestInfo
): Promise<void> {
  if (testInfo) {
    await testInfo.attach('page-load-time', {
      body: `${loadTimeMs.toFixed(0)}ms (max: ${maxLoadTimeMs}ms)`,
      contentType: 'text/plain',
    });
  }

  // Warning for >budget
  if (loadTimeMs > maxLoadTimeMs) {
    console.warn(
      `⚠️  Page load time exceeded budget: ${loadTimeMs.toFixed(0)}ms > ${maxLoadTimeMs}ms`
    );
  }

  // Critical failure for >150% budget
  const criticalThreshold = maxLoadTimeMs * 1.5;
  expect(
    loadTimeMs,
    `Page load time is critically slow: ${loadTimeMs.toFixed(0)}ms (max: ${maxLoadTimeMs}ms)`
  ).toBeLessThanOrEqual(criticalThreshold);
}

/**
 * Assert that API response time is within acceptable range
 */
export function assertFastApiResponse(
  responseTimeMs: number,
  maxResponseTimeMs: number
): void {
  // Warning for >budget
  if (responseTimeMs > maxResponseTimeMs) {
    console.warn(
      `⚠️  API response time exceeded budget: ${responseTimeMs.toFixed(0)}ms > ${maxResponseTimeMs}ms`
    );
  }

  // Critical failure for >150% budget
  const criticalThreshold = maxResponseTimeMs * 1.5;
  expect(
    responseTimeMs,
    `API response time is critically slow: ${responseTimeMs.toFixed(0)}ms (max: ${maxResponseTimeMs}ms)`
  ).toBeLessThanOrEqual(criticalThreshold);
}
