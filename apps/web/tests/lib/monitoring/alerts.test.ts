/**
 * PerformanceAlerts Tests
 * Tests for the performance alerting system
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@/lib/analytics';
import {
  type AlertRule,
  type Metric,
  PerformanceAlerts,
} from '@/lib/monitoring/alerts';

describe('PerformanceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default Core Web Vitals rules when no rules provided', () => {
      const alerts = new PerformanceAlerts();
      // Access private rules through checkThresholds behavior
      const metrics: Metric[] = [
        { name: 'lcp', value: 5000, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      // Should trigger an alert for LCP > 4000 (error threshold)
      expect(track).toHaveBeenCalled();
    });

    it('should initialize with custom rules when provided', () => {
      const customRules: AlertRule[] = [
        { metric: 'custom', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(customRules);

      const metrics: Metric[] = [
        { name: 'custom', value: 150, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'custom',
          threshold: 100,
          severity: 'warning',
        })
      );
    });

    it('should respect custom cooldown period', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 50, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules, 1000); // 1 second cooldown

      const metrics: Metric[] = [
        { name: 'test', value: 100, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);
      expect(track).toHaveBeenCalledTimes(1);

      // Second check within cooldown should not trigger alert
      alerts.checkThresholds(metrics);
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  describe('addCoreWebVitalsRules', () => {
    it('should add standard Core Web Vitals thresholds', () => {
      const alerts = new PerformanceAlerts([]);
      alerts.addCoreWebVitalsRules();

      // Test LCP warning threshold
      const lcpMetrics: Metric[] = [
        { name: 'lcp', value: 3000, timestamp: Date.now() },
      ];

      alerts.checkThresholds(lcpMetrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'lcp',
          severity: 'warning',
        })
      );
    });
  });

  describe('addRule', () => {
    it('should add a new rule and return self for chaining', () => {
      const alerts = new PerformanceAlerts([]);
      const result = alerts.addRule({
        metric: 'custom',
        threshold: 200,
        severity: 'error',
        description: 'Custom metric exceeded',
      });

      expect(result).toBe(alerts);

      const metrics: Metric[] = [
        { name: 'custom', value: 250, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'custom',
          threshold: 200,
          severity: 'error',
        })
      );
    });
  });

  describe('removeRule', () => {
    it('should remove a rule by metric and threshold', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 100, severity: 'warning' },
        { metric: 'test', threshold: 200, severity: 'error' },
      ];
      const alerts = new PerformanceAlerts(rules);

      alerts.removeRule('test', 100);

      const metrics: Metric[] = [
        { name: 'test', value: 150, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      // Should not trigger warning (rule removed), only if above error threshold
      expect(track).not.toHaveBeenCalled();
    });

    it('should return self for chaining', () => {
      const alerts = new PerformanceAlerts([
        { metric: 'test', threshold: 100, severity: 'warning' },
      ]);

      const result = alerts.removeRule('test', 100);
      expect(result).toBe(alerts);
    });
  });

  describe('checkThresholds', () => {
    it('should not trigger alerts when metrics are below threshold', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules);

      const metrics: Metric[] = [
        { name: 'test', value: 50, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).not.toHaveBeenCalled();
    });

    it('should trigger alerts when metrics exceed threshold', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules);

      const metrics: Metric[] = [
        { name: 'test', value: 150, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'test',
          threshold: 100,
          severity: 'warning',
        })
      );
    });

    it('should average recent metrics (up to 10)', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules);

      const now = Date.now();
      const metrics: Metric[] = [
        { name: 'test', value: 50, timestamp: now - 1000 },
        { name: 'test', value: 150, timestamp: now },
      ];

      // Average is 100, which is not > threshold
      alerts.checkThresholds(metrics);

      expect(track).not.toHaveBeenCalled();
    });

    it('should skip rules with no matching metrics', () => {
      const rules: AlertRule[] = [
        { metric: 'nonexistent', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules);

      const metrics: Metric[] = [
        { name: 'other', value: 150, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).not.toHaveBeenCalled();
    });

    it('should return self for chaining', () => {
      const alerts = new PerformanceAlerts([]);
      const result = alerts.checkThresholds([]);
      expect(result).toBe(alerts);
    });
  });

  describe('sendAlert', () => {
    it('should track the alert event', () => {
      const alerts = new PerformanceAlerts([]);

      const alertData = {
        metric: 'test',
        value: 150,
        threshold: 100,
        severity: 'warning' as const,
        timestamp: Date.now(),
      };

      alerts.sendAlert(alertData);

      expect(track).toHaveBeenCalledWith('performance_alert', alertData);
    });

    it('should return the alert data', () => {
      const alerts = new PerformanceAlerts([]);

      const alertData = {
        metric: 'test',
        value: 150,
        threshold: 100,
        severity: 'warning' as const,
        timestamp: Date.now(),
      };

      const result = alerts.sendAlert(alertData);

      expect(result).toEqual(alertData);
    });
  });

  describe('resetHistory', () => {
    it('should allow alerts to trigger again after reset', () => {
      const rules: AlertRule[] = [
        { metric: 'test', threshold: 100, severity: 'warning' },
      ];
      const alerts = new PerformanceAlerts(rules);

      const metrics: Metric[] = [
        { name: 'test', value: 150, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);
      expect(track).toHaveBeenCalledTimes(1);

      // Reset history
      alerts.resetHistory();

      // Should trigger again
      alerts.checkThresholds(metrics);
      expect(track).toHaveBeenCalledTimes(2);
    });

    it('should return self for chaining', () => {
      const alerts = new PerformanceAlerts([]);
      const result = alerts.resetHistory();
      expect(result).toBe(alerts);
    });
  });

  describe('Core Web Vitals thresholds', () => {
    it('should alert on poor LCP (> 4s)', () => {
      const alerts = new PerformanceAlerts();

      const metrics: Metric[] = [
        { name: 'lcp', value: 5000, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'lcp',
          severity: 'error',
        })
      );
    });

    it('should alert on poor CLS (> 0.25)', () => {
      const alerts = new PerformanceAlerts();

      const metrics: Metric[] = [
        { name: 'cls', value: 0.3, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'cls',
          severity: 'error',
        })
      );
    });

    it('should alert on poor FID (> 300ms)', () => {
      const alerts = new PerformanceAlerts();

      const metrics: Metric[] = [
        { name: 'fid', value: 400, timestamp: Date.now() },
      ];

      alerts.checkThresholds(metrics);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'fid',
          severity: 'error',
        })
      );
    });
  });
});
