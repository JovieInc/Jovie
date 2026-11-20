import type { Page } from '@playwright/test';
import type { RouteDomFinding } from './route-dom-detector';

/**
 * Layout stability (DESIGN.md "Layout Shift Prevention"): cumulative layout
 * shift from load through a full scroll must stay under Google's "good"
 * threshold. Install before navigation; measure after inspection.
 */
export const LAYOUT_SHIFT_BUDGET = 0.1;

export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      value: 0,
      observed: false,
      sessionValue: 0,
      sessionStart: 0,
      lastShift: 0,
    };
    Object.defineProperty(window, '__jovieLayoutShift', { value: state });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (entry.hadRecentInput) continue;
        // CLS uses the largest session window (1s gap, at most 5s), not an
        // unbounded sum of unrelated shifts during a long scroll.
        if (
          entry.startTime - state.lastShift > 1000 ||
          entry.startTime - state.sessionStart > 5000
        ) {
          state.sessionStart = entry.startTime;
          state.sessionValue = 0;
        }
        state.lastShift = entry.startTime;
        state.sessionValue += entry.value;
        state.value = Math.max(state.value, state.sessionValue);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    state.observed =
      PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  });
}

export async function measureLayoutShift(
  page: Page
): Promise<RouteDomFinding | null> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  const cls = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __jovieLayoutShift?: { value: number; observed: boolean };
      }
    ).__jovieLayoutShift;
    if (!state?.observed || !Number.isFinite(state.value) || state.value < 0) {
      throw new Error('Layout-shift observation is unavailable');
    }
    return state.value;
  });
  if (cls <= LAYOUT_SHIFT_BUDGET) return null;
  return {
    kind: 'layout-shift',
    message: `Cumulative layout shift ${cls.toFixed(3)} exceeds ${LAYOUT_SHIFT_BUDGET}.`,
    elements: ['document'],
    measurements: { cls: Math.round(cls * 1000) / 1000 },
  };
}
