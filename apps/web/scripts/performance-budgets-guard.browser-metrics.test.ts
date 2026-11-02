import { runInNewContext } from 'node:vm';
import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectBrowserMetrics,
  PERF_INIT_SCRIPT,
} from './performance-budgets-guard';
import type { PerfTimingMetricName } from './performance-route-manifest';

interface LayoutShiftEntry {
  readonly hadRecentInput?: boolean;
  readonly startTime: number;
  readonly value: number;
}

interface BrowserMetrics {
  cls: number | null;
  fid: number | null;
  lcp: number | null;
}

const browserWindow = window as Window & {
  __perfBudgetMetrics?: BrowserMetrics;
};

function observeMetrics(unsupportedType?: string, throwsOnObserve?: string) {
  const callbacks = new Map<
    string,
    (list: { getEntries: () => readonly unknown[] }) => void
  >();
  const fixtureWindow = {} as { __perfBudgetMetrics: BrowserMetrics };
  class MockPerformanceObserver {
    static readonly supportedEntryTypes = [
      'largest-contentful-paint',
      'layout-shift',
      'first-input',
    ].filter(type => type !== unsupportedType);

    constructor(
      private readonly callback: (list: {
        getEntries: () => readonly unknown[];
      }) => void
    ) {}

    observe({ type }: { type: string }) {
      if (type === throwsOnObserve) throw new Error('Observer unavailable');
      callbacks.set(type, this.callback);
    }
  }

  runInNewContext(PERF_INIT_SCRIPT, {
    PerformanceObserver: MockPerformanceObserver,
    window: fixtureWindow,
  });
  return {
    metrics: fixtureWindow.__perfBudgetMetrics,
    emit: (type: string, entries: readonly unknown[]) => {
      callbacks.get(type)?.({ getEntries: () => entries });
    },
    shift: (...entries: LayoutShiftEntry[]) => {
      callbacks.get('layout-shift')?.({ getEntries: () => entries });
    },
  };
}

function browserPage({
  metrics,
  fcp = 80,
  responseStart = 30,
}: {
  metrics?: BrowserMetrics;
  fcp?: number | null;
  responseStart?: number | null;
}) {
  browserWindow.__perfBudgetMetrics = metrics;
  vi.stubGlobal('performance', {
    getEntriesByType: (type: string) => {
      if (type === 'navigation') {
        return responseStart === null ? [] : [{ responseStart }];
      }
      if (type === 'paint') {
        return fcp === null
          ? []
          : [{ name: 'first-contentful-paint', startTime: fcp }];
      }
      return [];
    },
  });
  return {
    evaluate: async (
      callback: (argument: unknown) => unknown,
      argument: unknown
    ) => callback(argument),
    mouse: { click: vi.fn().mockResolvedValue(undefined) },
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

const REQUIRED_METRICS: readonly PerfTimingMetricName[] = [
  'cumulative-layout-shift',
  'first-contentful-paint',
  'largest-contentful-paint',
  'time-to-first-byte',
];

afterEach(() => {
  delete browserWindow.__perfBudgetMetrics;
  vi.unstubAllGlobals();
});

describe('performance budget browser measurements', () => {
  it('reports the largest CLS session instead of summing separated sessions', () => {
    const observer = observeMetrics();
    observer.shift({ startTime: 100, value: 0.06 });
    observer.shift({ startTime: 2100, value: 0.04 });
    observer.shift({ startTime: 2200, value: 0.04 });
    expect(observer.metrics.cls).toBeCloseTo(0.08);
  });

  it('starts a new CLS session at a one-second gap', () => {
    const observer = observeMetrics();
    observer.shift(
      { startTime: 100, value: 0.03 },
      { startTime: 1099, value: 0.03 },
      { startTime: 2099, value: 0.05 }
    );
    expect(observer.metrics.cls).toBeCloseTo(0.06);
  });

  it('caps CLS sessions at five seconds even when every gap is short', () => {
    const observer = observeMetrics();
    observer.shift(
      ...[100, 1000, 1900, 2800, 3700, 4600, 5100].map(startTime => ({
        startTime,
        value: 0.01,
      }))
    );
    expect(observer.metrics.cls).toBeCloseTo(0.06);
  });

  it('does not let recent-input shifts increase or bridge CLS sessions', () => {
    const observer = observeMetrics();
    observer.shift(
      { startTime: 100, value: 0.03 },
      { startTime: 900, value: 0.4, hadRecentInput: true },
      { startTime: 1700, value: 0.04 }
    );
    expect(observer.metrics.cls).toBeCloseTo(0.04);
  });

  it('accepts an installed observer with zero shifts and no first input', async () => {
    const observer = observeMetrics('first-input');
    observer.emit('largest-contentful-paint', [
      { startTime: 200 },
      { startTime: 450 },
    ]);
    const result = await collectBrowserMetrics(
      browserPage({ metrics: observer.metrics }),
      false,
      REQUIRED_METRICS
    );
    expect(result.timingValues).toMatchObject({
      'cumulative-layout-shift': 0,
      'largest-contentful-paint': 450,
      'first-input-delay': 0,
    });
  });

  it('accepts a declared first-input delay measured as zero', async () => {
    const observer = observeMetrics();
    observer.emit('first-input', [{ startTime: 200, processingStart: 200 }]);
    await expect(
      collectBrowserMetrics(browserPage({ metrics: observer.metrics }), false, [
        'first-input-delay',
      ])
    ).resolves.toMatchObject({
      timingValues: { 'first-input-delay': 0 },
    });
  });

  it.each(['unsupported', 'no interaction'])(
    'rejects declared first-input delay with %s evidence',
    async reason => {
      const observer = observeMetrics(
        reason === 'unsupported' ? 'first-input' : undefined
      );
      await expect(
        collectBrowserMetrics(
          browserPage({ metrics: observer.metrics }),
          false,
          ['first-input-delay']
        )
      ).rejects.toThrow('first-input-delay');
    }
  );

  it.each(['unsupported', 'registration failure'])(
    'rejects missing CLS instrumentation after %s',
    async reason => {
      const observer = observeMetrics(
        reason === 'unsupported' ? 'layout-shift' : undefined,
        reason === 'registration failure' ? 'layout-shift' : undefined
      );
      observer.emit('largest-contentful-paint', [{ startTime: 200 }]);
      await expect(
        collectBrowserMetrics(
          browserPage({ metrics: observer.metrics }),
          false,
          REQUIRED_METRICS
        )
      ).rejects.toThrow('cumulative-layout-shift');
    }
  );

  it('rejects a page where the init script never installed', async () => {
    await expect(
      collectBrowserMetrics(browserPage({}), false, REQUIRED_METRICS)
    ).rejects.toThrow('cumulative-layout-shift');
  });

  it('rejects an installed LCP observer that has not reported a paint', async () => {
    const observer = observeMetrics();
    await expect(
      collectBrowserMetrics(
        browserPage({ metrics: observer.metrics }),
        false,
        REQUIRED_METRICS
      )
    ).rejects.toThrow('largest-contentful-paint');
  });

  it.each([
    ['first-contentful-paint', { fcp: null }],
    ['time-to-first-byte', { responseStart: null }],
  ] as const)('rejects an absent %s entry', async (metric, missingEntry) => {
    await expect(
      collectBrowserMetrics(
        browserPage({ metrics: { cls: 0, lcp: 200, fid: 0 }, ...missingEntry }),
        false,
        REQUIRED_METRICS
      )
    ).rejects.toThrow(metric);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid CLS evidence %s',
    async cls => {
      await expect(
        collectBrowserMetrics(
          browserPage({ metrics: { cls, lcp: 200, fid: 0 } }),
          false,
          REQUIRED_METRICS
        )
      ).rejects.toThrow('cumulative-layout-shift');
    }
  );

  it('requires only browser metrics declared by the measured route', async () => {
    const observer = observeMetrics('largest-contentful-paint');
    await expect(
      collectBrowserMetrics(
        browserPage({
          metrics: observer.metrics,
          fcp: null,
          responseStart: null,
        }),
        false,
        ['cumulative-layout-shift', 'warm-shell-response']
      )
    ).resolves.toMatchObject({
      timingValues: { 'cumulative-layout-shift': 0 },
    });
  });
});
