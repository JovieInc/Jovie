/**
 * Factory render measurer (JOV-7282): loads the candidate route from a
 * production build (`next build` + `next start`, never `next dev`) at 390
 * and 1440, captures screenshots, measures CLS and LCP with the browser's
 * PerformanceObserver, and runs the rendered-DOM taste detector (#19581).
 *
 * The budget and capture checks are pure; only `measureRoute` and
 * `serveProductionBuild` touch a browser or a server, and both always tear
 * down what they started. With no build to measure the provider reports
 * `credentials-unavailable`, never a fixture number.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import type { z } from 'zod';
import { CLS_INTERACTION_BUDGET } from '../../../../scripts/invariants/screen-certification.mjs';
import type { FactoryRenderCaptureSchema } from '../../data/marketing/factory/spine';
import {
  inspectRouteDom,
  type RouteDomFindingKind,
} from '../../tests/e2e/utils/route-dom-detector';
import { CAPTURE_VIEWPORTS } from './capture-integrity';
import type { RenderMeasurement, Unavailable } from './providers';

export const RENDER_BUDGETS = {
  /** Shared with the screen-certification gate (JOV-INV-018). */
  cls: CLS_INTERACTION_BUDGET,
  /** Core Web Vitals "good" LCP; the check is strictly under. */
  lcpMs: 2500,
} as const;

export const RENDER_VIEWPORTS = CAPTURE_VIEWPORTS;

export type RenderCapture = z.infer<typeof FactoryRenderCaptureSchema>;

export interface RenderCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Budget and capture checks over every viewport. A candidate is new, so no
 * DOM finding is baselined: any finding fails its viewport.
 */
export function evaluateRenderCaptures(
  captures: readonly RenderCapture[]
): RenderCheck[] {
  const checks: RenderCheck[] = [];
  const seen = new Set(captures.map(capture => capture.viewport));
  const missing = RENDER_VIEWPORTS.filter(v => !seen.has(v.id));
  checks.push({
    id: 'render-viewports',
    ok: missing.length === 0,
    message: `missing viewport capture(s): ${missing.map(v => v.width).join(', ')}`,
  });
  for (const capture of captures) {
    const at = `${capture.viewport}@${capture.width}`;
    checks.push(
      {
        id: `render-served:${capture.viewport}`,
        ok: capture.httpStatus === 200,
        message: `${at} returned HTTP ${capture.httpStatus}`,
      },
      {
        id: `render-cls:${capture.viewport}`,
        ok: capture.cls <= RENDER_BUDGETS.cls,
        message: `${at} CLS ${capture.cls} > ${RENDER_BUDGETS.cls}`,
      },
      {
        id: `render-lcp:${capture.viewport}`,
        ok: capture.lcpMs !== null && capture.lcpMs < RENDER_BUDGETS.lcpMs,
        message:
          capture.lcpMs === null
            ? `${at} reported no LCP entry`
            : `${at} LCP ${capture.lcpMs}ms >= ${RENDER_BUDGETS.lcpMs}ms`,
      },
      {
        id: `render-dom:${capture.viewport}`,
        ok: capture.domFindings.length === 0,
        message: `${at} DOM findings: ${capture.domFindings
          .map(finding => `${finding.kind} (${finding.message})`)
          .join('; ')}`,
      }
    );
  }
  return checks;
}

/**
 * Worst case across viewports, the numbers the render artifact reports. A
 * missing LCP is not a number to report; its `render-lcp` check fails.
 */
export function summarizeCaptures(captures: readonly RenderCapture[]): {
  cls: number;
  lcpMs: number;
} {
  return {
    cls: Math.max(0, ...captures.map(capture => capture.cls)),
    lcpMs: Math.max(0, ...captures.map(capture => capture.lcpMs ?? 0)),
  };
}

export function sha256Digest(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Deterministic captures for `--dry`; paths say `fixture:` so no one mistakes them. */
export function fixtureCaptures(
  route: string,
  metrics: { readonly cls: number; readonly lcpMs: number }
): RenderCapture[] {
  return RENDER_VIEWPORTS.map(viewport => {
    const path = `fixture:${route}@${viewport.width}.png`;
    return {
      viewport: viewport.id,
      width: viewport.width,
      height: viewport.height,
      httpStatus: 200,
      screenshot: { path, digest: sha256Digest(path) },
      cls: metrics.cls,
      lcpMs: metrics.lcpMs,
      domFindings: [],
    };
  });
}

/**
 * CLS and LCP from buffered PerformanceObserver entries after load settles.
 * Unlike the e2e perf helper, a missing LCP stays null instead of 0.
 */
const READ_VITALS = `new Promise(resolve => {
  let cls = 0;
  let lcp = null;
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) cls += entry.value || 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => {
      const last = list.getEntries().at(-1);
      if (last) lcp = last.renderTime || last.loadTime || last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  setTimeout(() => resolve({ cls, lcp }), 1500);
})`;

/** Renders one route at every viewport against an already served build. */
export async function measureRoute(options: {
  readonly browser: Browser;
  readonly baseUrl: string;
  readonly route: string;
  readonly outDir: string;
}): Promise<RenderCapture[]> {
  mkdirSync(options.outDir, { recursive: true });
  const captures: RenderCapture[] = [];
  for (const viewport of RENDER_VIEWPORTS) {
    const context = await options.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'dark',
      deviceScaleFactor: 1,
    });
    try {
      // tsx (factory:run) compiles with keepNames, so functions handed to
      // page.evaluate reference esbuild's `__name` helper.
      await context.addInitScript('globalThis.__name ??= fn => fn;');
      const page = await context.newPage();
      const response = await page.goto(
        new URL(options.route, options.baseUrl).toString(),
        { waitUntil: 'load' }
      );
      const vitals = (await page.evaluate(READ_VITALS)) as {
        cls: number;
        lcp: number | null;
      };
      // Fonts and a stationary animation state keep rerender identity meaningful.
      await page.evaluate('document.fonts.ready');
      const bytes = await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      });
      const path = join(options.outDir, `${viewport.id}-${viewport.width}.png`);
      writeFileSync(path, bytes, { flag: 'wx' });
      const dom = await inspectRouteDom(page, { surface: 'marketing' });
      captures.push({
        viewport: viewport.id,
        width: viewport.width,
        height: viewport.height,
        httpStatus: response?.status() ?? 0,
        screenshot: { path, digest: sha256Digest(bytes) },
        cls: Math.round(vitals.cls * 10_000) / 10_000,
        lcpMs: vitals.lcp === null ? null : Math.round(vitals.lcp),
        domFindings: dom.findings.map(finding => ({
          kind: finding.kind satisfies RouteDomFindingKind,
          message: finding.message,
          elements: [...finding.elements],
        })),
      });
    } finally {
      await context.close();
    }
  }
  return captures;
}

export interface ServedBuild {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

function killTree(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.pid === undefined) return resolve();
    child.once('exit', () => resolve());
    try {
      // Detached, so the negative pid reaches next's worker processes too.
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      resolve();
    }
  });
}

function runToExit(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    );
  });
}

/** One production build, then `next start`; `stop()` kills the server tree. */
export async function serveProductionBuild(options: {
  readonly appDir: string;
  readonly port: number;
  readonly skipBuild?: boolean;
  readonly readyTimeoutMs?: number;
  /** Extra env for this build and server only, e.g. the factory preview. */
  readonly env?: Readonly<Record<string, string>>;
}): Promise<ServedBuild> {
  const env = { ...process.env, ...options.env };
  if (!options.skipBuild) {
    await runToExit('pnpm', ['run', 'build'], options.appDir, env);
  }
  const server = spawn(
    'pnpm',
    ['exec', 'next', 'start', '-p', String(options.port)],
    { cwd: options.appDir, stdio: 'ignore', detached: true, env }
  );
  const baseUrl = `http://127.0.0.1:${options.port}`;
  const deadline = Date.now() + (options.readyTimeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    try {
      await fetch(baseUrl, { method: 'HEAD' });
      return { baseUrl, stop: () => killTree(server) };
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  await killTree(server);
  throw new Error(`next start on :${options.port} never became ready`);
}

export interface LiveRenderOptions {
  /** A production build that is already served, e.g. by CI. */
  readonly baseUrl?: string;
  /** Build and serve apps/web locally for the measurement, then stop it. */
  readonly build?: { readonly appDir: string; readonly port: number };
  /** Default screenshot directory; the render stage passes its run dir. */
  readonly outDir: string;
  readonly launch?: () => Promise<Browser>;
  readonly serve?: typeof serveProductionBuild;
}

/**
 * A shadow candidate for the measurer's own local build: the solutions
 * route serves it noindex,nofollow (content/pages/solutions/preview.ts).
 */
export interface RenderPreview {
  readonly recordId: string;
  /** Holds `<family>-<slug>/page-record.json`. */
  readonly runsDir: string;
}

export interface RenderRequestOptions {
  readonly outDir?: string;
  readonly preview?: RenderPreview;
}

/** Live `measureRender`: fails closed to credentials-unavailable. */
export function liveRenderMeasurer(options: LiveRenderOptions) {
  return async (
    route: string,
    at: RenderRequestOptions = {}
  ): Promise<RenderMeasurement | Unavailable> => {
    if (!options.baseUrl && !options.build) {
      return {
        status: 'credentials-unavailable',
        reason: `no production build to measure ${route}: set FACTORY_RENDER_BASE_URL or FACTORY_RENDER_BUILD=1`,
      };
    }
    let served: ServedBuild | null = null;
    let browser: Browser | null = null;
    try {
      const baseUrl =
        options.baseUrl ??
        (served = await (options.serve ?? serveProductionBuild)({
          appDir: options.build?.appDir ?? '.',
          port: options.build?.port ?? 3100,
          ...(at.preview
            ? {
                env: {
                  FACTORY_PREVIEW_RECORD: at.preview.recordId,
                  FACTORY_PREVIEW_RUNS_DIR: at.preview.runsDir,
                },
              }
            : {}),
        })).baseUrl;
      browser = await (options.launch ?? launchChromium)();
      const captures = await measureRoute({
        browser,
        baseUrl,
        route,
        outDir: at.outDir ?? options.outDir,
      });
      return { status: 'ok', ...summarizeCaptures(captures), captures };
    } catch (error) {
      return {
        status: 'credentials-unavailable',
        reason:
          `render measurer could not run: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            400
          ),
      };
    } finally {
      await browser?.close();
      await served?.stop();
    }
  };
}

async function launchChromium(): Promise<Browser> {
  const { chromium } = await import('@playwright/test');
  return chromium.launch();
}

/** Live options from the environment (Doppler wrapper); no secrets involved. */
export function renderOptionsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  outDir: string,
  appDir: string
): LiveRenderOptions {
  return {
    outDir,
    ...(env.FACTORY_RENDER_BASE_URL
      ? { baseUrl: env.FACTORY_RENDER_BASE_URL }
      : {}),
    ...(env.FACTORY_RENDER_BUILD === '1'
      ? {
          build: {
            appDir,
            port: Number(env.FACTORY_RENDER_PORT ?? 3100),
          },
        }
      : {}),
  };
}
