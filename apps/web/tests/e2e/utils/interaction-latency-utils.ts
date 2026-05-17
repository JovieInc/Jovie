import type { Page } from '@playwright/test';
import type { InteractionLatencySample } from '@/scripts/performance-interaction-report';

interface InteractionLatencyPageWindow extends Window {
  __jovieInteractionLatencyLongTaskObserver?: PerformanceObserver;
  __jovieInteractionLatencyLongTasks?: number[];
}

export interface MeasureInteractionLatencyOptions {
  readonly action: () => Promise<void>;
  readonly firstFeedback: () => Promise<void>;
  readonly runIndex?: number;
  readonly scenarioId: string;
  readonly usableState?: () => Promise<void>;
}

async function waitForNextPaint(page: Page, startTime: number) {
  return page.evaluate(start => {
    return new Promise<number>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(performance.now() - start);
        });
      });
    });
  }, startTime);
}

async function installLongTaskObserver(page: Page) {
  await page.evaluate(() => {
    const latencyWindow = window as InteractionLatencyPageWindow;
    latencyWindow.__jovieInteractionLatencyLongTaskObserver?.disconnect();
    latencyWindow.__jovieInteractionLatencyLongTasks = [];
    const installTime = performance.now();

    try {
      const observer = new PerformanceObserver(list => {
        const tasks = latencyWindow.__jovieInteractionLatencyLongTasks ?? [];
        for (const entry of list.getEntries()) {
          if (entry.startTime >= installTime) {
            tasks.push(entry.duration);
          }
        }
        latencyWindow.__jovieInteractionLatencyLongTasks = tasks;
      });
      observer.observe({ type: 'longtask' });
      latencyWindow.__jovieInteractionLatencyLongTaskObserver = observer;
    } catch {
      // Some browsers do not support longtask observers.
    }
  });
}

async function uninstallLongTaskObserver(page: Page) {
  await page.evaluate(() => {
    const latencyWindow = window as InteractionLatencyPageWindow;
    latencyWindow.__jovieInteractionLatencyLongTaskObserver?.disconnect();
    latencyWindow.__jovieInteractionLatencyLongTaskObserver = undefined;
  });
}

async function getLongTaskCount(page: Page) {
  return page.evaluate(() => {
    const latencyWindow = window as InteractionLatencyPageWindow;
    return latencyWindow.__jovieInteractionLatencyLongTasks?.length ?? 0;
  });
}

export async function measureInteractionLatency(
  page: Page,
  options: MeasureInteractionLatencyOptions
): Promise<InteractionLatencySample> {
  await installLongTaskObserver(page);
  const startTime = await page.evaluate(() => performance.now());

  try {
    await options.action();
    const nextPaintMs = await waitForNextPaint(page, startTime);
    await options.firstFeedback();
    const firstFeedbackMs = await waitForNextPaint(page, startTime);

    let usableStateMs: number | undefined;
    if (options.usableState) {
      await options.usableState();
      usableStateMs = await waitForNextPaint(page, startTime);
    }

    return {
      firstFeedbackMs,
      longTaskCount: await getLongTaskCount(page),
      nextPaintMs,
      runIndex: options.runIndex ?? 0,
      scenarioId: options.scenarioId,
      usableStateMs,
    };
  } finally {
    await uninstallLongTaskObserver(page);
  }
}
