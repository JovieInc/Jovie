/**
 * RegressionDetector Tests
 * Tests for the performance regression detection system
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@/lib/analytics';
import { RegressionDetector } from '@/lib/monitoring/regression';

describe('RegressionDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default thresholds', () => {
      const detector = new RegressionDetector();

      // Verify default thresholds are set by testing behavior
      // Add enough samples to establish a baseline
      for (let i = 0; i < 10; i++) {
        detector.addSample('lcp', 1000);
      }

      // A 30% regression should trigger (default is 20%)
      detector.addSample('lcp', 1300);

      expect(track).toHaveBeenCalledWith(
        'performance_regression_detected',
        expect.objectContaining({
          metric: 'lcp',
          type: 'performance_regression',
        })
      );
    });

    it('should accept custom thresholds', () => {
      const detector = new RegressionDetector({ custom: 50 });

      for (let i = 0; i < 10; i++) {
        detector.addSample('custom', 100);
      }

      // 40% regression should not trigger with 50% threshold
      detector.addSample('custom', 140);

      expect(track).not.toHaveBeenCalled();

      // 60% regression should trigger
      detector.addSample('custom', 160);

      expect(track).toHaveBeenCalled();
    });

    it('should accept custom maxSamples', () => {
      const detector = new RegressionDetector({}, 5);

      // Add more than maxSamples
      for (let i = 0; i < 10; i++) {
        detector.addSample('test', 100);
      }

      // Historical data should only have 5 samples
      const historical = detector.getHistoricalData('test');
      expect(historical.length).toBe(5);
    });
  });

  describe('addSample', () => {
    it('should add samples to the metrics store', () => {
      const detector = new RegressionDetector();

      detector.addSample('test', 100);
      detector.addSample('test', 200);

      const historical = detector.getHistoricalData('test');
      expect(historical).toEqual([100, 200]);
    });

    it('should return self for chaining', () => {
      const detector = new RegressionDetector();

      const result = detector.addSample('test', 100);

      expect(result).toBe(detector);
    });

    it('should trim samples when exceeding maxSamples', () => {
      const detector = new RegressionDetector({}, 3);

      detector.addSample('test', 100);
      detector.addSample('test', 200);
      detector.addSample('test', 300);
      detector.addSample('test', 400);

      const historical = detector.getHistoricalData('test');
      expect(historical).toEqual([200, 300, 400]);
    });
  });

  describe('getHistoricalData', () => {
    it('should return empty array for unknown metrics', () => {
      const detector = new RegressionDetector();

      const historical = detector.getHistoricalData('unknown');

      expect(historical).toEqual([]);
    });

    it('should return all samples for a metric', () => {
      const detector = new RegressionDetector();

      detector.addSample('test', 100);
      detector.addSample('test', 200);
      detector.addSample('test', 300);

      const historical = detector.getHistoricalData('test');
      expect(historical).toEqual([100, 200, 300]);
    });
  });

  describe('calculateBaseline', () => {
    it('should return 0 for empty data', () => {
      const detector = new RegressionDetector();

      const baseline = detector.calculateBaseline([]);

      expect(baseline).toBe(0);
    });

    it('should calculate trimmed mean', () => {
      const detector = new RegressionDetector();

      // With 10 samples, it trims 1 from each end (10%)
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const baseline = detector.calculateBaseline(data);

      // Trimmed: [20, 30, 40, 50, 60, 70, 80, 90]
      // Mean: (20+30+40+50+60+70+80+90) / 8 = 55
      expect(baseline).toBe(55);
    });

    it('should handle small datasets - returns 0 when trimmed array is empty', () => {
      const detector = new RegressionDetector();

      const data = [100, 200];
      const baseline = detector.calculateBaseline(data);

      // With very small datasets (2 items), trimming 10% from each end
      // results in an empty array, so it returns 0
      expect(baseline).toBe(0);
    });

    it('should handle medium datasets that still have data after trimming', () => {
      const detector = new RegressionDetector();

      // With 5 items, trim 1 from each end
      const data = [10, 20, 30, 40, 50];
      const baseline = detector.calculateBaseline(data);

      // Trimmed: [20, 30, 40] => mean = 30
      expect(baseline).toBe(30);
    });
  });

  describe('detectRegression', () => {
    it('should not detect regression with insufficient samples', async () => {
      const detector = new RegressionDetector();

      // Only 3 samples, need at least 5
      detector.addSample('test', 100);
      detector.addSample('test', 100);
      detector.addSample('test', 100);

      vi.clearAllMocks();

      const result = await detector.detectRegression('test', 150);

      expect(result).toBe(false);
      expect(track).not.toHaveBeenCalled();
    });

    it('should detect regression when value exceeds threshold', async () => {
      const detector = new RegressionDetector({ test: 20 });

      // Add 10 samples to establish baseline
      for (let i = 0; i < 10; i++) {
        detector.addSample('test', 100);
      }

      vi.clearAllMocks();

      const result = await detector.detectRegression('test', 130);

      expect(result).toBe(true);
      expect(track).toHaveBeenCalledWith(
        'performance_regression_detected',
        expect.objectContaining({
          type: 'performance_regression',
          metric: 'test',
          current: 130,
          threshold: 20,
        })
      );
    });

    it('should not detect regression within threshold', async () => {
      const detector = new RegressionDetector({ test: 20 });

      for (let i = 0; i < 10; i++) {
        detector.addSample('test', 100);
      }

      vi.clearAllMocks();

      const result = await detector.detectRegression('test', 115);

      expect(result).toBe(false);
      expect(track).not.toHaveBeenCalled();
    });

    it('should use default 20% threshold for unknown metrics', async () => {
      const detector = new RegressionDetector();

      for (let i = 0; i < 10; i++) {
        detector.addSample('unknown', 100);
      }

      vi.clearAllMocks();

      // 25% regression should trigger default 20% threshold
      const result = await detector.detectRegression('unknown', 125);

      expect(result).toBe(true);
    });

    it('should handle zero baseline gracefully', async () => {
      const detector = new RegressionDetector();

      for (let i = 0; i < 10; i++) {
        detector.addSample('test', 0);
      }

      vi.clearAllMocks();

      const result = await detector.detectRegression('test', 100);

      // Should not crash and should return false (baseline too small)
      expect(result).toBe(false);
    });
  });

  describe('createAlert', () => {
    it('should track regression event', async () => {
      const detector = new RegressionDetector();

      const alertData = {
        type: 'performance_regression',
        metric: 'test',
        current: 150,
        baseline: 100,
        regression: 50,
        threshold: 20,
        timestamp: Date.now(),
      };

      await detector.createAlert(alertData);

      expect(track).toHaveBeenCalledWith(
        'performance_regression_detected',
        alertData
      );
    });

    it('should return the alert data', async () => {
      const detector = new RegressionDetector();

      const alertData = {
        type: 'performance_regression',
        metric: 'test',
        regression: 50,
      };

      const result = await detector.createAlert(alertData);

      expect(result).toEqual(alertData);
    });
  });

  describe('reset', () => {
    it('should clear all stored metrics', () => {
      const detector = new RegressionDetector();

      detector.addSample('test1', 100);
      detector.addSample('test2', 200);

      detector.reset();

      expect(detector.getHistoricalData('test1')).toEqual([]);
      expect(detector.getHistoricalData('test2')).toEqual([]);
    });

    it('should return self for chaining', () => {
      const detector = new RegressionDetector();

      const result = detector.reset();

      expect(result).toBe(detector);
    });
  });
});
