import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  type ConsoleMessage,
  type Page,
  type Request as PlaywrightRequest,
} from '@playwright/test';
import {
  collectBrowserMetrics,
  createContextOptions,
  loadAuthCookies,
  PERF_INIT_SCRIPT,
  type PerformanceContextCookie,
  waitForAnyVisible,
} from './performance-budgets-guard';
import {
  getRouteTimingBudgets,
  type PerfAuthCookie,
  type PerfRouteDefinition,
  type PerfTimingMetricName,
} from './performance-route-manifest';
import type {
  SmoothPlatform,
  SmoothSurfaceDefinition,
} from './performance-smooth-manifest';
import {
  isHydrationConsoleText,
  SMOOTH_PROBE_INIT_SCRIPT,
  type SmoothProbeSnapshot,
} from './performance-smooth-probes';
import type { SmoothRunSample } from './performance-smooth-types';

const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_MS = 1_500;

export type SmoothAuthCookies = ReturnType<typeof loadAuthCookies>;

function resolveRouteUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

export async function resolvePathForRoute(
  route: PerfRouteDefinition,
  baseUrl: string,
  authCookies: SmoothAuthCookies
) {
  if (!route.resolvePath) return route.path;
  return route.resolvePath(route, {
    authCookies: authCookies as readonly PerfAuthCookie[],
    baseUrl,
  });
}

async function applyCpuThrottle(page: Page, rate: number) {
  if (rate <= 1) return;
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
}

function attachRequestTrackers(page: Page) {
  const documentUrls: string[] = [];
  const onRequest = (request: PlaywrightRequest) => {
    if (request.resourceType() === 'document') {
      documentUrls.push(request.url());
    }
  };
  page.on('request', onRequest);
  return {
    documentUrls,
    dispose() {
      page.off('request', onRequest);
    },
  };
}

function attachConsoleTrackers(page: Page) {
  const hydrationMessages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (isHydrationConsoleText(text)) {
      hydrationMessages.push(text);
    }
  };
  const onPageError = (error: Error) => {
    const text = String(error);
    if (isHydrationConsoleText(text)) {
      hydrationMessages.push(text);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    hydrationMessages,
    dispose() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function readSmoothProbe(page: Page): Promise<SmoothProbeSnapshot> {
  return page.evaluate(() => {
    const probe = (
      window as Window & {
        __smoothProbe?: {
          documentRequests?: number;
          duplicateFetches?: number;
          flickerEvents?: number;
          flickerReasons?: string[];
          hydrationMessages?: string[];
          inpMs?: number | null;
        };
      }
    ).__smoothProbe;
    if (!probe) {
      return {
        inpMs: null,
        fullPageReloads: 0,
        duplicateFetches: 0,
        hydrationWarnings: 0,
        flickerEvents: 0,
        flickerReasons: [],
        hydrationMessages: [],
      };
    }
    return {
      inpMs: typeof probe.inpMs === 'number' ? probe.inpMs : null,
      fullPageReloads: probe.documentRequests ?? 0,
      duplicateFetches: probe.duplicateFetches ?? 0,
      hydrationWarnings: 0,
      flickerEvents: probe.flickerEvents ?? 0,
      flickerReasons: probe.flickerReasons ?? [],
      hydrationMessages: probe.hydrationMessages ?? [],
    };
  });
}

async function triggerMainInteraction(
  page: Page,
  surface: SmoothSurfaceDefinition
) {
  const selector = surface.interactionSelector;
  if (!selector) return;
  const first = selector.split(',')[0]?.trim();
  if (!first) return;
  const locator = page.locator(first).first();
  if ((await locator.count()) === 0) return;
  if (!(await locator.isVisible().catch(() => false))) return;
  await locator.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

export async function measureSmoothSample(options: {
  readonly browser: Browser;
  readonly route: PerfRouteDefinition;
  readonly surface: SmoothSurfaceDefinition;
  readonly platform: SmoothPlatform;
  readonly baseUrl: string;
  readonly resolvedPath: string;
  readonly authCookies: SmoothAuthCookies;
  readonly protectedOriginCookies: readonly PerformanceContextCookie[];
  readonly attempt: number;
  readonly cpuThrottleRate: number;
}): Promise<SmoothRunSample> {
  const {
    browser,
    route,
    surface,
    baseUrl,
    resolvedPath,
    authCookies,
    protectedOriginCookies,
    attempt,
    cpuThrottleRate,
  } = options;

  const contextOptions = createContextOptions(
    route,
    authCookies,
    protectedOriginCookies
  );
  const context: BrowserContext = await browser.newContext(
    contextOptions as Parameters<Browser['newContext']>[0]
  );
  const page = await context.newPage();
  const requestTracker = attachRequestTrackers(page);
  const consoleTracker = attachConsoleTrackers(page);

  try {
    await page.addInitScript(PERF_INIT_SCRIPT);
    await page.addInitScript(SMOOTH_PROBE_INIT_SCRIPT);
    await applyCpuThrottle(page, cpuThrottleRate);

    const url = resolveRouteUrl(baseUrl, resolvedPath);
    await page.goto(url, {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    if (route.readySelectors.content?.length) {
      await waitForAnyVisible(page, route.readySelectors.content);
    }

    await page.waitForTimeout(SETTLE_MS);
    await triggerMainInteraction(page, surface);
    await page.waitForTimeout(400);

    const requiredMetrics = getRouteTimingBudgets(route).map(
      budget => budget.metric
    ) as PerfTimingMetricName[];
    const browserMetrics = await collectBrowserMetrics(
      page,
      false,
      requiredMetrics
    );
    const probe = await readSmoothProbe(page);
    const documentReloads = Math.max(0, requestTracker.documentUrls.length - 1);

    return {
      attempt,
      cls: browserMetrics.timingValues['cumulative-layout-shift'],
      lcpMs: browserMetrics.timingValues['largest-contentful-paint'],
      inpMs: probe.inpMs ?? browserMetrics.timingValues['first-input-delay'],
      fcpMs: browserMetrics.timingValues['first-contentful-paint'],
      ttfbMs: browserMetrics.timingValues['time-to-first-byte'],
      fullPageReloads: Math.max(documentReloads, probe.fullPageReloads),
      duplicateFetches: probe.duplicateFetches,
      flickerEvents: probe.flickerEvents,
      hydrationWarnings: consoleTracker.hydrationMessages.length,
      flickerReasons: probe.flickerReasons,
      hydrationMessages: consoleTracker.hydrationMessages,
      finalUrl: browserMetrics.finalUrl,
    };
  } finally {
    requestTracker.dispose();
    consoleTracker.dispose();
    await context.close();
  }
}
