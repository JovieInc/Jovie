import { appendFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * Production golden-path certification steps (JOV-9625). Each wrapped step is
 * timed and appended as one JSON line to PROD_CERT_STEPS_FILE; scripts/prod-cert.mjs
 * folds them into the per-surface receipts. A failing step is recorded and the
 * error rethrown so the enclosing test still fails. Without the env var this
 * is a plain pass-through.
 */
export type ProdCertStepStatus = 'passed' | 'failed' | 'blocked';

export interface ProdCertStep {
  readonly surface: string;
  readonly id: string;
  readonly status: ProdCertStepStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly summary: string;
}

/**
 * Every JSON-line shape the steps file carries: browser checks, per-surface
 * telemetry/screenshot evidence, quality-contract observations and the
 * admin inventory readback (JOV-9625 outcome rework).
 */
export type ProdCertStepRecord =
  | ProdCertStep
  | {
      readonly kind: 'telemetry';
      readonly surface: string;
      readonly consoleErrors: number;
      readonly networkErrors: number;
    }
  | {
      readonly kind: 'screenshot';
      readonly surface: string;
      readonly format: 'jpeg';
      readonly dataUrl: string;
    }
  | {
      readonly kind: 'observation';
      readonly surface: string;
      readonly contractId: string;
      readonly dimension: string;
      readonly value: number;
      readonly unit: string;
      readonly sampleSize?: number;
    }
  | {
      readonly kind: 'readback';
      readonly status: 'passed' | 'blocked' | 'failed';
      readonly detail: string;
    };

function write(step: ProdCertStepRecord): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify(step)}\n`);
  } catch {
    // Evidence is best-effort; the test result is authoritative.
  }
}

export async function certStep<T>(
  surface: string,
  id: string,
  fn: () => Promise<T>,
  summarize: (value: T) => string = () => 'ok'
): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const value = await fn();
    write({
      surface,
      id,
      status: 'passed',
      startedAt,
      endedAt: new Date().toISOString(),
      summary: summarize(value),
    });
    return value;
  } catch (error) {
    write({
      surface,
      id,
      status: 'failed',
      startedAt,
      endedAt: new Date().toISOString(),
      summary: String((error as Error)?.message ?? error)
        .split('\n')[0]
        .slice(0, 500),
    });
    throw error;
  }
}

export function certStepBlocked(
  surface: string,
  id: string,
  summary: string
): void {
  const at = new Date().toISOString();
  write({
    surface,
    id,
    status: 'blocked',
    startedAt: at,
    endedAt: at,
    summary,
  });
}

/**
 * Per-surface browser evidence (JOV-9625 outcome receipt):
 *   - telemetry: how many console errors and failed/error network responses
 *     the page emitted while the surface was exercised;
 *   - screenshot: one JPEG frame of the surface, base64 data-URL encoded, so
 *     every receipt carries visual proof a human can open.
 * Folded into the surface receipt by scripts/prod-cert.mjs. Both are
 * best-effort evidence: they never fail a step, and they are recorded as
 * null on the receipt when the surface was not browser-exercised.
 */
export interface SurfaceTelemetryCollector {
  /** Write the telemetry delta accumulated since the previous record call. */
  readonly record: (surface: string) => void;
  /** Capture the current page as the surface's JPEG evidence frame. */
  readonly capture: (page: Page, surface: string) => Promise<void>;
}

export function createSurfaceTelemetry(page: Page): SurfaceTelemetryCollector {
  let consoleErrors = 0;
  let networkErrors = 0;
  let reportedConsole = 0;
  let reportedNetwork = 0;
  const onConsole = (message: { type(): string }): void => {
    if (message.type() === 'error') consoleErrors += 1;
  };
  const onResponse = (response: { status(): number }): void => {
    if (response.status() >= 400) networkErrors += 1;
  };
  const onRequestFailed = (): void => {
    networkErrors += 1;
  };
  page.on('console', onConsole);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  return {
    record(surface) {
      const telemetry = {
        kind: 'telemetry' as const,
        surface,
        consoleErrors: consoleErrors - reportedConsole,
        networkErrors: networkErrors - reportedNetwork,
      };
      reportedConsole = consoleErrors;
      reportedNetwork = networkErrors;
      write(telemetry);
    },
    async capture(currentPage, surface) {
      await recordJank(currentPage, surface);
      // The ledger route caps each data URL (JOV-9625): fall back to a lower
      // quality once, then record nothing rather than reject the whole POST.
      for (const quality of [40, 20]) {
        try {
          const buffer = await currentPage.screenshot({
            type: 'jpeg',
            quality,
            fullPage: false,
          });
          const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          if (dataUrl.length > 350_000) continue;
          write({
            kind: 'screenshot' as const,
            surface,
            format: 'jpeg' as const,
            dataUrl,
          });
          return;
        } catch {
          // Evidence is best-effort; the test result is authoritative.
          return;
        }
      }
    },
  };
}

/**
 * Declare the browser checks each spec wraps, per surface (JOV-9854). The
 * producer folds this into receipt building so a missing check on a served
 * build that predates the check is attributed to deploy skew instead of
 * reading as a silent smoke skip. The check is blocked either way; this only
 * makes the blocked reason truthful. Best-effort: never fails a test.
 */
export function recordCertCapabilities(
  capabilities: Readonly<Record<string, readonly string[]>>
): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file) return;
  try {
    for (const [surface, ids] of Object.entries(capabilities)) {
      appendFileSync(
        file,
        `${JSON.stringify({ kind: 'capabilities' as const, surface, ids: [...ids] })}\n`
      );
    }
  } catch {
    // Evidence is best-effort; the test result is authoritative.
  }
}

/**
 * Reads the current document's layout shifts and long animation frames since
 * it loaded (buffered observers, so it works even when telemetry started
 * after navigation). Frames are split at the first user input: `loadWorstMs`
 * is the longest frame before it (all frames when there was none) and
 * `inputWorstMs` the longest from it on. Runs in the page, so it must stay
 * self-contained.
 */
const measureJank = () =>
  new Promise<{
    cls: number;
    worstFrameMs: number;
    loadWorstMs: number;
    inputWorstMs: number;
    frames: boolean;
    worstPhases: string;
    worstScripts: string[];
  }>(resolve => {
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    let cls = 0;
    let firstInputAt = Number.POSITIVE_INFINITY;
    const frames: { startTime: number; duration: number }[] = [];
    let worst: { duration: number; phases: string; scripts: string[] } = {
      duration: 0,
      phases: '',
      scripts: [],
    };
    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      let loadWorstMs = 0;
      let inputWorstMs = 0;
      // Without first-input timing every frame counts as after input, so
      // none is ever averaged away.
      const split = types.includes('first-input') ? firstInputAt : 0;
      for (const frame of frames) {
        if (frame.startTime < split)
          loadWorstMs = Math.max(loadWorstMs, frame.duration);
        else inputWorstMs = Math.max(inputWorstMs, frame.duration);
      }
      resolve({
        cls,
        worstFrameMs: Math.max(loadWorstMs, inputWorstMs),
        loadWorstMs,
        inputWorstMs,
        frames: types.includes('long-animation-frame'),
        worstPhases: worst.phases,
        worstScripts: worst.scripts,
      });
    };
    const watch = (type: string, take: (entry: PerformanceEntry) => void) => {
      if (!types.includes(type)) return done();
      const observer = new PerformanceObserver(list =>
        list.getEntries().forEach(take)
      );
      observer.observe({ type, buffered: true });
      setTimeout(() => {
        observer.takeRecords().forEach(take);
        observer.disconnect();
        done();
      }, 50);
    };
    watch('layout-shift', entry => {
      const shift = entry as PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      };
      if (!shift.hadRecentInput) cls += shift.value;
    });
    watch('first-input', entry => {
      firstInputAt = Math.min(firstInputAt, entry.startTime);
    });
    watch('long-animation-frame', entry => {
      frames.push({ startTime: entry.startTime, duration: entry.duration });
      if (entry.duration <= worst.duration) return;
      // The scripts that ran in the longest frame, longest first, so a long
      // frame names its cause in the run log.
      const scripts =
        (
          entry as PerformanceEntry & {
            scripts?: {
              duration: number;
              invoker?: string;
              sourceURL?: string;
              sourceFunctionName?: string;
            }[];
          }
        ).scripts ?? [];
      // Where the frame's time went: tasks before rendering, then rendering
      // (rAF callbacks, style and layout, paint). A frame with no script
      // attribution is usually style, layout or paint.
      const timing = entry as PerformanceEntry & {
        renderStart?: number;
        styleAndLayoutStart?: number;
      };
      const end = entry.startTime + entry.duration;
      const renderStart = timing.renderStart || end;
      const styleStart = timing.styleAndLayoutStart || end;
      worst = {
        duration: entry.duration,
        phases: `tasks ${Math.round(renderStart - entry.startTime)}ms, render ${Math.round(end - renderStart)}ms (style+layout+paint ${Math.round(end - styleStart)}ms)`,
        scripts: [...scripts]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 3)
          .map(
            script =>
              `${Math.round(script.duration)}ms ${script.invoker ?? '?'} ${(script.sourceURL ?? '').split('?')[0]}${script.sourceFunctionName ? `#${script.sourceFunctionName}` : ''}`
          ),
      };
    });
  });

/** scripts/lib/prod-cert-truth.mjs JANK_LIMITS['jank.worst-frame-ms'].max */
const FRAME_LIMIT_MS = 200;
/** Loads judged per frozen frame, as the product crawl does (ready-gate.mjs). */
export const FRAME_SAMPLES = 3;

/** Median of the samples; the lower middle for an even count. */
export function medianMs(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * One more cold load of `url` in a new tab of the same browser context (same
 * sign-in, HTTP cache off), returning its longest frame, or null when the
 * load or the measurement fails.
 */
async function coldLoadWorstFrame(
  currentPage: Page,
  url: string
): Promise<number | null> {
  const context = currentPage.context();
  const tab = await context.newPage();
  try {
    // A warm-cache repeat would flatter the page, so a browser that cannot
    // turn the cache off (not Chromium) takes no repeat loads.
    const cdp = await context.newCDPSession(tab);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await tab.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await tab
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => undefined);
    const jank = await tab.evaluate(measureJank);
    return jank.frames ? jank.loadWorstMs : null;
  } catch {
    return null;
  } finally {
    await tab.close().catch(() => undefined);
  }
}

/**
 * Jank evidence (truthful certification, 2026-11-08). Records the page's
 * layout shifts and long animation frames as `jank.*` observations.
 * scripts/prod-cert.mjs fails the surface past CLS 0.1 or a frame blocked
 * over 200 ms (scripts/lib/prod-cert-truth.mjs JANK_LIMITS). CLS here is the
 * plain sum of unexpected shifts, stricter than the session-window CLS of
 * Web Vitals, and is judged on this load.
 *
 * Frame timing on a shared CI runner is noisy (Nov 8: one cert load of the
 * profile measured 376.6 ms, the crawl's repeat loads 106 and 176 ms). A
 * page-load frame over the limit is measured on two more cold loads and
 * judged on the median of three, like the product crawl; the check summary
 * names the worst load. Frames after the step's first input are never
 * repeated or averaged: the worst of them stands. If a repeat load fails,
 * the first load's number stands.
 */
async function recordJank(currentPage: Page, surface: string): Promise<void> {
  if (!process.env.PROD_CERT_STEPS_FILE) return;
  try {
    const jank = await currentPage.evaluate(measureJank);
    // The contract ledger keys on contract and dimension, so the dimension
    // names the surface: one surface's jank must not overwrite another's.
    recordCertObservation({
      surface,
      contractId: 'jank.cls',
      dimension: `stability:${surface}`,
      value: jank.cls,
      unit: 'score',
    });
    if (!jank.frames) return;
    // Only the load is repeated, so only the load's frames are compared
    // across loads; a long frame after the first input stands as measured.
    const samples = [jank.loadWorstMs];
    if (jank.loadWorstMs > FRAME_LIMIT_MS) {
      const url = currentPage.url();
      for (let n = 1; n < FRAME_SAMPLES; n += 1) {
        const again = await coldLoadWorstFrame(currentPage, url);
        if (again === null) break;
        samples.push(again);
      }
    }
    const judged = samples.length === FRAME_SAMPLES;
    const load = judged ? medianMs(samples) : jank.loadWorstMs;
    if (Math.max(load, jank.inputWorstMs) > FRAME_LIMIT_MS) {
      // Receipts upload as artifacts; the run log is where a fixer reads
      // which scripts held the longest frame.
      process.stdout.write(
        `[prod-cert:jank] ${surface} longest frame ${Math.round(jank.worstFrameMs)}ms; loads ${samples.map(Math.round).join('/')}ms; ${jank.worstPhases}; scripts: ${jank.worstScripts.join(' | ') || 'none attributed'}\n`
      );
    }
    recordCertObservation({
      surface,
      contractId: 'jank.worst-frame-ms',
      dimension: `responsiveness:${surface}`,
      value: Math.max(load, jank.inputWorstMs),
      unit: 'ms',
      ...(judged ? { sampleSize: samples.length, samples } : {}),
    });
  } catch {
    // Best-effort evidence: a page that cannot be evaluated records nothing.
  }
}

/**
 * Admin certifications-inventory readback (JOV-9625 outcome rework). One
 * attempt per run: sign in as the documented admin fixture and read
 * `GET /api/ovie/certifications`. Folded into the landing receipt as
 * evidence — never a check — so a not-viable fixture records the exact
 * blocker without turning any golden-path surface red.
 */
export function recordAdminReadback(result: {
  readonly status: 'passed' | 'blocked' | 'failed';
  readonly detail: string;
}): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file) return;
  try {
    appendFileSync(
      file,
      `${JSON.stringify({ kind: 'readback', ...result })}\n`
    );
  } catch {
    // Evidence is best-effort; the test result is authoritative.
  }
}

/**
 * A measured quality-contract observation (canon/quality-contracts.jsonl),
 * recorded from the authenticated browser run. Folded into the surface receipt.
 */
export function recordCertObservation(observation: {
  readonly surface: string;
  readonly contractId: string;
  readonly dimension: string;
  readonly value: number;
  readonly unit: string;
  /** Loads the value was judged on, when more than one. */
  readonly sampleSize?: number;
  /** Every load's value, the worst included, when more than one. */
  readonly samples?: readonly number[];
}): void {
  const file = process.env.PROD_CERT_STEPS_FILE;
  if (!file || !Number.isFinite(observation.value)) return;
  try {
    appendFileSync(
      file,
      `${JSON.stringify({ kind: 'observation', sampleSize: 1, ...observation })}\n`
    );
  } catch {
    // Best-effort evidence.
  }
}
