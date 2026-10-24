import { expect, test } from '@playwright/test';
import {
  installDecisionLatencyProbe,
  measureInteractionLatency,
} from '../utils/interaction-latency-utils';

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

for (const recovery of ['timer', 'blocking', 'late-observer'] as const) {
  test(`decision probe separates server delay and detects slow ${recovery} recovery`, async ({
    page,
  }) => {
    await page.route('http://decision.test/**', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<button id="decision">Decide</button>',
      })
    );
    await page.goto('http://decision.test/');
    await page.route('**/decision', async route => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({ json: { ok: true } });
    });
    await page.evaluate(recovery => {
      if (recovery === 'late-observer') {
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          const originalClone = response.clone.bind(response);
          response.clone = () => {
            const clone = originalClone();
            const originalBuffer = clone.arrayBuffer.bind(clone);
            clone.arrayBuffer = async () => {
              const body = await originalBuffer();
              await new Promise(resolve => setTimeout(resolve, 250));
              return body;
            };
            return clone;
          };
          return response;
        };
      }
      document.querySelector<HTMLButtonElement>('#decision')!.onclick =
        async event => {
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          const response = await fetch('/decision', { method: 'POST' });
          await response.json();
          if (recovery === 'blocking') {
            const until = performance.now() + 90;
            while (performance.now() < until) {
              /* Deliberately simulate a blocked rendering thread. */
            }
            button.disabled = false;
          } else
            setTimeout(() => {
              button.disabled = false;
            }, 90);
        };
    }, recovery);
    await page.evaluate(installDecisionLatencyProbe, {
      trigger: '#decision',
      pending: '#decision:disabled',
      usable: '#decision:not(:disabled)',
      responsePath: '/decision',
    });
    await page.locator('#decision').click();
    await page.waitForFunction(
      () =>
        (window as DecisionProbeWindow).__decisionProbe
          .renderToInteractiveMs !== undefined
    );
    const timing = await page.evaluate(() => {
      const probe = (window as DecisionProbeWindow).__decisionProbe;
      probe.stop();
      return {
        feedback: probe.firstFeedbackMs,
        ready: probe.dataReadyMs,
        interactive: probe.renderToInteractiveMs,
      };
    });
    expect(timing.feedback).toBeLessThan(100);
    expect(timing.ready).toBeGreaterThanOrEqual(200);
    expect(timing.interactive).toBeGreaterThanOrEqual(90);
    if (recovery === 'late-observer')
      expect(timing.interactive).toBeLessThan(180);
  });
}

type DecisionProbeWindow = Window & {
  __decisionProbe: {
    firstFeedbackMs: number;
    dataReadyMs: number;
    renderToInteractiveMs?: number;
    stop: () => void;
  };
};
