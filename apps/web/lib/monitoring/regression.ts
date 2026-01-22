'use client';

import { track } from '@/lib/analytics';

/**
 * Performance Regression Detector
 * Detects performance regressions by comparing current values to historical baselines
 */
export class RegressionDetector {
  private metrics: Record<string, number[]> = {};
  private readonly thresholds: Record<string, number> = {};
  private readonly maxSamples: number = 100;

  /**
   * Create a new regression detector
   * @param thresholds Optional map of metric names to regression thresholds (as percentages)
   * @param maxSamples Maximum number of samples to keep per metric
   */
  constructor(
    thresholds: Record<string, number> = {},
    maxSamples: number = 100
  ) {
    this.thresholds = {
      // Default thresholds for Core Web Vitals (20% regression)
      lcp: 20,
      fid: 20,
      cls: 20,
      fcp: 20,
      ttfb: 20,
      // Override with any provided thresholds
      ...thresholds,
    };
    this.maxSamples = maxSamples;
  }

  /**
   * Add a metric sample
   * @param metric The metric name
   * @param value The metric value
   */
  addSample(metric: string, value: number) {
    if (!this.metrics[metric]) {
      this.metrics[metric] = [];
    }

    // Add the new sample
    this.metrics[metric].push(value);

    // Trim to max samples
    if (this.metrics[metric].length > this.maxSamples) {
      this.metrics[metric].shift();
    }

    // Check for regression
    this.detectRegression(metric, value);

    return this;
  }

  /**
   * Get historical data for a metric
   * @param metric The metric name
   */
  getHistoricalData(metric: string): number[] {
    // In a real implementation, this would fetch data from an API or database
    // For now, we'll just return the stored samples
    return this.metrics[metric] || [];
  }

  /**
   * Calculate baseline for a metric from historical data
   * @param historicalData Array of historical values
   */
  calculateBaseline(historicalData: number[]): number {
    if (historicalData.length === 0) {
      return 0;
    }

    // Sort the data to remove outliers
    const sorted = [...historicalData].sort((a, b) => a - b);

    // Remove the top and bottom 10% to get a more stable baseline
    const trimAmount = Math.max(1, Math.floor(sorted.length * 0.1));
    const trimmed = sorted.slice(trimAmount, sorted.length - trimAmount);

    // Calculate the mean of the trimmed data
    const sum = trimmed.reduce((acc, val) => acc + val, 0);
    return trimmed.length > 0 ? sum / trimmed.length : 0;
  }

  /**
   * Detect regression for a metric
   * @param metric The metric name
   * @param currentValue The current metric value
   */
  async detectRegression(metric: string, currentValue: number) {
    const historical = this.getHistoricalData(metric);

    // Need at least 5 samples to establish a baseline
    if (historical.length < 5) {
      return false;
    }

    const baseline = this.calculateBaseline(historical);

    // Skip if baseline is zero or very small
    if (baseline < 0.001) {
      return false;
    }

    // Get threshold for this metric (default to 20% if not specified)
    const threshold = this.thresholds[metric] || 20;

    // Calculate regression percentage
    const regressionPercent = ((currentValue - baseline) / baseline) * 100;

    // Check if the regression exceeds the threshold
    if (regressionPercent > threshold) {
      // Create an alert for the regression
      await this.createAlert({
        type: 'performance_regression',
        metric,
        current: currentValue,
        baseline,
        regression: regressionPercent,
        threshold,
        timestamp: Date.now(),
      } as Record<string, unknown>);

      return true;
    }

    return false;
  }

  /**
   * Create an alert for a regression
   * @param alertData Alert data
   */
  async createAlert(alertData: Record<string, unknown>) {
    // Track the regression event
    track('performance_regression_detected', alertData);

    // In a real implementation, you might also:
    // - Send an email alert
    // - Create a ticket in your issue tracker
    // - Send a Slack notification
    // - Log to a monitoring service

    // For now, we'll just log to console in development
    if (process.env.NODE_ENV === 'development') {
      const regression = alertData.regression as number;
      console.warn(
        `[REGRESSION] ${alertData.metric}: ${regression.toFixed(1)}% regression detected`,
        alertData
      );
    }

    return alertData;
  }

  /**
   * Reset stored metrics
   */
  reset() {
    this.metrics = {};
    return this;
  }
}
