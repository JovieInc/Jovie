import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureInteractionLatency } from '../../e2e/utils/interaction-latency-utils';

// Execute the browser callbacks against a deterministic 60 Hz clock. The audit
// separately exercises the same helper in Chromium with the manifest selectors.
const page = {
  evaluate: async (callback: (arg: unknown) => unknown, arg: unknown) =>
    callback(arg),
} as unknown as Page;
const disconnect = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      observe() {}
      disconnect = disconnect;
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('interaction latency measurement', () => {
  it('records simultaneous feedback and usable state on the same paint', async () => {
    const measurement = measureInteractionLatency(page, {
      action: async () => undefined,
      firstFeedback: async () => undefined,
      usableState: async () => undefined,
      scenarioId: 'simultaneous-feedback',
      runIndex: 3,
    });
    await vi.runAllTimersAsync();

    expect(await measurement).toMatchObject({
      nextPaintMs: 32,
      firstFeedbackMs: 32,
      usableStateMs: 32,
      longTaskCount: 0,
      scenarioId: 'simultaneous-feedback',
      runIndex: 3,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('times delayed feedback and usable state independently from the action', async () => {
    let showFeedback = () => {};
    let makeUsable = () => {};
    const feedback = new Promise<void>(resolve => {
      showFeedback = resolve;
    });
    const usable = new Promise<void>(resolve => {
      makeUsable = resolve;
    });
    const measurement = measureInteractionLatency(page, {
      action: async () => {
        setTimeout(showFeedback, 50);
        setTimeout(makeUsable, 120);
      },
      firstFeedback: () => feedback,
      usableState: () => usable,
      scenarioId: 'delayed-feedback',
    });
    await vi.runAllTimersAsync();

    expect(await measurement).toMatchObject({
      nextPaintMs: 32,
      firstFeedbackMs: 80,
      usableStateMs: 144,
    });
  });

  it('supports scenarios without a usable-state selector or long-task API', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const measurement = measureInteractionLatency(page, {
      action: async () => undefined,
      firstFeedback: async () => undefined,
      scenarioId: 'feedback-only',
    });
    await vi.runAllTimersAsync();

    expect(await measurement).toMatchObject({
      firstFeedbackMs: 32,
      usableStateMs: undefined,
      longTaskCount: 0,
      runIndex: 0,
    });
  });

  it('counts only long tasks from the current measurement and resets between runs', async () => {
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        constructor(private readonly callback: PerformanceObserverCallback) {}
        observe() {
          this.callback(
            {
              getEntries: () => [
                { startTime: -1, duration: 90 },
                { startTime: performance.now(), duration: 65 },
              ],
            } as unknown as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver
          );
        }
        disconnect = disconnect;
      }
    );

    for (let run = 0; run < 2; run += 1) {
      const measurement = measureInteractionLatency(page, {
        action: async () => undefined,
        firstFeedback: async () => undefined,
        scenarioId: 'long-task-count',
      });
      await vi.runAllTimersAsync();
      expect((await measurement).longTaskCount).toBe(1);
    }
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it.each(['action', 'firstFeedback', 'usableState'] as const)(
    'propagates %s failures and disconnects the observer',
    async failingStep => {
      const failure = new Error('interaction failed');
      const options = {
        action: async () => undefined,
        firstFeedback: async () => undefined,
        usableState: async () => undefined,
        scenarioId: 'failure',
        [failingStep]: async () => {
          throw failure;
        },
      };

      const assertion = expect(
        measureInteractionLatency(page, options)
      ).rejects.toBe(failure);
      await vi.runAllTimersAsync();
      await assertion;
      expect(disconnect).toHaveBeenCalledOnce();
    }
  );
});
