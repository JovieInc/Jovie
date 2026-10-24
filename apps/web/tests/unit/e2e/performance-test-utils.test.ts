import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureWebVitals } from '@/tests/e2e/utils/performance-test-utils';

const types = ['largest-contentful-paint', 'paint', 'layout-shift'];
type Entry = Partial<PerformanceEntry> & {
  value?: number;
  hadRecentInput?: boolean;
};

class Observer {
  static supportedEntryTypes = [...types];
  static instances: Observer[] = [];
  static failingType: string | undefined;
  type = '';
  queued: Entry[] = [];
  disconnect = vi.fn();
  constructor(
    private readonly callback: (list: PerformanceObserverEntryList) => void
  ) {
    Observer.instances.push(this);
  }
  observe({ type }: PerformanceObserverInit) {
    this.type = type ?? '';
    if (type === Observer.failingType) throw new Error('registration failed');
  }
  takeRecords() {
    return this.queued.splice(0) as PerformanceEntry[];
  }
  emit(entries: Entry[]) {
    this.callback({
      getEntries: () => entries,
    } as PerformanceObserverEntryList);
  }
}

function observer(type: string) {
  const result = Observer.instances.find(item => item.type === type);
  if (!result) throw new Error(`Missing observer: ${type}`);
  return result;
}

function paints() {
  observer(types[0]).emit([{ startTime: 321 }]);
  observer(types[1]).emit([{ name: 'first-contentful-paint', startTime: 123 }]);
}

function measure() {
  // Execute the actual page.evaluate callback, including its timers/observers.
  const page = {
    evaluate: async (fn: () => unknown) => fn(),
  } as unknown as Page;
  const result = measureWebVitals(page);
  void result.catch(() => undefined);
  return result;
}

function cleanedUp() {
  expect(
    Observer.instances.every(item => item.disconnect.mock.calls.length === 1)
  ).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
}

describe('measureWebVitals observation evidence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Observer.instances = [];
    Observer.supportedEntryTypes = [...types];
    Observer.failingType = undefined;
    vi.stubGlobal('PerformanceObserver', Observer);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('accepts genuine zero shifts after supported observation and valid paints', async () => {
    const result = measure();
    paints();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ lcp: 321, fcp: 123, cls: 0 });
    cleanedUp();
  });

  it('waits for paint evidence delivered after the initial observation window', async () => {
    const result = measure();
    const settled = vi.fn();
    void result.then(settled);
    await vi.advanceTimersByTimeAsync(400);
    expect(settled).not.toHaveBeenCalled();
    paints();
    await expect(result).resolves.toMatchObject({ lcp: 321, fcp: 123, cls: 0 });
    cleanedUp();
  });

  it('rejects supported observers with no paint evidence at the deadline', async () => {
    const result = measure();
    observer(types[0]).emit([]);
    observer(types[1]).emit([{ name: 'first-paint', startTime: 10 }]);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).rejects.toThrow(/observation unavailable.*lcp.*fcp/i);
    cleanedUp();
  });

  it('records LCP and FCP when layout-shift is unsupported', async () => {
    Observer.supportedEntryTypes = types.filter(
      item => item !== 'layout-shift'
    );
    const result = measure();
    paints();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ lcp: 321, fcp: 123 });
    expect(Observer.instances.map(item => item.type)).not.toContain(
      'layout-shift'
    );
    cleanedUp();
  });

  it.each(types)(
    'rejects unsupported %s rather than inventing zero',
    async type => {
      Observer.supportedEntryTypes = types.filter(item => item !== type);
      const result = measure();
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(result).rejects.toThrow(/observation unavailable/i);
      cleanedUp();
    }
  );

  it('rejects a missing observer API', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    await expect(measure()).rejects.toThrow(/observation unavailable/i);
    cleanedUp();
  });

  it.each(types)(
    'cleans up partial registration when %s throws',
    async type => {
      Observer.failingType = type;
      const result = measure();
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(result).rejects.toThrow(/observation unavailable/i);
      cleanedUp();
    }
  );

  it.each([NaN, Infinity, -1, undefined])(
    'rejects invalid LCP %s',
    async startTime => {
      const result = measure();
      observer(types[0]).emit([{ startTime }]);
      await expect(result).rejects.toThrow(/invalid lcp/i);
      cleanedUp();
    }
  );

  it.each([NaN, Infinity, -1, undefined])(
    'rejects invalid FCP %s',
    async startTime => {
      const result = measure();
      observer(types[1]).emit([{ name: 'first-contentful-paint', startTime }]);
      await expect(result).rejects.toThrow(/invalid fcp/i);
      cleanedUp();
    }
  );

  it.each([NaN, Infinity, -1, undefined])(
    'rejects invalid contributing CLS %s',
    async value => {
      const result = measure();
      observer(types[2]).emit([{ value, hadRecentInput: false }]);
      await expect(result).rejects.toThrow(/invalid cls/i);
      cleanedUp();
    }
  );

  it('sums observed shifts and excludes recent user input', async () => {
    const result = measure();
    paints();
    observer(types[2]).emit([
      { value: 0.05 },
      { value: 0.02 },
      { value: 4, hadRecentInput: true },
    ]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toMatchObject({ cls: 0.07 });
    cleanedUp();
  });

  it('drains queued records from every observer before deciding', async () => {
    const result = measure();
    observer(types[0]).queued.push({ startTime: 456 });
    observer(types[1]).queued.push({
      name: 'first-contentful-paint',
      startTime: 234,
    });
    observer(types[2]).queued.push({ value: 0.1 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toMatchObject({
      lcp: 456,
      fcp: 234,
      cls: 0.1,
    });
    cleanedUp();
  });

  it('ignores callbacks delivered after success', async () => {
    const result = measure();
    paints();
    await vi.advanceTimersByTimeAsync(100);
    const values = await result;
    observer(types[2]).emit([{ value: 5 }]);
    observer(types[0]).emit([{ startTime: NaN }]);
    expect(values).toEqual({ lcp: 321, fcp: 123, cls: 0 });
    cleanedUp();
  });

  it('cannot recover a timed-out sample with late paint callbacks', async () => {
    const result = measure();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).rejects.toThrow(/observation unavailable/i);
    paints();
    await expect(result).rejects.toThrow(/observation unavailable/i);
    cleanedUp();
  });
});
