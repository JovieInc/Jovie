import type { Page } from '@playwright/test';
import type { InteractionLatencySample } from '@/scripts/performance-interaction-report';

interface InteractionLatencyPageWindow extends Window {
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
    latencyWindow.__jovieInteractionLatencyLongTasks = [];

    try {
      const observer = new PerformanceObserver(list => {
        const tasks = latencyWindow.__jovieInteractionLatencyLongTasks ?? [];
        for (const entry of list.getEntries()) {
          tasks.push(entry.duration);
        }
        latencyWindow.__jovieInteractionLatencyLongTasks = tasks;
      });
      observer.observe({ type: 'longtask', buffered: true });
      setTimeout(() => observer.disconnect(), 30_000);
    } catch {
      // Some browsers do not support longtask observers.
    }
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
}
