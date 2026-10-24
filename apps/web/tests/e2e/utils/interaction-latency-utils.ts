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

/** Browser-clock probe: activation → painted pending, response → usable controls.
 * Keep automation polling and the fixture's server delay outside rendering cost.
 */
export function installDecisionLatencyProbe(options: {
  trigger: string;
  pending: string;
  usable: string;
  responsePath: string;
}) {
  const host = window as Window & {
    __decisionProbe?: {
      start?: number;
      firstFeedbackMs?: number;
      dataReadyMs?: number;
      responseHeadersMs?: number;
      usableStateMs?: number;
      renderToInteractiveMs?: number;
      stop: () => void;
    };
  };
  host.__decisionProbe?.stop();
  const originalFetch = window.fetch;
  performance.clearResourceTimings();
  let frame = 0;
  let pendingPresented = false;
  let observedPending = false;
  let readinessObserver: MutationObserver | undefined;
  const probe: NonNullable<typeof host.__decisionProbe> = {
    stop: () => {
      cancelAnimationFrame(frame);
      readinessObserver?.disconnect();
      document.removeEventListener('click', activate, true);
      window.fetch = originalFetch;
    },
  };
  function activate(event: MouseEvent) {
    if (
      probe.start === undefined &&
      (event.target as Element)?.closest(options.trigger)
    ) {
      probe.start = performance.now();
    }
  }
  function visible(selector: string) {
    return [...document.querySelectorAll<HTMLElement>(selector)].some(
      element => {
        const rect = element.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.top >= innerHeight
        )
          return false;
        for (
          let node: HTMLElement | null = element;
          node;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0'
          )
            return false;
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            const clip = node.getBoundingClientRect();
            if (rect.bottom <= clip.top || rect.top >= clip.bottom)
              return false;
          }
        }
        return true;
      }
    );
  }
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (
      probe.start !== undefined &&
      new URL(raw, location.href).pathname === options.responsePath &&
      init?.method === 'POST'
    ) {
      probe.responseHeadersMs = performance.now() - probe.start;
      // Do not delay the application. Mark complete response delivery from a
      // clone, so body transport is not misclassified as rendering time.
      void response
        .clone()
        .arrayBuffer()
        .then(() => {
          const resource = performance
            .getEntriesByName(response.url)
            .findLast(entry => entry.entryType === 'resource') as
            | PerformanceResourceTiming
            | undefined;
          // Resource timestamps keep synchronous rendering from delaying this
          // marker and hiding main-thread work behind the clone callback.
          probe.dataReadyMs =
            (resource?.responseEnd || performance.now()) - probe.start!;
          recordUsable();
          finalizeReadiness();
        });
    }
    return response;
  };
  function sample() {
    if (probe.start !== undefined) {
      const pending = visible(options.pending);
      observedPending ||= pending;
      if (pending && pendingPresented && probe.firstFeedbackMs === undefined) {
        probe.firstFeedbackMs = performance.now() - probe.start;
      }
      pendingPresented = pending;
      recordUsable();
      if (probe.usableStateMs !== undefined) return;
    }
    frame = requestAnimationFrame(sample);
  }
  function recordUsable() {
    if (
      probe.start === undefined ||
      !observedPending ||
      probe.usableStateMs !== undefined ||
      !visible(options.usable)
    )
      return;
    // Enabled, presented controls accept input at this commit. A second
    // presentation wait here would add the probe's own frames to readiness.
    probe.usableStateMs = performance.now() - probe.start;
    finalizeReadiness();
    cancelAnimationFrame(frame);
  }
  function finalizeReadiness() {
    if (probe.usableStateMs !== undefined && probe.dataReadyMs !== undefined) {
      probe.renderToInteractiveMs = probe.usableStateMs - probe.dataReadyMs;
    }
  }
  readinessObserver = new MutationObserver(recordUsable);
  readinessObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  document.addEventListener('click', activate, true);
  host.__decisionProbe = probe;
  frame = requestAnimationFrame(sample);
}

/** A bounded scroll workload on the actual overflowing inbox container. */
export async function measureInboxScroll(page: Page, selector: string) {
  return page.locator(selector).evaluate(async element => {
    let scroller: Element | null = element;
    while (
      scroller &&
      !(
        scroller.scrollHeight > scroller.clientHeight + 100 &&
        /(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
      )
    ) {
      scroller = scroller.parentElement;
    }
    scroller ??= document.scrollingElement;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100)
      throw new Error('Inbox workload does not overflow');
    const target = scroller;
    const original = target.scrollTop;
    const intervals: number[] = [];
    const positions: number[] = [];
    let previous = await new Promise<number>(resolve =>
      requestAnimationFrame(resolve)
    );
    for (let index = 0; index < 60; index++) {
      target.scrollTop = (index < 30 ? index + 1 : 60 - index) * 16;
      const now = await new Promise<number>(resolve =>
        requestAnimationFrame(resolve)
      );
      intervals.push(now - previous);
      positions.push(target.scrollTop);
      previous = now;
    }
    target.scrollTop = original;
    return {
      // Match the existing chat scroll ratchet: >50ms is two consecutive
      // missed 60Hz frames. Keep this shared workload's definition identical.
      droppedFrameCount: intervals.filter(ms => ms > 50).length,
      maxFrameIntervalMs: Math.max(...intervals),
      frames: intervals.length,
      distance: Math.max(...positions) - Math.min(...positions),
    };
  });
}
