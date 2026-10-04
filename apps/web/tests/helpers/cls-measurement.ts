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

/** One buffered layout shift with the elements that moved. */
export interface LayoutShiftRecord {
  readonly startTime: number;
  readonly value: number;
  readonly sources: readonly string[];
}

export interface BufferedLayoutShifts {
  readonly cls: number;
  readonly shifts: readonly LayoutShiftRecord[];
}

/**
 * Measure buffered CLS after navigation settles, keeping per-shift source
 * attribution so a budget failure names the elements that moved.
 * Give pending shifts time to report before disconnecting the observer.
 */
export async function measureBufferedLayoutShifts(
  page: Page,
  settleMs = 1000
): Promise<BufferedLayoutShifts> {
  return page.evaluate(async (timeoutMs: number) => {
    interface ShiftSource {
      readonly node?: Node | null;
      readonly previousRect: DOMRectReadOnly;
      readonly currentRect: DOMRectReadOnly;
    }
    interface ShiftEntry extends PerformanceEntry {
      readonly value: number;
      readonly hadRecentInput?: boolean;
      readonly sources?: readonly ShiftSource[];
    }
    const describeNode = (node: Node | null | undefined): string => {
      if (!(node instanceof Element)) return node?.nodeName ?? '(removed)';
      const testId = node.getAttribute('data-testid');
      const className = (node.getAttribute('class') ?? '').trim().slice(0, 60);
      return [
        node.tagName.toLowerCase(),
        node.id ? `#${node.id}` : '',
        testId ? `[data-testid=${testId}]` : '',
        className ? `.${className.replaceAll(/\s+/g, '.')}` : '',
      ].join('');
    };
    const describeRect = (rect: DOMRectReadOnly): string =>
      `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;

    return new Promise(resolve => {
      const shifts: LayoutShiftRecord[] = [];
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as ShiftEntry[]) {
          if (typeof entry.value !== 'number' || entry.hadRecentInput) {
            continue;
          }
          shifts.push({
            startTime: Math.round(entry.startTime),
            value: entry.value,
            sources: (entry.sources ?? []).map(
              source =>
                `${describeNode(source.node)} ${describeRect(source.previousRect)} -> ${describeRect(source.currentRect)}`
            ),
          });
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      globalThis.setTimeout(() => {
        observer.disconnect();
        resolve({
          cls: shifts.reduce((sum, shift) => sum + shift.value, 0),
          shifts,
        });
      }, timeoutMs);
    });
  }, settleMs);
}

/**
 * Measure buffered CLS after navigation settles.
 * Give pending shifts time to report before disconnecting the observer.
 */
export async function measureBufferedCls(
  page: Page,
  settleMs = 1000
): Promise<number> {
  return (await measureBufferedLayoutShifts(page, settleMs)).cls;
}

/** Largest shifts first, for a CLS budget failure message. */
export function formatLayoutShiftAttribution(
  shifts: readonly LayoutShiftRecord[],
  limit = 5
): string {
  if (shifts.length === 0) return 'no layout-shift entries';
  return [...shifts]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(
      shift =>
        `${shift.value.toFixed(4)} @${shift.startTime}ms: ${
          shift.sources.length > 0
            ? shift.sources.join('; ')
            : '(no source attribution)'
        }`
    )
    .join('\n');
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
