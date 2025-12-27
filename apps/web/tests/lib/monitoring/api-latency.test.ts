/**
 * API Latency Collector Tests
 * Tests for the API latency collector and integration with PerformanceAlerts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@/lib/analytics';
import {
  type HttpMethod,
  type Metric,
  PerformanceAlerts,
} from '@/lib/monitoring/alerts';
import {
  ApiLatencyCollector,
  type ApiLatencyCollectorOptions,
  type ApiLatencySample,
  collectApiLatencyFromResponse,
  createApiLatencyMetric,
} from '@/lib/monitoring/api-latency';

describe('ApiLatencyCollector', () => {
  let alerts: PerformanceAlerts;
  let collector: ApiLatencyCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    alerts = new PerformanceAlerts([]).addApiLatencyRules();
  });

  afterEach(() => {
    if (collector) {
      collector.dispose();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      collector = new ApiLatencyCollector(alerts);
      expect(collector.getBufferSize()).toBe(0);
    });

    it('should accept custom options', () => {
      const options: ApiLatencyCollectorOptions = {
        maxBufferSize: 50,
        flushInterval: 5000,
        autoCheckThresholds: false,
      };
      collector = new ApiLatencyCollector(alerts, options);
      expect(collector.getBufferSize()).toBe(0);
    });

    it('should start flush timer when flushInterval > 0', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 5000 });

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      expect(collector.getBufferSize()).toBe(1);

      // Advance time to trigger auto-flush
      vi.advanceTimersByTime(5000);

      expect(collector.getBufferSize()).toBe(0);
    });

    it('should not start flush timer when flushInterval is 0', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      // Advance time well past default interval
      vi.advanceTimersByTime(20000);

      // Buffer should still have the metric
      expect(collector.getBufferSize()).toBe(1);
    });
  });

  describe('record', () => {
    it('should add a metric to the buffer', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const sample: ApiLatencySample = {
        endpoint: '/api/users',
        method: 'GET',
        duration: 250,
        statusCode: 200,
      };

      collector.record(sample);

      expect(collector.getBufferSize()).toBe(1);
    });

    it('should return self for method chaining', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const result = collector.record({
        endpoint: '/api/users',
        method: 'GET',
        duration: 250,
        statusCode: 200,
      });

      expect(result).toBe(collector);
    });

    it('should create metric with correct properties', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const sample: ApiLatencySample = {
        endpoint: '/api/users',
        method: 'POST',
        duration: 350,
        statusCode: 201,
      };

      collector.record(sample);

      const buffered = collector.getBufferedMetrics();
      expect(buffered).toHaveLength(1);
      expect(buffered[0]).toMatchObject({
        name: 'api_latency',
        value: 350,
        endpoint: '/api/users',
        method: 'POST',
        status_code: 201,
      });
      expect(buffered[0].timestamp).toBeDefined();
    });

    it('should use provided timestamp when specified', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const customTimestamp = Date.now() - 5000;
      collector.record({
        endpoint: '/api/users',
        method: 'GET',
        duration: 250,
        statusCode: 200,
        timestamp: customTimestamp,
      });

      const buffered = collector.getBufferedMetrics();
      expect(buffered[0].timestamp).toBe(customTimestamp);
    });

    it('should auto-flush when buffer reaches maxBufferSize', () => {
      collector = new ApiLatencyCollector(alerts, {
        maxBufferSize: 3,
        flushInterval: 0,
        autoCheckThresholds: false,
      });

      collector.record({
        endpoint: '/api/test1',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });
      expect(collector.getBufferSize()).toBe(1);

      collector.record({
        endpoint: '/api/test2',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });
      expect(collector.getBufferSize()).toBe(2);

      // This should trigger auto-flush
      collector.record({
        endpoint: '/api/test3',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });
      expect(collector.getBufferSize()).toBe(0);
    });
  });

  describe('recordBatch', () => {
    it('should add multiple metrics to the buffer', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const samples: ApiLatencySample[] = [
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 100,
          statusCode: 200,
        },
        {
          endpoint: '/api/posts',
          method: 'GET',
          duration: 150,
          statusCode: 200,
        },
        {
          endpoint: '/api/auth',
          method: 'POST',
          duration: 200,
          statusCode: 200,
        },
      ];

      collector.recordBatch(samples);

      expect(collector.getBufferSize()).toBe(3);
    });

    it('should return self for method chaining', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const result = collector.recordBatch([
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 100,
          statusCode: 200,
        },
      ]);

      expect(result).toBe(collector);
    });

    it('should auto-flush during batch if buffer fills up', () => {
      collector = new ApiLatencyCollector(alerts, {
        maxBufferSize: 2,
        flushInterval: 0,
        autoCheckThresholds: false,
      });

      const samples: ApiLatencySample[] = [
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 100,
          statusCode: 200,
        },
        {
          endpoint: '/api/posts',
          method: 'GET',
          duration: 150,
          statusCode: 200,
        },
        {
          endpoint: '/api/auth',
          method: 'POST',
          duration: 200,
          statusCode: 200,
        },
      ];

      collector.recordBatch(samples);

      // First two should trigger flush, third should be in buffer
      expect(collector.getBufferSize()).toBe(1);
    });
  });

  describe('flush', () => {
    it('should return and clear buffered metrics', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: false,
      });

      collector.record({
        endpoint: '/api/users',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      const flushed = collector.flush();

      expect(flushed).toHaveLength(1);
      expect(collector.getBufferSize()).toBe(0);
    });

    it('should check thresholds when autoCheckThresholds is true', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      // Record a slow request that exceeds warning threshold (>500ms)
      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      collector.flush();

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 500,
          severity: 'warning',
        })
      );
    });

    it('should not check thresholds when autoCheckThresholds is false', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: false,
      });

      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      collector.flush();

      expect(track).not.toHaveBeenCalled();
    });

    it('should override autoCheckThresholds with checkThresholds parameter', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: false,
      });

      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      // Override default to check thresholds
      collector.flush(true);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
        })
      );
    });

    it('should skip threshold check when buffer is empty', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.flush();

      expect(track).not.toHaveBeenCalled();
    });

    it('should return empty array when buffer is empty', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const flushed = collector.flush();

      expect(flushed).toEqual([]);
    });
  });

  describe('getBufferSize', () => {
    it('should return correct buffer size', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      expect(collector.getBufferSize()).toBe(0);

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      expect(collector.getBufferSize()).toBe(1);

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      expect(collector.getBufferSize()).toBe(2);
    });
  });

  describe('getBufferedMetrics', () => {
    it('should return a copy of buffered metrics', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      collector.record({
        endpoint: '/api/users',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      const buffered = collector.getBufferedMetrics();

      // Modifying the returned array should not affect internal buffer
      buffered.push({} as Metric);

      expect(collector.getBufferSize()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear the buffer without checking thresholds', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      collector.clear();

      expect(collector.getBufferSize()).toBe(0);
      expect(track).not.toHaveBeenCalled();
    });

    it('should return self for method chaining', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 0 });

      const result = collector.clear();

      expect(result).toBe(collector);
    });
  });

  describe('stopFlushTimer', () => {
    it('should stop the automatic flush timer', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 5000 });

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      collector.stopFlushTimer();

      // Advance time past flush interval
      vi.advanceTimersByTime(10000);

      // Buffer should still have the metric
      expect(collector.getBufferSize()).toBe(1);
    });

    it('should be safe to call multiple times', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 5000 });

      expect(() => {
        collector.stopFlushTimer();
        collector.stopFlushTimer();
        collector.stopFlushTimer();
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should flush remaining metrics and stop timer', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 5000,
        autoCheckThresholds: false,
      });

      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      collector.dispose();

      expect(collector.getBufferSize()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      collector = new ApiLatencyCollector(alerts, { flushInterval: 5000 });

      expect(() => {
        collector.dispose();
        collector.dispose();
      }).not.toThrow();
    });
  });

  describe('automatic flush timer', () => {
    it('should flush only when buffer is not empty', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 1000,
        autoCheckThresholds: false,
      });

      // Advance time multiple times with empty buffer
      vi.advanceTimersByTime(5000);

      // Add a metric
      collector.record({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      expect(collector.getBufferSize()).toBe(1);

      // Wait for flush
      vi.advanceTimersByTime(1000);

      expect(collector.getBufferSize()).toBe(0);
    });

    it('should continue flushing on each interval', () => {
      const flushCount = 0;
      const originalFlush = ApiLatencyCollector.prototype.flush;

      // Spy on flush calls
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 1000,
        autoCheckThresholds: false,
      });

      // Record and wait for flush
      collector.record({
        endpoint: '/api/test1',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });
      vi.advanceTimersByTime(1000);

      collector.record({
        endpoint: '/api/test2',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });
      vi.advanceTimersByTime(1000);

      // Both should have been flushed
      expect(collector.getBufferSize()).toBe(0);
    });
  });
});

describe('createApiLatencyMetric', () => {
  it('should create a metric with correct structure', () => {
    const metric = createApiLatencyMetric('/api/users', 'GET', 250, 200);

    expect(metric).toMatchObject({
      name: 'api_latency',
      value: 250,
      endpoint: '/api/users',
      method: 'GET',
      status_code: 200,
    });
    expect(metric.timestamp).toBeDefined();
  });

  it('should support all HTTP methods', () => {
    const methods: HttpMethod[] = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ];

    methods.forEach(method => {
      const metric = createApiLatencyMetric('/api/test', method, 100, 200);
      expect(metric.method).toBe(method);
    });
  });

  it('should support various status codes', () => {
    const statusCodes = [200, 201, 204, 400, 401, 403, 404, 500, 502, 503];

    statusCodes.forEach(statusCode => {
      const metric = createApiLatencyMetric(
        '/api/test',
        'GET',
        100,
        statusCode
      );
      expect(metric.status_code).toBe(statusCode);
    });
  });
});

describe('collectApiLatencyFromResponse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate duration from start time', () => {
    const startTime = Date.now();

    // Advance time by 350ms
    vi.advanceTimersByTime(350);

    const metric = collectApiLatencyFromResponse(
      '/api/users',
      'GET',
      startTime,
      { status: 200 }
    );

    expect(metric.value).toBe(350);
  });

  it('should extract status from response object', () => {
    const startTime = Date.now();

    const metric = collectApiLatencyFromResponse(
      '/api/auth',
      'POST',
      startTime,
      { status: 401 }
    );

    expect(metric.status_code).toBe(401);
  });

  it('should create valid metric structure', () => {
    const startTime = Date.now();

    vi.advanceTimersByTime(100);

    const metric = collectApiLatencyFromResponse(
      '/api/posts',
      'PUT',
      startTime,
      { status: 200 }
    );

    expect(metric).toMatchObject({
      name: 'api_latency',
      endpoint: '/api/posts',
      method: 'PUT',
    });
  });

  it('should work with minimal response object', () => {
    const startTime = Date.now();

    const response = { status: 204 };
    const metric = collectApiLatencyFromResponse(
      '/api/items/1',
      'DELETE',
      startTime,
      response
    );

    expect(metric.status_code).toBe(204);
  });
});

describe('Integration with PerformanceAlerts', () => {
  let alerts: PerformanceAlerts;
  let collector: ApiLatencyCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    alerts = new PerformanceAlerts([]).addApiLatencyRules();
  });

  afterEach(() => {
    if (collector) {
      collector.dispose();
    }
    vi.useRealTimers();
  });

  describe('threshold alerting', () => {
    it('should trigger warning alert for latency > 500ms', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      collector.flush();

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 500,
          severity: 'warning',
          endpoint: '/api/slow',
          method: 'GET',
          status_code: 200,
        })
      );
    });

    it('should trigger error alert for latency > 2000ms', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/very-slow',
        method: 'POST',
        duration: 2500,
        statusCode: 200,
      });

      collector.flush();

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 2000,
          severity: 'error',
        })
      );
    });

    it('should trigger critical alert for latency > 5000ms', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/timeout',
        method: 'GET',
        duration: 6000,
        statusCode: 504,
      });

      collector.flush();

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 5000,
          severity: 'critical',
        })
      );
    });

    it('should trigger all applicable thresholds for very slow requests', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/extremely-slow',
        method: 'GET',
        duration: 8000,
        statusCode: 200,
      });

      collector.flush();

      // Should trigger warning, error, and critical
      expect(track).toHaveBeenCalledTimes(3);
    });

    it('should not trigger alert for fast requests', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/fast',
        method: 'GET',
        duration: 100,
        statusCode: 200,
      });

      collector.flush();

      expect(track).not.toHaveBeenCalled();
    });
  });

  describe('metric collection flow', () => {
    it('should correctly flow from sample to alert', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      // Simulate multiple requests to same endpoint
      const samples: ApiLatencySample[] = [
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 450,
          statusCode: 200,
        },
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 550,
          statusCode: 200,
        },
        {
          endpoint: '/api/users',
          method: 'GET',
          duration: 600,
          statusCode: 200,
        },
      ];

      collector.recordBatch(samples);
      collector.flush();

      // Average is 533ms, which exceeds 500ms threshold
      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 500,
          severity: 'warning',
        })
      );
    });

    it('should handle mixed endpoints in batch', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      // Note: PerformanceAlerts averages metrics by name, so both samples
      // contribute to the average. With 100 + 1100 = 600ms average, alert triggers.
      const samples: ApiLatencySample[] = [
        {
          endpoint: '/api/fast',
          method: 'GET',
          duration: 100,
          statusCode: 200,
        },
        {
          endpoint: '/api/slow',
          method: 'POST',
          duration: 1100,
          statusCode: 201,
        },
      ];

      collector.recordBatch(samples);
      collector.flush();

      // Alert should trigger based on average (600ms > 500ms threshold)
      // The most recent metric's endpoint info is included in the alert
      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          threshold: 500,
          severity: 'warning',
        })
      );
    });

    it('should integrate with createApiLatencyMetric utility', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      const metric = createApiLatencyMetric('/api/test', 'GET', 750, 200);

      // Convert metric to sample format
      collector.record({
        endpoint: metric.endpoint!,
        method: metric.method!,
        duration: metric.value,
        statusCode: metric.status_code!,
        timestamp: metric.timestamp,
      });

      collector.flush();

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
          endpoint: '/api/test',
        })
      );
    });

    it('should respect cooldown between alerts for same endpoint', () => {
      // Use a short cooldown for testing
      const alertsWithCooldown = new PerformanceAlerts([], 1000);
      alertsWithCooldown.addApiLatencyRules();

      collector = new ApiLatencyCollector(alertsWithCooldown, {
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      // First slow request
      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });
      collector.flush();

      expect(track).toHaveBeenCalledTimes(1);

      // Second slow request within cooldown
      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });
      collector.flush();

      // Should still be 1 call due to cooldown
      expect(track).toHaveBeenCalledTimes(1);

      // Different endpoint should trigger
      collector.record({
        endpoint: '/api/other',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });
      collector.flush();

      expect(track).toHaveBeenCalledTimes(2);
    });
  });

  describe('automatic flushing with alerts', () => {
    it('should check thresholds on auto-flush', () => {
      collector = new ApiLatencyCollector(alerts, {
        flushInterval: 1000,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/slow',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      // Trigger auto-flush
      vi.advanceTimersByTime(1000);

      expect(track).toHaveBeenCalledWith(
        'performance_alert',
        expect.objectContaining({
          metric: 'api_latency',
        })
      );
    });

    it('should check thresholds on buffer full auto-flush', () => {
      collector = new ApiLatencyCollector(alerts, {
        maxBufferSize: 2,
        flushInterval: 0,
        autoCheckThresholds: true,
      });

      collector.record({
        endpoint: '/api/slow1',
        method: 'GET',
        duration: 600,
        statusCode: 200,
      });

      collector.record({
        endpoint: '/api/slow2',
        method: 'GET',
        duration: 700,
        statusCode: 200,
      });

      // Auto-flush should have triggered and checked thresholds
      expect(track).toHaveBeenCalled();
    });
  });
});
