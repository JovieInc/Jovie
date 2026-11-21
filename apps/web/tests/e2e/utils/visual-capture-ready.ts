import { expect, type Locator, test } from '@playwright/test';
import { findErrorCopy } from './visual-capture-copy';

/**
 * A visual refresh adopts whatever renders. Without this gate the admin suite
 * committed a loading skeleton as `admin-home` and then the "Revenue state
 * unavailable" error card. Call it before every `toHaveScreenshot` in a suite
 * that refreshes baselines: it waits for placeholders to settle, then fails
 * the test if the capture would show a skeleton, a busy region or error copy.
 * A failed test publishes no baselines, so the bad capture is never adopted.
 */

/** Placeholders that mean "not loaded yet". */
export const LOADING_SELECTORS = [
  '[data-slot="skeleton"]',
  '.skeleton',
  '.animate-pulse',
  '[aria-busy="true"]',
  '[data-state="loading"]',
] as const;

export interface CaptureProblem {
  readonly kind: 'loading' | 'error-copy';
  readonly detail: string;
}

async function visibleLoadingMarkers(root: Locator): Promise<string[]> {
  const found: string[] = [];
  for (const selector of LOADING_SELECTORS) {
    const matches = root.locator(selector);
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      const match = matches.nth(index);
      if (await match.isVisible()) {
        const owner = await match.evaluate(element => {
          const host = element.closest('[data-testid]');
          const id = host?.getAttribute('data-testid') ?? 'no test id';
          const label = (element.textContent ?? '').replace(/\s+/g, ' ');
          return `${id}: ${label.trim().slice(0, 60)}`;
        });
        found.push(`${selector} in ${owner}`);
        break;
      }
    }
  }
  // The root itself can be the busy region.
  if ((await root.getAttribute('aria-busy')) === 'true') {
    found.push('root[aria-busy="true"]');
  }
  return found;
}

export interface CaptureReadyOptions {
  /** How long to wait for the capture to settle. */
  readonly timeout?: number;
  /**
   * Ordinary copy on this surface that mentions an error word, such as help
   * text saying when a feature is unavailable. Keep each pattern as narrow
   * as the sentence it allows.
   */
  readonly allowCopy?: readonly RegExp[];
}

export async function findCaptureProblems(
  root: Locator,
  allowCopy: readonly RegExp[] = []
): Promise<CaptureProblem[]> {
  const problems: CaptureProblem[] = [];
  for (const selector of await visibleLoadingMarkers(root)) {
    problems.push({ kind: 'loading', detail: selector });
  }
  // Error copy is read from the rendered text, alerts included. A visible
  // role="alert" alone is not an error: the route announcer and toasts use it
  // for ordinary copy ("Move your music forward."), so it is never a problem
  // by itself.
  const errorCopy = findErrorCopy(await root.innerText(), allowCopy);
  if (errorCopy) problems.push({ kind: 'error-copy', detail: errorCopy });
  return problems;
}

/**
 * True when this run writes baselines (`--update-snapshots`), or when
 * VISUAL_CAPTURE_GATE=1 forces the gate. Compare runs skip it: a skeleton
 * already fails against a good baseline, and the gate must not add a new way
 * for merge-queue compare lanes to go red.
 */
export function captureGateActive(): boolean {
  if (process.env.VISUAL_CAPTURE_GATE === '1') return true;
  const mode = test.info().config.updateSnapshots;
  return mode === 'all' || mode === 'changed';
}

/**
 * When the run writes baselines, waits up to `timeout` for the capture to
 * settle, then fails with every problem it still shows.
 */
export async function expectCaptureReady(
  root: Locator,
  { timeout = 30_000, allowCopy = [] }: CaptureReadyOptions = {}
): Promise<void> {
  if (!captureGateActive()) return;
  let problems: CaptureProblem[] = [];
  try {
    await expect
      .poll(
        async () => {
          problems = await findCaptureProblems(root, allowCopy);
          return problems.length;
        },
        { timeout, intervals: [250, 500, 1_000] }
      )
      .toBe(0);
  } catch {
    const lines = problems.map(p => `  - ${p.kind}: ${p.detail}`).join('\n');
    throw new Error(
      `Refusing to capture a baseline that is not ready:\n${lines}\n` +
        'Stub the data this surface reads, or wait for it, before the screenshot.'
    );
  }
}
