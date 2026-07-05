/**
 * Playwright CLS (Cumulative Layout Shift) measurement helpers.
 *
 * PerformanceObserver CLS entries are emitted asynchronously and may not capture
 * every JS-driven shift. Treat Playwright CLS as a secondary stability signal.
 */
import type { Page, TestInfo } from '@playwright/test';

/** Aligns with profile-cls-audit and interaction-shift guardrails. */
export const CLS_INTERACTION_BUDGET = 0.05;

interface LayoutShiftEntry extends PerformanceEntry {
  readonly value: number;
  readonly hadRecentInput?: boolean;
}

function isLayoutShiftEntry(
  entry: PerformanceEntry
): entry is LayoutShiftEntry {
  return (
    'value' in entry && typeof (entry as LayoutShiftEntry).value === 'number'
  );
}

function sumLayoutShiftEntries(entries: PerformanceEntryList): number {
  let cls = 0;
  for (const entry of entries) {
    if (isLayoutShiftEntry(entry) && !entry.hadRecentInput) {
      cls += entry.value;
    }
  }
  return cls;
}

/** CLS budgets are only meaningful against production builds in CI. */
export function shouldSkipClsInDevMode(): boolean {
  return !process.env.CI;
}

/**
 * Measure buffered CLS after navigation settles.
 * Give pending shifts time to report before disconnecting the observer.
 */
export async function measureBufferedCls(
  page: Page,
  settleMs = 1000
): Promise<number> {
  return page.evaluate(async (timeoutMs: number) => {
    return new Promise<number>(resolve => {
      let cls = 0;
      const observer = new PerformanceObserver(list => {
        cls += list
          .getEntries()
          .filter(
            (entry): entry is LayoutShiftEntry =>
              'value' in entry &&
              typeof (entry as LayoutShiftEntry).value === 'number' &&
              !(entry as LayoutShiftEntry).hadRecentInput
          )
          .reduce((sum, entry) => sum + entry.value, 0);
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      globalThis.setTimeout(() => {
        observer.disconnect();
        resolve(cls);
      }, timeoutMs);
    });
  }, settleMs);
}

/** Install a fresh non-buffered CLS observer for an upcoming interaction. */
export async function installInteractionClsObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = globalThis as typeof globalThis & {
      __clsValue?: number;
      __clsObserver?: PerformanceObserver;
    };
    win.__clsValue = 0;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (
          'value' in entry &&
          typeof (entry as LayoutShiftEntry).value === 'number' &&
          !(entry as LayoutShiftEntry).hadRecentInput
        ) {
          win.__clsValue =
            (win.__clsValue ?? 0) + (entry as LayoutShiftEntry).value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: false });
    win.__clsObserver = observer;
  });
}

/** Collect CLS accumulated since installInteractionClsObserver and disconnect. */
export async function collectInteractionCls(
  page: Page,
  settleMs = 1000
): Promise<number> {
  return page.evaluate(async (timeoutMs: number) => {
    return new Promise<number>(resolve => {
      globalThis.setTimeout(() => {
        const win = globalThis as typeof globalThis & {
          __clsValue?: number;
          __clsObserver?: PerformanceObserver;
        };
        win.__clsObserver?.disconnect();
        resolve(win.__clsValue ?? 0);
      }, timeoutMs);
    });
  }, settleMs);
}

export async function attachClsResult(
  testInfo: TestInfo,
  name: string,
  payload: Record<string, unknown>
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
  });
}

export function assertClsWithinBudget(
  cls: number,
  budget: number,
  context: string
): void {
  if (cls >= budget) {
    throw new Error(
      `CLS ${cls.toFixed(4)} during ${context} exceeds budget of ${budget}`
    );
  }
}

/** Exported for tests that need direct entry summation in page context. */
export { sumLayoutShiftEntries };
