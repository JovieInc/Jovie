/**
 * API Latency Collector
 *
 * Utility for collecting API latency metrics and integrating them
 * with the PerformanceAlerts system for threshold-based alerting.
 */

import type { HttpMethod, Metric, PerformanceAlerts } from './alerts';

/**
 * Configuration options for the API latency collector
 */
export interface ApiLatencyCollectorOptions {
  /** Maximum number of metrics to buffer before auto-flushing (default: 100) */
  maxBufferSize?: number;
  /** Time in milliseconds before auto-flushing buffered metrics (default: 10000) */
  flushInterval?: number;
  /** Whether to automatically check thresholds on flush (default: true) */
  autoCheckThresholds?: boolean;
}

/**
 * Data structure for recording an API latency sample
 */
export interface ApiLatencySample {
  /** The API endpoint path (e.g., '/api/users') */
  endpoint: string;
  /** The HTTP method used */
  method: HttpMethod;
  /** The response time in milliseconds */
  duration: number;
  /** The HTTP status code */
  statusCode: number;
  /** Optional timestamp (defaults to Date.now()) */
  timestamp?: number;
}

/**
 * Default options for the collector
 */
const DEFAULT_OPTIONS: Required<ApiLatencyCollectorOptions> = {
  maxBufferSize: 100,
  flushInterval: 10000,
  autoCheckThresholds: true,
};

/**
 * API Latency Collector class
 *
 * Collects API latency metrics and feeds them to PerformanceAlerts
 * for threshold checking. Supports batching and automatic flushing.
 *
 * @example
 * ```typescript
 * const alerts = new PerformanceAlerts([]).addApiLatencyRules();
 * const collector = new ApiLatencyCollector(alerts);
 *
 * // Record a latency sample
 * collector.record({
 *   endpoint: '/api/users',
 *   method: 'GET',
 *   duration: 250,
 *   statusCode: 200,
 * });
 *
 * // Samples are automatically batched and flushed
 * // Or manually flush when needed
 * collector.flush();
 * ```
 */
export class ApiLatencyCollector {
  private alerts: PerformanceAlerts;
  private options: Required<ApiLatencyCollectorOptions>;
  private buffer: Metric[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new API latency collector
   * @param alerts The PerformanceAlerts instance to use for threshold checking
   * @param options Configuration options
   */
  constructor(
    alerts: PerformanceAlerts,
    options: ApiLatencyCollectorOptions = {}
  ) {
    this.alerts = alerts;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Start the flush interval timer
    if (this.options.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * Record an API latency sample
   * @param sample The latency sample to record
   * @returns this for method chaining
   */
  record(sample: ApiLatencySample): this {
    const metric: Metric = {
      name: 'api_latency',
      value: sample.duration,
      timestamp: sample.timestamp ?? Date.now(),
      endpoint: sample.endpoint,
      method: sample.method,
      status_code: sample.statusCode,
    };

    this.buffer.push(metric);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.options.maxBufferSize) {
      this.flush();
    }

    return this;
  }

  /**
   * Record multiple API latency samples at once
   * @param samples Array of latency samples to record
   * @returns this for method chaining
   */
  recordBatch(samples: ApiLatencySample[]): this {
    samples.forEach(sample => this.record(sample));
    return this;
  }

  /**
   * Flush the metric buffer and check thresholds
   * @param checkThresholds Override the autoCheckThresholds option for this flush
   * @returns The metrics that were flushed
   */
  flush(checkThresholds?: boolean): Metric[] {
    const metrics = [...this.buffer];
    this.buffer = [];

    const shouldCheck = checkThresholds ?? this.options.autoCheckThresholds;
    if (shouldCheck && metrics.length > 0) {
      this.alerts.checkThresholds(metrics);
    }

    return metrics;
  }

  /**
   * Get the current buffer size
   * @returns Number of metrics currently buffered
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get all buffered metrics without flushing
   * @returns Copy of the current metric buffer
   */
  getBufferedMetrics(): Metric[] {
    return [...this.buffer];
  }

  /**
   * Clear the buffer without checking thresholds
   * @returns this for method chaining
   */
  clear(): this {
    this.buffer = [];
    return this;
  }

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.options.flushInterval);
  }

  /**
   * Stop the automatic flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Dispose of the collector, flushing remaining metrics and stopping timers
   */
  dispose(): void {
    this.flush();
    this.stopFlushTimer();
  }
}

/**
 * Create a simple API latency metric from raw values
 * Utility function for quick metric creation without a collector
 *
 * @param endpoint The API endpoint path
 * @param method The HTTP method
 * @param duration Response time in milliseconds
 * @param statusCode HTTP status code
 * @returns A Metric object ready for threshold checking
 */
export function createApiLatencyMetric(
  endpoint: string,
  method: HttpMethod,
  duration: number,
  statusCode: number
): Metric {
  return {
    name: 'api_latency',
    value: duration,
    timestamp: Date.now(),
    endpoint,
    method,
    status_code: statusCode,
  };
}

/**
 * Collect API latency from a fetch-like response
 * Utility function for integrating with fetch API or similar
 *
 * @param endpoint The API endpoint path
 * @param method The HTTP method
 * @param startTime The timestamp when the request started (from Date.now())
 * @param response The response object (must have status property)
 * @returns A Metric object with the calculated duration
 */
export function collectApiLatencyFromResponse(
  endpoint: string,
  method: HttpMethod,
  startTime: number,
  response: { status: number }
): Metric {
  const duration = Date.now() - startTime;
  return createApiLatencyMetric(endpoint, method, duration, response.status);
}
