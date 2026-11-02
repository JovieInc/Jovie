import type { CDPSession, Locator, Page } from '@playwright/test';

/** Route of the development-only dial harness (apps/web/app/dev/dsp-dial). */
export function dialUrl(fixture: 'tim' | 'synthetic', count = 100): string {
  return `/dev/dsp-dial?fixture=${fixture}&count=${count}`;
}

export const ROW_STEP_PX = 56;

export const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

export interface Gesture {
  readonly cdp: CDPSession;
  readonly x: number;
}

/** Real touch input through CDP so the browser's own pointer pipeline runs. */
export async function openGesture(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

export async function touchStart(cdp: CDPSession, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
}

export async function touchMove(cdp: CDPSession, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y }],
  });
}

export async function touchEnd(cdp: CDPSession) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

export interface Sample {
  readonly y: number;
  readonly t: number;
}

/**
 * Drag from `fromY` to `toY` in `ms`, moving every `stepMs`, optionally
 * resting `restMs` before lifting (a held finger throws nothing).
 */
export async function drag(
  cdp: CDPSession,
  {
    x,
    fromY,
    toY,
    ms,
    stepMs = 8,
    restMs = 0,
    lift = true,
  }: {
    x: number;
    fromY: number;
    toY: number;
    ms: number;
    stepMs?: number;
    restMs?: number;
    lift?: boolean;
  }
): Promise<Sample[]> {
  const samples: Sample[] = [];
  const begin = performance.now();
  await touchStart(cdp, x, fromY);
  samples.push({ y: fromY, t: 0 });
  const steps = Math.max(1, Math.round(ms / stepMs));
  for (let step = 1; step <= steps; step++) {
    const target = begin + (ms * step) / steps;
    const wait = target - performance.now();
    if (wait > 0) await sleep(wait);
    const y = fromY + ((toY - fromY) * step) / steps;
    await touchMove(cdp, x, y);
    samples.push({ y, t: performance.now() - begin });
  }
  if (restMs > 0) await sleep(restMs);
  if (lift) await touchEnd(cdp);
  return samples;
}

export async function dialBox(dial: Locator) {
  const box = await dial.boundingBox();
  if (!box) throw new Error('dial is not visible');
  return box;
}

/** Index (0-based) of the item Stream Now currently points at (synthetic ids). */
export async function streamIndex(dial: Locator): Promise<number> {
  const href = await dial.locator('[data-dsp-provider]').getAttribute('href');
  const match = href?.match(/stream-(\d+)/);
  if (!match) throw new Error(`unexpected Stream Now href: ${href}`);
  return Number(match[1]) - 1;
}

export async function streamLabel(dial: Locator): Promise<string> {
  return (
    (await dial.locator('[data-dsp-provider]').getAttribute('aria-label')) ?? ''
  );
}

/** Poll until `read` returns the same value for `quietMs`. */
export async function settled<T>(
  read: () => Promise<T>,
  quietMs = 450,
  timeoutMs = 9000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  let since = Date.now();
  while (Date.now() < deadline) {
    await sleep(60);
    const next = await read();
    if (next !== last) {
      last = next;
      since = Date.now();
    } else if (Date.now() - since >= quietMs) {
      return next;
    }
  }
  throw new Error('dial never settled');
}

/** Counts vibrate() calls and long tasks inside the page. */
export const INSTRUMENT_SCRIPT = `
  window.__vibrations = [];
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: (pattern) => { window.__vibrations.push(pattern); return true; },
  });
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  window.__frames = [];
  let __last = performance.now();
  const __loop = (now) => { window.__frames.push(now - __last); __last = now; requestAnimationFrame(__loop); };
  requestAnimationFrame(__loop);
`;
