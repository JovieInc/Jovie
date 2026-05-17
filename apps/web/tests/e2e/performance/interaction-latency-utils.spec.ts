import { expect, test } from '@playwright/test';
import { measureInteractionLatency } from '../utils/interaction-latency-utils';

test.describe('interaction latency measurement helper', () => {
  test('measures event to first feedback and usable state in the browser', async ({
    page,
  }) => {
    await page.setContent(`
      <button id="trigger" type="button">Trigger</button>
      <div id="feedback" hidden>Feedback</div>
      <script>
        document.querySelector('#trigger').addEventListener('click', () => {
          setTimeout(() => {
            document.querySelector('#feedback').hidden = false;
            document.querySelector('#feedback').setAttribute('data-usable', 'true');
          }, 50);
        });
      </script>
    `);

    const sample = await measureInteractionLatency(page, {
      action: () => page.locator('#trigger').click(),
      firstFeedback: () => expect(page.locator('#feedback')).toBeVisible(),
      scenarioId: 'synthetic-first-feedback',
      usableState: () =>
        expect(page.locator('#feedback')).toHaveAttribute(
          'data-usable',
          'true'
        ),
    });

    expect(sample.firstFeedbackMs).toBeGreaterThanOrEqual(45);
    expect(sample.firstFeedbackMs).toBeLessThan(500);
    expect(sample.nextPaintMs).toBeGreaterThanOrEqual(0);
    expect(sample.nextPaintMs).toBeLessThanOrEqual(sample.firstFeedbackMs);
    expect(sample.usableStateMs).toBeGreaterThanOrEqual(sample.firstFeedbackMs);
  });

  test('disconnects and resets the long-task observer between measurements', async ({
    page,
  }) => {
    await page.setContent('<main>Ready</main>');
    await page.evaluate(() => {
      const stateWindow = window as Window & {
        __jovieDisconnectCount?: number;
        __jovieObserverActive?: boolean;
      };

      class TestPerformanceObserver {
        private readonly callback: PerformanceObserverCallback;

        constructor(callback: PerformanceObserverCallback) {
          this.callback = callback;
        }

        observe() {
          stateWindow.__jovieObserverActive = true;
          this.callback(
            {
              getEntries: () =>
                [
                  {
                    duration: 12,
                    startTime: performance.now(),
                  },
                ] as PerformanceEntry[],
            } as unknown as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver
          );
        }

        disconnect() {
          stateWindow.__jovieDisconnectCount =
            (stateWindow.__jovieDisconnectCount ?? 0) + 1;
          stateWindow.__jovieObserverActive = false;
        }
      }

      Object.defineProperty(window, 'PerformanceObserver', {
        configurable: true,
        value: TestPerformanceObserver,
      });
    });

    const first = await measureInteractionLatency(page, {
      action: () => page.evaluate(() => undefined),
      firstFeedback: async () => undefined,
      scenarioId: 'synthetic-first-feedback',
    });
    const second = await measureInteractionLatency(page, {
      action: () => page.evaluate(() => undefined),
      firstFeedback: async () => undefined,
      scenarioId: 'synthetic-first-feedback',
    });

    const observerState = await page.evaluate(() => {
      const stateWindow = window as Window & {
        __jovieDisconnectCount?: number;
        __jovieObserverActive?: boolean;
      };
      return {
        disconnectCount: stateWindow.__jovieDisconnectCount ?? 0,
        observerActive: stateWindow.__jovieObserverActive ?? false,
      };
    });

    expect(first.longTaskCount).toBe(1);
    expect(second.longTaskCount).toBe(1);
    expect(observerState.disconnectCount).toBe(2);
    expect(observerState.observerActive).toBe(false);
  });
});
