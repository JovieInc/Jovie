/**
 * Web Vitals Tests
 * Tests for web vitals tracking and rating functions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock web-vitals
vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { track } from '@/lib/analytics';
import {
  initWebVitals,
  trackPerformanceExperiment,
} from '@/lib/monitoring/web-vitals';

describe('Web Vitals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the global initialization state so each test starts fresh
    globalThis.jovieWebVitalsInitialized = false;
    globalThis.jovieWebVitalsHandlers = undefined;
  });

  describe('initWebVitals', () => {
    it('should initialize all core web vitals listeners', () => {
      initWebVitals();

      expect(onCLS).toHaveBeenCalled();
      expect(onFCP).toHaveBeenCalled();
      expect(onINP).toHaveBeenCalled();
      expect(onLCP).toHaveBeenCalled();
      expect(onTTFB).toHaveBeenCalled();
    });

    it('should call custom handler when metric is received', () => {
      const customHandler = vi.fn();

      initWebVitals(customHandler);

      // Simulate a metric being reported
      const mockMetric = {
        name: 'LCP',
        value: 2000,
        delta: 2000,
        id: 'v1-123',
        navigationType: 'navigate',
      };

      // Get the callback passed to onLCP and call it
      const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
      lcpCallback(mockMetric as any);

      expect(customHandler).toHaveBeenCalledWith(mockMetric);
    });

    it('should send metrics to analytics', () => {
      initWebVitals();

      const mockMetric = {
        name: 'LCP',
        value: 2000,
        delta: 2000,
        id: 'v1-123',
        navigationType: 'navigate',
      };

      const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
      lcpCallback(mockMetric as any);

      expect(track).toHaveBeenCalledWith(
        'web_vital_lcp',
        expect.objectContaining({
          name: 'lcp',
          value: 2000,
          delta: 2000,
          id: 'v1-123',
          rating: 'good', // 2000ms LCP is "good"
        })
      );
    });
  });

  describe('getRating (internal function tested via initWebVitals)', () => {
    describe('CLS ratings', () => {
      it('should rate CLS <= 0.1 as good', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'CLS',
          value: 0.05,
          delta: 0.05,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const clsCallback = vi.mocked(onCLS).mock.calls[0][0];
        clsCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_cls',
          expect.objectContaining({ rating: 'good' })
        );
      });

      it('should rate CLS > 0.1 and <= 0.25 as needs-improvement', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'CLS',
          value: 0.15,
          delta: 0.15,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const clsCallback = vi.mocked(onCLS).mock.calls[0][0];
        clsCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_cls',
          expect.objectContaining({ rating: 'needs-improvement' })
        );
      });

      it('should rate CLS > 0.25 as poor', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'CLS',
          value: 0.5,
          delta: 0.5,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const clsCallback = vi.mocked(onCLS).mock.calls[0][0];
        clsCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_cls',
          expect.objectContaining({ rating: 'poor' })
        );
      });
    });

    describe('LCP ratings', () => {
      it('should rate LCP <= 2500ms as good', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'LCP',
          value: 2000,
          delta: 2000,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
        lcpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_lcp',
          expect.objectContaining({ rating: 'good' })
        );
      });

      it('should rate LCP > 2500ms and <= 4000ms as needs-improvement', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'LCP',
          value: 3000,
          delta: 3000,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
        lcpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_lcp',
          expect.objectContaining({ rating: 'needs-improvement' })
        );
      });

      it('should rate LCP > 4000ms as poor', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'LCP',
          value: 5000,
          delta: 5000,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
        lcpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_lcp',
          expect.objectContaining({ rating: 'poor' })
        );
      });
    });

    describe('INP ratings', () => {
      it('should rate INP <= 200ms as good', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'INP',
          value: 100,
          delta: 100,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const inpCallback = vi.mocked(onINP).mock.calls[0][0];
        inpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_inp',
          expect.objectContaining({ rating: 'good' })
        );
      });

      it('should rate INP > 200ms and <= 500ms as needs-improvement', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'INP',
          value: 300,
          delta: 300,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const inpCallback = vi.mocked(onINP).mock.calls[0][0];
        inpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_inp',
          expect.objectContaining({ rating: 'needs-improvement' })
        );
      });

      it('should rate INP > 500ms as poor', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'INP',
          value: 600,
          delta: 600,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const inpCallback = vi.mocked(onINP).mock.calls[0][0];
        inpCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_inp',
          expect.objectContaining({ rating: 'poor' })
        );
      });
    });

    describe('TTFB ratings', () => {
      it('should rate TTFB <= 800ms as good', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'TTFB',
          value: 500,
          delta: 500,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const ttfbCallback = vi.mocked(onTTFB).mock.calls[0][0];
        ttfbCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_ttfb',
          expect.objectContaining({ rating: 'good' })
        );
      });

      it('should rate TTFB > 800ms and <= 1800ms as needs-improvement', () => {
        vi.clearAllMocks();
        initWebVitals();

        const mockMetric = {
          name: 'TTFB',
          value: 1000,
          delta: 1000,
          id: 'test-id',
          navigationType: 'navigate',
        };

        const ttfbCallback = vi.mocked(onTTFB).mock.calls[0][0];
        ttfbCallback(mockMetric as any);

        expect(track).toHaveBeenCalledWith(
          'web_vital_ttfb',
          expect.objectContaining({ rating: 'needs-improvement' })
        );
      });
    });
  });

  describe('trackPerformanceExperiment', () => {
    it('should initialize web vitals with experiment context', () => {
      trackPerformanceExperiment('new_feature', 'variant_a');

      expect(onCLS).toHaveBeenCalled();
      expect(onLCP).toHaveBeenCalled();
    });

    it('should include experiment name in metric tracking', () => {
      trackPerformanceExperiment('new_feature', 'variant_a');

      const mockMetric = {
        name: 'LCP',
        value: 2000,
        delta: 2000,
        id: 'v1-123',
        navigationType: 'navigate',
      };

      const lcpCallback = vi.mocked(onLCP).mock.calls[0][0];
      lcpCallback(mockMetric as any);

      // The metric name should be modified to include experiment
      expect(track).toHaveBeenCalledWith(
        expect.stringContaining('web_vital_'),
        expect.objectContaining({
          id: expect.stringContaining('variant_a'),
        })
      );
    });
  });
});
