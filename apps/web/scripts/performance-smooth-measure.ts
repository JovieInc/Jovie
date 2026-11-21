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

/** Origin+pathname identity so intentional leaves are not counted as reloads. */
export function smoothRouteIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}`;
  } catch {
    return url;
  }
}

/** Same-route reload/dup only; destination docs after leave are expected navigation. */
export function classifySameRouteJank(options: {
  readonly measuredRoute: string;
  readonly finalUrl: string;
  readonly documentUrls: readonly string[];
  readonly probeReloads: number;
  readonly probeDuplicateFetches: number;
  readonly settleDuplicateFetches: number;
  readonly settleProbeReloads: number;
}): { readonly fullPageReloads: number; readonly duplicateFetches: number } {
  const stayedOnRoute =
    smoothRouteIdentity(options.finalUrl) === options.measuredRoute;
  if (!stayedOnRoute) {
    return {
      fullPageReloads: options.settleProbeReloads,
      duplicateFetches: options.settleDuplicateFetches,
    };
  }
  const sameRouteDocs = options.documentUrls.filter(
    url => smoothRouteIdentity(url) === options.measuredRoute
  );
  const documentReloads = Math.max(0, sameRouteDocs.length - 1);
  return {
    fullPageReloads: Math.max(documentReloads, options.probeReloads),
    duplicateFetches: options.probeDuplicateFetches,
  };
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
  // INP click without leaving the measured route (CTA navigations ≠ jank).
  await page.evaluate(() => {
    window.addEventListener(
      'click',
      event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('a[href], form button[type="submit"], form')) {
          event.preventDefault();
        }
      },
      { capture: true, once: true }
    );
  });
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
    const measuredRoute = smoothRouteIdentity(url);
    await page.goto(url, {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    if (route.readySelectors.content?.length) {
      await waitForAnyVisible(page, route.readySelectors.content);
    }

    await page.waitForTimeout(SETTLE_MS);
    const settleProbe = await readSmoothProbe(page);
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
    const jank = classifySameRouteJank({
      measuredRoute,
      finalUrl: browserMetrics.finalUrl || page.url(),
      documentUrls: requestTracker.documentUrls,
      probeReloads: probe.fullPageReloads,
      probeDuplicateFetches: probe.duplicateFetches,
      settleDuplicateFetches: settleProbe.duplicateFetches,
      settleProbeReloads: settleProbe.fullPageReloads,
    });

    return {
      attempt,
      cls: browserMetrics.timingValues['cumulative-layout-shift'],
      lcpMs: browserMetrics.timingValues['largest-contentful-paint'],
      inpMs: probe.inpMs ?? browserMetrics.timingValues['first-input-delay'],
      fcpMs: browserMetrics.timingValues['first-contentful-paint'],
      ttfbMs: browserMetrics.timingValues['time-to-first-byte'],
      fullPageReloads: jank.fullPageReloads,
      duplicateFetches: jank.duplicateFetches,
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
