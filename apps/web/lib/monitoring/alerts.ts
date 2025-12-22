'use client';

import { track } from '@/lib/analytics';

// Define alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

// Define alert rule interface
export interface AlertRule {
  metric: string;
  threshold: number;
  severity: AlertSeverity;
  description?: string;
}

// Define metric interface
export interface Metric {
  name: string;
  value: number;
  timestamp: number;
}

// Define alert data interface
export interface AlertData {
  metric: string;
  value: number;
  threshold: number;
  severity: AlertSeverity;
  timestamp: number;
  description?: string;
  samples?: number;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Performance Alerts class for monitoring and alerting on performance metrics
 */
export class PerformanceAlerts {
  private rules: AlertRule[] = [];
  private alertHistory: Record<string, number> = {}; // Track when alerts were last sent
  private cooldownPeriod: number = 3600000; // 1 hour cooldown by default

  /**
   * Create a new performance alerts instance
   * @param rules Initial alert rules
   * @param cooldownPeriod Cooldown period in milliseconds between repeated alerts
   */
  constructor(rules: AlertRule[] = [], cooldownPeriod: number = 3600000) {
    this.rules = rules;
    this.cooldownPeriod = cooldownPeriod;

    // Add default Core Web Vitals rules if none provided
    if (rules.length === 0) {
      this.addCoreWebVitalsRules();
    }
  }

  /**
   * Add Core Web Vitals rules with standard thresholds
   */
  addCoreWebVitalsRules() {
    this.rules = [
      // LCP (Largest Contentful Paint)
      {
        metric: 'lcp',
        threshold: 2500,
        severity: 'warning',
        description:
          'Largest Contentful Paint exceeds 2.5s (Google "Needs Improvement" threshold)',
      },
      {
        metric: 'lcp',
        threshold: 4000,
        severity: 'error',
        description:
          'Largest Contentful Paint exceeds 4s (Google "Poor" threshold)',
      },

      // FID (First Input Delay) - will be replaced by INP in the future
      {
        metric: 'fid',
        threshold: 100,
        severity: 'warning',
        description:
          'First Input Delay exceeds 100ms (Google "Needs Improvement" threshold)',
      },
      {
        metric: 'fid',
        threshold: 300,
        severity: 'error',
        description:
          'First Input Delay exceeds 300ms (Google "Poor" threshold)',
      },

      // CLS (Cumulative Layout Shift)
      {
        metric: 'cls',
        threshold: 0.1,
        severity: 'warning',
        description:
          'Cumulative Layout Shift exceeds 0.1 (Google "Needs Improvement" threshold)',
      },
      {
        metric: 'cls',
        threshold: 0.25,
        severity: 'error',
        description:
          'Cumulative Layout Shift exceeds 0.25 (Google "Poor" threshold)',
      },

      // FCP (First Contentful Paint)
      {
        metric: 'fcp',
        threshold: 1800,
        severity: 'warning',
        description:
          'First Contentful Paint exceeds 1.8s (Google "Needs Improvement" threshold)',
      },
      {
        metric: 'fcp',
        threshold: 3000,
        severity: 'error',
        description:
          'First Contentful Paint exceeds 3s (Google "Poor" threshold)',
      },

      // TTFB (Time to First Byte)
      {
        metric: 'ttfb',
        threshold: 800,
        severity: 'warning',
        description: 'Time to First Byte exceeds 800ms (recommended threshold)',
      },
      {
        metric: 'ttfb',
        threshold: 1800,
        severity: 'error',
        description:
          'Time to First Byte exceeds 1.8s (poor performance threshold)',
      },
    ];

    return this;
  }

  /**
   * Add a new alert rule
   * @param rule The alert rule to add
   */
  addRule(rule: AlertRule) {
    this.rules.push(rule);
    return this;
  }

  /**
   * Remove a rule by metric and threshold
   * @param metric The metric name
   * @param threshold The threshold value
   */
  removeRule(metric: string, threshold: number) {
    this.rules = this.rules.filter(
      rule => !(rule.metric === metric && rule.threshold === threshold)
    );
    return this;
  }

  /**
   * Check metrics against thresholds and trigger alerts
   * @param metrics Array of metrics to check
   */
  checkThresholds(metrics: Metric[]) {
    // Group metrics by name for easier processing
    const metricsByName: Record<string, Metric[]> = {};

    metrics.forEach(metric => {
      if (!metricsByName[metric.name]) {
        metricsByName[metric.name] = [];
      }
      metricsByName[metric.name].push(metric);
    });

    // Check each rule against the relevant metrics
    this.rules.forEach(rule => {
      const relevantMetrics = metricsByName[rule.metric] || [];

      // Skip if no metrics for this rule
      if (relevantMetrics.length === 0) {
        return;
      }

      // Get the most recent metrics (up to 10)
      const recentMetrics = relevantMetrics
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

      // Calculate the average value
      const sum = recentMetrics.reduce((acc, m) => acc + m.value, 0);
      const average = sum / recentMetrics.length;

      // Check if the average exceeds the threshold
      if (average > rule.threshold) {
        // Create a unique key for this alert
        const alertKey = `${rule.metric}_${rule.threshold}_${rule.severity}`;

        // Check if we're in the cooldown period
        const now = Date.now();
        const lastAlertTime = this.alertHistory[alertKey] || 0;

        if (now - lastAlertTime > this.cooldownPeriod) {
          // Send the alert
          this.sendAlert({
            metric: rule.metric,
            value: average,
            threshold: rule.threshold,
            severity: rule.severity,
            description: rule.description,
            timestamp: now,
            samples: recentMetrics.length,
          });

          // Update the alert history
          this.alertHistory[alertKey] = now;
        }
      }
    });

    return this;
  }

  /**
   * Send an alert
   * @param alertData Alert data
   */
  sendAlert(alertData: AlertData) {
    // Track the alert event
    track('performance_alert', alertData);

    // In a real implementation, you might also:
    // - Send an email alert
    // - Create a ticket in your issue tracker
    // - Send a Slack notification
    // - Log to a monitoring service

    // For now, we'll just log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[ALERT] ${alertData.severity.toUpperCase()}: ${alertData.metric} = ${alertData.value.toFixed(2)} (threshold: ${alertData.threshold})`,
        alertData
      );
    }

    return alertData;
  }

  /**
   * Reset alert history
   */
  resetHistory() {
    this.alertHistory = {};
    return this;
  }
}
