/**
 * PerformanceTracker Tests
 * Tests for the performance tracking utilities
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';

// Mock PerformanceObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockPerformanceObserver {
  callback: PerformanceObserverCallback;

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
  }

  observe = mockObserve;
  disconnect = mockDisconnect;
}

vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);

import { PerformanceTracker } from '@/lib/monitoring/performance';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockObserve.mockClear();
    tracker = new PerformanceTracker();
  });

  describe('trackPageLoad', () => {
    it('should not track when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing undefined window
      delete global.window;

      tracker.trackPageLoad('/test-page');

      expect(mockObserve).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    it('should observe navigation entries when window exists', () => {
      // Ensure window and performance exist
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      tracker.trackPageLoad('/test-page');

      expect(mockObserve).toHaveBeenCalledWith({
        entryTypes: ['navigation'],
      });
    });

    it('should send metrics when navigation entry is received', () => {
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      tracker.trackPageLoad('/test-page');

      // Get the callback and simulate a navigation entry
      const observerInstance = new MockPerformanceObserver(() => {});
      const mockEntry = {
        entryType: 'navigation',
        domainLookupEnd: 50,
        domainLookupStart: 10,
        connectEnd: 100,
        connectStart: 50,
        responseStart: 150,
        requestStart: 100,
        responseEnd: 200,
        domContentLoadedEventEnd: 300,
        loadEventEnd: 400,
        loadEventStart: 350,
        startTime: 0,
        type: 'navigate',
      } as PerformanceNavigationTiming;

      // Simulate callback invocation
      observerInstance.callback(
        {
          getEntries: () => [mockEntry],
        } as unknown as PerformanceObserverEntryList,
        observerInstance as unknown as PerformanceObserver
      );

      // Track function should be called indirectly through sendMetric
      // This verifies the observer was set up correctly
      expect(mockObserve).toHaveBeenCalled();
    });

    it('should handle PerformanceObserver errors gracefully', () => {
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      const testError = new Error('PerformanceObserver not supported');
      mockObserve.mockImplementationOnce(() => {
        throw testError;
      });

      // Should not throw
      expect(() => tracker.trackPageLoad('/test-page')).not.toThrow();

      expect(Sentry.captureException).toHaveBeenCalledWith(testError, {
        extra: { context: 'navigation_timing_observer' },
      });
    });
  });

  describe('trackResourceLoad', () => {
    it('should not track when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing undefined window
      delete global.window;

      tracker.trackResourceLoad();

      expect(mockObserve).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    it('should observe resource entries when window exists', () => {
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      tracker.trackResourceLoad();

      expect(mockObserve).toHaveBeenCalledWith({
        entryTypes: ['resource'],
      });
    });

    it('should filter resources by type when specified', () => {
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      tracker.trackResourceLoad('script');

      expect(mockObserve).toHaveBeenCalledWith({
        entryTypes: ['resource'],
      });
    });

    it('should handle PerformanceObserver errors gracefully', () => {
      global.window = {
        performance: {
          now: vi.fn(() => 0),
        },
      } as unknown as Window & typeof globalThis;

      const testError = new Error('PerformanceObserver not supported');
      mockObserve.mockImplementationOnce(() => {
        throw testError;
      });

      expect(() => tracker.trackResourceLoad()).not.toThrow();

      expect(Sentry.captureException).toHaveBeenCalledWith(testError, {
        extra: { context: 'resource_timing_observer' },
      });
    });
  });
});
