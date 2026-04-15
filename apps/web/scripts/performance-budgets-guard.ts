import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  type Browser,
  chromium,
  type Locator,
  type Page,
} from '@playwright/test';
import { APP_ROUTES } from '../constants/routes';
import {
  END_USER_PERF_ROUTE_MANIFEST,
  getPrimaryTimingMetricName,
  getRouteResourceBudgets,
  getRouteTimingBudgets,
  type PerfResourceMetricName,
  type PerfRouteDefinition,
  type PerfTimingMetricName,
} from './performance-route-manifest';

type SameSiteValue = 'Lax' | 'None' | 'Strict';

interface AuthCookie {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly path: string;
  readonly url?: string;
  readonly expires?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: SameSiteValue;
}

interface StorageStateFile {
  readonly cookies?: readonly AuthCookie[];
}

interface PerfPageWindow extends Window {
  __perfWarmNavFallbackStart?: number;
  __perfWarmNavStart?: number;
}

export interface GuardCliOptions {
  readonly authPath?: string;
  readonly baseUrl: string;
  readonly groupIds: readonly string[];
  readonly json: boolean;
  readonly manifestPath?: string;
  readonly paths: readonly string[];
  readonly routeIds: readonly string[];
  readonly runs: number;
}

interface GuardSample {
  readonly finalUrl: string;
  readonly resolvedPath: string;
  readonly timingValues: Record<PerfTimingMetricName, number>;
  readonly resourceValues: Record<PerfResourceMetricName, number>;
}

interface MetricResult {
  readonly name: string;
  readonly measured: number;
  readonly budget: number;
  readonly unit: '' | 'ms' | 'KB';
  readonly passed: boolean;
  readonly overshootPct: number;
}

interface ViolationResult extends MetricResult {
  readonly kind: 'timing' | 'resource';
}

export interface PageResult {
  readonly auth: boolean;
  readonly configuredPath: string;
  readonly group: string;
  readonly id: string;
  readonly primaryMetric: PerfTimingMetricName;
  readonly resolvedPath: string;
  readonly resourceSizes: readonly MetricResult[];
  readonly routeSurface: string;
  readonly samples: readonly GuardSample[];
  readonly timings: readonly MetricResult[];
  readonly url: string;
  readonly violations: readonly ViolationResult[];
  readonly rawResourceSizes: Record<PerfResourceMetricName, number>;
  readonly rawTimings: Record<PerfTimingMetricName, number>;
}

export interface GuardSummary {
  readonly baseUrl: string;
  readonly checkedAt: string;
  readonly pages: readonly PageResult[];
  readonly status: 'fail' | 'pass';
  readonly violationCount: number;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Dev mode overhead factor. Turbopack in dev serves unminified JS, includes
 * devtools, HMR client, and React development builds. These inflate bundle
 * sizes ~60-80% and add latency vs production. We detect dev mode by checking
 * if the base URL is localhost and apply a multiplier to budgets so the guard
 * remains useful during local development without false failures.
 */
const DEV_TIMING_BUDGET_FACTOR = 20;
const DEV_RESOURCE_BUDGET_FACTOR = 1.8;
const DEFAULT_AUTH_STATE_PATHS = [
  resolve(repoRoot, '.context', 'perf', 'auth', 'user.json'),
  resolve(webRoot, 'tests', '.auth', 'user.json'),
  resolve(webRoot, '.auth', 'session.json'),
] as const;
const DEFAULT_RUNS = 3;
const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 15_000;
const PERF_INIT_SCRIPT = `
(() => {
  const metrics = {
    cls: 0,
    fid: 0,
    lcp: 0,
  };

  window.__perfBudgetMetrics = metrics;

  new PerformanceObserver(list => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last?.startTime) {
      metrics.lcp = last.startTime;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        metrics.cls += entry.value ?? 0;
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });

  new PerformanceObserver(list => {
    const entry = list.getEntries()[0];
    if (entry) {
      metrics.fid = (entry.processingStart ?? 0) - entry.startTime;
    }
  }).observe({ type: 'first-input', buffered: true });
})();
`;

function writeStderr(message: string) {
  process.stderr.write(`${message}\n`);
}

function parsePositiveOddInteger(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed % 2 === 0) {
    throw new TypeError(`Expected a positive odd integer for ${label}`);
  }
  return parsed;
}

export function parseGuardCliArgs(
  args: readonly string[],
  defaultBaseUrl = DEFAULT_BASE_URL
): GuardCliOptions {
  const groupIds: string[] = [];
  const paths: string[] = [];
  const routeIds: string[] = [];
  let authPath: string | undefined;
  let baseUrl = defaultBaseUrl;
  let json = false;
  let manifestPath: string | undefined;
  let runs = DEFAULT_RUNS;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --path');
      }
      paths.push(value);
      index += 1;
      continue;
    }

    if (arg === '--group') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --group');
      }
      groupIds.push(value);
      index += 1;
      continue;
    }

    if (arg === '--route-id') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --route-id');
      }
      routeIds.push(value);
      index += 1;
      continue;
    }

    if (arg === '--auth-path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --auth-path');
      }
      authPath = value;
      index += 1;
      continue;
    }

    if (arg === '--base-url') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --base-url');
      }
      baseUrl = value;
      index += 1;
      continue;
    }

    if (arg === '--manifest') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --manifest');
      }
      manifestPath = value;
      index += 1;
      continue;
    }

    if (arg === '--runs') {
      runs = parsePositiveOddInteger(args[index + 1], '--runs');
      index += 1;
      continue;
    }

    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return {
    authPath,
    baseUrl,
    groupIds,
    json,
    manifestPath,
    paths,
    routeIds,
    runs,
  };
}

function logInfo(message: string, options: GuardCliOptions) {
  if (!options.json) {
    console.log(message);
  }
}

function normalizeSameSite(
  sameSite: string | undefined
): SameSiteValue | undefined {
  if (sameSite === 'Lax' || sameSite === 'None' || sameSite === 'Strict') {
    return sameSite;
  }

  return undefined;
}

function resolveAuthStatePath(authPath?: string) {
  if (authPath) {
    return isAbsolute(authPath) ? authPath : resolve(repoRoot, authPath);
  }

  return DEFAULT_AUTH_STATE_PATHS.find(path => existsSync(path));
}

function loadAuthCookies(baseUrl: string, authPath?: string) {
  const domain = new URL(baseUrl).hostname;
  const explicitAuthStatePath = authPath
    ? resolveAuthStatePath(authPath)
    : undefined;

  if (explicitAuthStatePath && existsSync(explicitAuthStatePath)) {
    const parsed = JSON.parse(
      readFileSync(explicitAuthStatePath, 'utf8')
    ) as StorageStateFile;

    return (parsed.cookies ?? []).map(cookie => ({
      ...cookie,
      path: cookie.path || '/',
      sameSite: normalizeSameSite(cookie.sameSite),
    }));
  }

  // E2E test auth bypass: inject synthetic bypass cookies so the middleware
  // skips Clerk auth entirely. This allows perf measurement of authenticated
  // routes without a real Clerk session.
  const testAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
  const testUserId = process.env.E2E_CLERK_USER_ID?.trim();
  if (testAuthBypass && testUserId) {
    return [
      { domain, name: '__e2e_test_mode', path: '/', value: 'bypass-auth' },
      { domain, name: '__e2e_test_user_id', path: '/', value: testUserId },
    ] satisfies readonly AuthCookie[];
  }

  const cookieValue = process.env.CLERK_SESSION_COOKIE?.trim();
  if (cookieValue) {
    return [
      { domain, name: '__session', path: '/', value: cookieValue },
    ] satisfies readonly AuthCookie[];
  }

  const storageStatePath = resolveAuthStatePath(authPath);
  if (!storageStatePath || !existsSync(storageStatePath)) {
    return [] as const satisfies readonly AuthCookie[];
  }

  const parsed = JSON.parse(
    readFileSync(storageStatePath, 'utf8')
  ) as StorageStateFile;

  return (parsed.cookies ?? []).map(cookie => ({
    ...cookie,
    path: cookie.path || '/',
    sameSite: normalizeSameSite(cookie.sameSite),
  }));
}

function resolveRouteUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.replace(/\/$/, '') + '/').toString();
}

function formatMetric(value: number, unit: '' | 'KB' | 'ms') {
  return `${value.toFixed(1)}${unit}`;
}

function calculateOvershootPct(measured: number, budget: number) {
  if (measured <= budget || budget === 0) {
    return 0;
  }

  return Number((((measured - budget) / budget) * 100).toFixed(2));
}

function buildMetricResult(
  name: string,
  measured: number,
  budget: number,
  unit: '' | 'KB' | 'ms'
): MetricResult {
  return {
    budget,
    measured,
    name,
    overshootPct: calculateOvershootPct(measured, budget),
    passed: measured <= budget,
    unit,
  };
}

function hasTimingBudget(
  route: PerfRouteDefinition,
  metric: PerfTimingMetricName
) {
  return getRouteTimingBudgets(route).some(entry => entry.metric === metric);
}

function extractRouteTokenValues(
  templatePath: string,
  resolvedPath: string
): ReadonlyMap<string, string> {
  const templateUrl = new URL(`http://local${templatePath}`);
  const resolvedUrl = new URL(`http://local${resolvedPath}`);
  const templateSegments = templateUrl.pathname.split('/').filter(Boolean);
  const resolvedSegments = resolvedUrl.pathname.split('/').filter(Boolean);
  const values = new Map<string, string>();

  for (let index = 0; index < templateSegments.length; index += 1) {
    const templateSegment = templateSegments[index];
    const resolvedSegment = resolvedSegments[index];

    if (!templateSegment || !resolvedSegment) {
      continue;
    }

    if (
      templateSegment.startsWith('[') &&
      templateSegment.endsWith(']') &&
      !templateSegment.startsWith('[...')
    ) {
      values.set(templateSegment.slice(1, -1), resolvedSegment);
    }
  }

  return values;
}

function resolveExpectedDynamicPath(
  templatePath: string,
  resolvedPath: string
) {
  const tokenValues = extractRouteTokenValues(templatePath, resolvedPath);
  let expectedPath = templatePath;

  for (const [token, value] of tokenValues) {
    expectedPath = expectedPath.replaceAll(`[${token}]`, value);
  }

  return expectedPath;
}

function expectedRoutePaths(route: PerfRouteDefinition, resolvedPath: string) {
  const expected = new Set<string>([
    resolvedPath,
    ...(
      (route.readySelectors.redirectDestinations ?? []) as readonly string[]
    ).map(expectedPath =>
      resolveExpectedDynamicPath(expectedPath, resolvedPath)
    ),
  ]);
  return [...expected];
}

function normalizePathWithQuery(input: string) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const parsed = new URL(input);
    return `${parsed.pathname}${parsed.search}`;
  }

  return input;
}

function matchesExpectedPath(actualUrl: URL, expectedPath: string) {
  const normalizedExpected = normalizePathWithQuery(expectedPath);
  const actualPath = `${actualUrl.pathname}${actualUrl.search}`;

  if (normalizedExpected.includes('?')) {
    return actualPath === normalizedExpected;
  }

  return actualUrl.pathname === normalizedExpected;
}

async function waitForExpectedUrl(
  page: Page,
  expectedPaths: readonly string[],
  timeoutMs = READY_TIMEOUT_MS
) {
  if (expectedPaths.length === 0) {
    return;
  }

  await page.waitForURL(
    currentUrl =>
      expectedPaths.some(expectedPath =>
        matchesExpectedPath(currentUrl, expectedPath)
      ),
    { timeout: timeoutMs }
  );
}

async function waitForAnyVisible(
  page: Page,
  selectors: readonly string[] | undefined,
  timeoutMs = READY_TIMEOUT_MS
) {
  if (!selectors || selectors.length === 0) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return selector;
        }
      }
    }

    await page.waitForTimeout(50);
  }

  throw new Error(
    `Timed out waiting for one of these selectors to become visible: ${selectors.join(', ')}`
  );
}

async function waitForVisibleTrigger(
  page: Page,
  selectors: readonly string[] | undefined,
  timeoutMs = READY_TIMEOUT_MS
): Promise<Locator | null> {
  if (!selectors || selectors.length === 0) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }
    }

    await page.waitForTimeout(50);
  }

  return null;
}

async function waitForAllHidden(
  page: Page,
  selectors: readonly string[] | undefined,
  timeoutMs = READY_TIMEOUT_MS
) {
  if (!selectors || selectors.length === 0) {
    return;
  }

  await Promise.all(
    selectors.map(async selector => {
      const locator = page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (count === 0) {
        return;
      }

      await locator
        .waitFor({ state: 'hidden', timeout: timeoutMs })
        .catch(async () => {
          await locator.waitFor({ state: 'detached', timeout: timeoutMs });
        });
    })
  );
}

async function waitForContentReady(
  page: Page,
  route: PerfRouteDefinition,
  startedAt: number,
  usePageWarmStart = false
) {
  const loadingSelectors = route.readySelectors.loading;
  const contentSelectors =
    route.readySelectors.content ?? route.readySelectors.shell;

  if (loadingSelectors?.length) {
    await waitForAnyVisible(page, [
      ...loadingSelectors,
      ...(contentSelectors ?? []),
    ]).catch(() => null);
    await waitForAllHidden(page, loadingSelectors).catch(() => undefined);
  }

  await waitForAnyVisible(page, contentSelectors);
  if (usePageWarmStart) {
    return await readWarmNavigationElapsed(page);
  }
  return Date.now() - startedAt;
}

async function waitForWarmShellReady(
  page: Page,
  route: PerfRouteDefinition,
  startedAt: number,
  usePageWarmStart = false
) {
  const selectors = [
    ...(route.readySelectors.loading ?? []),
    ...(route.readySelectors.content ?? []),
    ...(route.readySelectors.shell ?? []),
  ];
  await waitForAnyVisible(page, selectors.length > 0 ? selectors : undefined);
  if (usePageWarmStart) {
    return await readWarmNavigationElapsed(page);
  }
  return Date.now() - startedAt;
}

async function armWarmNavigationStart(locator: Locator) {
  await locator.evaluate(node => {
    const perfWindow = window as PerfPageWindow;
    perfWindow.__perfWarmNavStart = undefined;
    perfWindow.__perfWarmNavFallbackStart = performance.now();
    node.addEventListener(
      'pointerdown',
      () => {
        if (typeof perfWindow.__perfWarmNavStart !== 'number') {
          perfWindow.__perfWarmNavStart = performance.now();
        }
      },
      {
        capture: true,
        once: true,
      }
    );
    node.addEventListener(
      'click',
      () => {
        if (typeof perfWindow.__perfWarmNavStart !== 'number') {
          perfWindow.__perfWarmNavStart = performance.now();
        }
      },
      {
        capture: true,
        once: true,
      }
    );
  });
}

async function readWarmNavigationElapsed(page: Page) {
  return await page.evaluate(() => {
    const perfWindow = window as PerfPageWindow;
    const start =
      typeof perfWindow.__perfWarmNavStart === 'number'
        ? perfWindow.__perfWarmNavStart
        : perfWindow.__perfWarmNavFallbackStart;

    if (typeof start !== 'number') {
      return 0;
    }

    return performance.now() - start;
  });
}

async function measureWarmNavigationRoute(
  page: Page,
  route: PerfRouteDefinition,
  baseUrl: string,
  url: string
) {
  await page.goto(resolveRouteUrl(baseUrl, APP_ROUTES.DASHBOARD), {
    timeout: NAVIGATION_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  });
  await page
    .waitForLoadState('networkidle', { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
  const visibleTrigger = await waitForVisibleTrigger(
    page,
    route.readySelectors.navTrigger
  ).catch(() => null);

  const startedAt = Date.now();
  const parsedUrl = new URL(url);
  const expectedPaths = expectedRoutePaths(
    route,
    `${parsedUrl.pathname}${parsedUrl.search}`
  );
  const navTriggerSelector = route.readySelectors.navTrigger?.[0];
  let routeReadyPromise: Promise<unknown> | null = null;
  if (visibleTrigger) {
    await armWarmNavigationStart(visibleTrigger);
    routeReadyPromise = waitForExpectedUrl(page, expectedPaths);
    await visibleTrigger.click({ noWaitAfter: true });
  } else if (navTriggerSelector) {
    const trigger = page.locator(navTriggerSelector).first();
    await armWarmNavigationStart(trigger);
    routeReadyPromise = waitForExpectedUrl(page, expectedPaths);
    await trigger.click({ noWaitAfter: true });
  } else {
    await page.goto(url, {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    routeReadyPromise = waitForExpectedUrl(page, expectedPaths);
  }

  await routeReadyPromise;
  const warmShellResponse = await waitForWarmShellReady(
    page,
    route,
    startedAt,
    true
  );
  const skeletonToContent = hasTimingBudget(route, 'skeleton-to-content')
    ? await waitForContentReady(page, route, startedAt, true)
    : 0;

  return {
    skeletonToContent,
    warmShellResponse,
  };
}

async function collectBrowserMetrics(page: Page, devMode = false) {
  await page
    .waitForLoadState('networkidle', { timeout: 10_000 })
    .catch(() => undefined);

  await page.mouse.click(8, 8).catch(() => undefined);
  await page.waitForTimeout(200);

  return page.evaluate((isDevMode: boolean) => {
    const metrics =
      (
        window as Window & {
          __perfBudgetMetrics?: {
            cls?: number;
            fid?: number;
            lcp?: number;
          };
        }
      ).__perfBudgetMetrics ?? {};
    const navigationEntry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paintEntries = performance.getEntriesByType('paint');
    const firstContentfulPaint =
      paintEntries.find(entry => entry.name === 'first-contentful-paint')
        ?.startTime ?? 0;
    const resourceEntries = performance.getEntriesByType(
      'resource'
    ) as PerformanceResourceTiming[];

    const resourceValues = {
      font: 0,
      image: 0,
      script: 0,
      stylesheet: 0,
      total: 0,
    };

    for (const entry of resourceEntries) {
      const size = entry.transferSize || entry.encodedBodySize || 0;
      const resourceName = entry.name.toLowerCase();

      // Skip dev-only resources that won't exist in production builds
      if (
        isDevMode &&
        (resourceName.includes('next-devtools') ||
          resourceName.includes('hmr-client') ||
          resourceName.includes('react-refresh'))
      ) {
        continue;
      }

      resourceValues.total += size;

      if (entry.initiatorType === 'script' || resourceName.includes('.js')) {
        resourceValues.script += size;
        continue;
      }

      if (
        entry.initiatorType === 'img' ||
        entry.initiatorType === 'image' ||
        /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/.test(resourceName)
      ) {
        resourceValues.image += size;
        continue;
      }

      if (entry.initiatorType === 'css' || resourceName.includes('.css')) {
        resourceValues.stylesheet += size;
        continue;
      }

      if (
        /\.(eot|otf|ttf|woff2?)(\?|$)/.test(resourceName) ||
        entry.initiatorType === 'font'
      ) {
        resourceValues.font += size;
      }
    }

    return {
      finalUrl: window.location.href,
      resourceValues: {
        font: resourceValues.font / 1024,
        image: resourceValues.image / 1024,
        script: resourceValues.script / 1024,
        stylesheet: resourceValues.stylesheet / 1024,
        total: resourceValues.total / 1024,
      },
      timingValues: {
        'cumulative-layout-shift': metrics.cls ?? 0,
        'first-contentful-paint': firstContentfulPaint,
        'first-input-delay': metrics.fid ?? 0,
        'interactive-shell-ready': 0,
        'largest-contentful-paint': metrics.lcp ?? 0,
        'redirect-complete': 0,
        'skeleton-to-content': 0,
        'time-to-first-byte': navigationEntry?.responseStart ?? 0,
        'warm-shell-response': 0,
      },
    };
  }, devMode);
}

function medianSampleByMetric(
  samples: readonly GuardSample[],
  metric: PerfTimingMetricName
) {
  const ordered = [...samples].sort(
    (left, right) => left.timingValues[metric] - right.timingValues[metric]
  );
  return ordered[Math.floor(ordered.length / 2)] as GuardSample;
}

function medianNumber(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function medianTimingValue(
  samples: readonly GuardSample[],
  metric: PerfTimingMetricName
) {
  return medianNumber(samples.map(sample => sample.timingValues[metric]));
}

function medianResourceValue(
  samples: readonly GuardSample[],
  metric: PerfResourceMetricName
) {
  return medianNumber(samples.map(sample => sample.resourceValues[metric]));
}

function createContextOptions(
  route: PerfRouteDefinition,
  cookies: readonly AuthCookie[]
) {
  const hasCookies = route.requiresAuth && cookies.length > 0;
  return {
    storageState: hasCookies
      ? {
          cookies: [...cookies],
          origins: [],
        }
      : undefined,
  };
}

async function createContext(
  browser: Browser,
  route: PerfRouteDefinition,
  cookies: readonly AuthCookie[]
) {
  const options = createContextOptions(route, cookies);
  const context = await browser.newContext(options);
  return context;
}

async function warmRoute(
  browser: Browser,
  route: PerfRouteDefinition,
  baseUrl: string,
  url: string,
  cookies: readonly AuthCookie[]
) {
  if (route.warmupStrategy === 'none') {
    return;
  }

  const context = await createContext(browser, route, cookies);
  try {
    const page = await context.newPage();
    if (route.warmupStrategy === 'authenticated-shell') {
      await measureWarmNavigationRoute(page, route, baseUrl, url).catch(
        async () => {
          await page.goto(url, {
            timeout: NAVIGATION_TIMEOUT_MS,
            waitUntil: 'domcontentloaded',
          });
          await waitForAnyVisible(page, route.readySelectors.content).catch(
            () => undefined
          );
        }
      );
      return;
    }

    await page.goto(url, {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await waitForAnyVisible(page, route.readySelectors.content).catch(
      () => undefined
    );
  } finally {
    await context.close();
  }
}

async function measureRouteSample(
  browser: Browser,
  route: PerfRouteDefinition,
  baseUrl: string,
  url: string,
  resolvedPath: string,
  cookies: readonly AuthCookie[],
  devMode = false
): Promise<GuardSample> {
  const context = await createContext(browser, route, cookies);
  try {
    const page = await context.newPage();
    await page.addInitScript(PERF_INIT_SCRIPT);

    const timingValues: Record<PerfTimingMetricName, number> = {
      'cumulative-layout-shift': 0,
      'first-contentful-paint': 0,
      'first-input-delay': 0,
      'interactive-shell-ready': 0,
      'largest-contentful-paint': 0,
      'redirect-complete': 0,
      'skeleton-to-content': 0,
      'time-to-first-byte': 0,
      'warm-shell-response': 0,
    };

    if (route.measureMode === 'warm-navigation') {
      const warmNavigation = await measureWarmNavigationRoute(
        page,
        route,
        baseUrl,
        url
      );
      timingValues['warm-shell-response'] = warmNavigation.warmShellResponse;
      timingValues['skeleton-to-content'] = warmNavigation.skeletonToContent;
    } else {
      const startedAt = Date.now();
      await page.goto(url, {
        timeout: NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });

      if (
        route.measureMode === 'redirect' ||
        hasTimingBudget(route, 'redirect-complete')
      ) {
        await waitForExpectedUrl(page, expectedRoutePaths(route, resolvedPath));
        timingValues['redirect-complete'] = Date.now() - startedAt;
      }

      if (
        route.measureMode === 'interactive-shell' ||
        hasTimingBudget(route, 'interactive-shell-ready')
      ) {
        await waitForAnyVisible(page, route.readySelectors.shell);
        await waitForAnyVisible(
          page,
          route.readySelectors.content ?? route.readySelectors.shell
        );
        timingValues['interactive-shell-ready'] = Date.now() - startedAt;
      } else if (route.readySelectors.content?.length) {
        await waitForAnyVisible(page, route.readySelectors.content).catch(
          () => undefined
        );
      }

      if (hasTimingBudget(route, 'skeleton-to-content')) {
        timingValues['skeleton-to-content'] = await waitForContentReady(
          page,
          route,
          startedAt
        );
      }
    }

    const browserMetrics = await collectBrowserMetrics(page, devMode);
    timingValues['cumulative-layout-shift'] =
      browserMetrics.timingValues['cumulative-layout-shift'];
    timingValues['first-contentful-paint'] =
      browserMetrics.timingValues['first-contentful-paint'];
    timingValues['first-input-delay'] =
      browserMetrics.timingValues['first-input-delay'];
    timingValues['largest-contentful-paint'] =
      browserMetrics.timingValues['largest-contentful-paint'];
    timingValues['time-to-first-byte'] =
      browserMetrics.timingValues['time-to-first-byte'];

    return {
      finalUrl: browserMetrics.finalUrl,
      resolvedPath,
      resourceValues: browserMetrics.resourceValues,
      timingValues,
    };
  } finally {
    await context.close();
  }
}

function createPageResult(
  route: PerfRouteDefinition,
  resolvedPath: string,
  samples: readonly GuardSample[],
  isDevMode = false
): PageResult {
  const primaryMetric = getPrimaryTimingMetricName(route);
  const medianSample = medianSampleByMetric(samples, primaryMetric);
  const rawTimings = {
    'cumulative-layout-shift': medianTimingValue(
      samples,
      'cumulative-layout-shift'
    ),
    'first-contentful-paint': medianTimingValue(
      samples,
      'first-contentful-paint'
    ),
    'first-input-delay': medianTimingValue(samples, 'first-input-delay'),
    'interactive-shell-ready': medianTimingValue(
      samples,
      'interactive-shell-ready'
    ),
    'largest-contentful-paint': medianTimingValue(
      samples,
      'largest-contentful-paint'
    ),
    'redirect-complete': medianTimingValue(samples, 'redirect-complete'),
    'skeleton-to-content': medianTimingValue(samples, 'skeleton-to-content'),
    'time-to-first-byte': medianTimingValue(samples, 'time-to-first-byte'),
    'warm-shell-response': medianTimingValue(samples, 'warm-shell-response'),
  } satisfies Record<PerfTimingMetricName, number>;
  const rawResourceSizes = {
    font: medianResourceValue(samples, 'font'),
    image: medianResourceValue(samples, 'image'),
    script: medianResourceValue(samples, 'script'),
    stylesheet: medianResourceValue(samples, 'stylesheet'),
    total: medianResourceValue(samples, 'total'),
  } satisfies Record<PerfResourceMetricName, number>;

  const timingFactor = isDevMode ? DEV_TIMING_BUDGET_FACTOR : 1;
  const resourceFactor = isDevMode ? DEV_RESOURCE_BUDGET_FACTOR : 1;

  const timings = getRouteTimingBudgets(route).map(budget =>
    buildMetricResult(
      budget.metric,
      rawTimings[budget.metric],
      budget.budget * timingFactor,
      budget.metric === 'cumulative-layout-shift' ? '' : 'ms'
    )
  );
  const resourceSizes = getRouteResourceBudgets(route).map(budget =>
    buildMetricResult(
      budget.resourceType,
      rawResourceSizes[budget.resourceType],
      budget.budget * resourceFactor,
      'KB'
    )
  );

  const violations: ViolationResult[] = [
    ...timings
      .filter(metric => !metric.passed)
      .map(metric => ({ ...metric, kind: 'timing' as const })),
    ...resourceSizes
      .filter(metric => !metric.passed)
      .map(metric => ({ ...metric, kind: 'resource' as const })),
  ];

  return {
    auth: route.requiresAuth,
    configuredPath: route.path,
    group: route.group,
    id: route.id,
    primaryMetric,
    rawResourceSizes,
    rawTimings,
    resolvedPath,
    resourceSizes,
    routeSurface: route.surface,
    samples,
    timings,
    url: medianSample.finalUrl,
    violations,
  };
}

function sortRoutesForExecution(routes: readonly PerfRouteDefinition[]) {
  return [...routes].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.id.localeCompare(right.id);
  });
}

function normalizeLoadedRoute(route: PerfRouteDefinition): PerfRouteDefinition {
  return {
    ...route,
    resourceBudgets: getRouteResourceBudgets(route),
    timingBudgets: getRouteTimingBudgets(route),
  };
}

export async function loadGuardManifestRoutes(manifestPath?: string) {
  if (!manifestPath) {
    return END_USER_PERF_ROUTE_MANIFEST.map(route =>
      normalizeLoadedRoute(route)
    );
  }

  const resolvedManifestPath = isAbsolute(manifestPath)
    ? manifestPath
    : resolve(repoRoot, manifestPath);
  const loadedModule = await import(pathToFileURL(resolvedManifestPath).href);
  const loadedManifest = (
    typeof loadedModule.getEndUserPerfRouteManifest === 'function'
      ? loadedModule.getEndUserPerfRouteManifest()
      : (loadedModule.END_USER_PERF_ROUTE_MANIFEST ?? loadedModule.default)
  ) as readonly PerfRouteDefinition[] | undefined;

  if (!Array.isArray(loadedManifest)) {
    throw new TypeError(
      `Manifest ${resolvedManifestPath} does not export a route array.`
    );
  }

  return loadedManifest.map(route => normalizeLoadedRoute(route));
}

export function selectGuardRoutes(
  routes: readonly PerfRouteDefinition[],
  options: GuardCliOptions
) {
  const groupIds = new Set(options.groupIds);
  const paths = new Set(options.paths);
  const routeIds = new Set(options.routeIds);
  const hasGroupFilter = groupIds.size > 0;
  const hasPathFilter = paths.size > 0;
  const hasRouteFilter = routeIds.size > 0;

  const selected = routes.filter(route => {
    if (hasRouteFilter && routeIds.has(route.id)) {
      return true;
    }

    if (hasPathFilter && paths.has(route.path)) {
      return true;
    }

    if (hasGroupFilter && groupIds.has(route.group)) {
      return true;
    }

    return !hasGroupFilter && !hasPathFilter && !hasRouteFilter;
  });

  if (
    (hasGroupFilter || hasPathFilter || hasRouteFilter) &&
    selected.length === 0
  ) {
    throw new TypeError(
      `No performance routes matched selection. Available ids: ${routes
        .map(route => route.id)
        .join(', ')}`
    );
  }

  return sortRoutesForExecution(selected);
}

async function resolvePathForRoute(
  route: PerfRouteDefinition,
  baseUrl: string,
  authCookies: readonly AuthCookie[]
) {
  if (!route.resolvePath) {
    return route.path;
  }

  return route.resolvePath(route, {
    authCookies,
    baseUrl,
  });
}

function isLocalDevUrl(url: string): boolean {
  // CI always uses strict production budgets, even when testing against localhost
  if (process.env.CI) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function measureRoutesAgainstBudgets(
  routes: readonly PerfRouteDefinition[],
  options: GuardCliOptions
) {
  const devMode = isLocalDevUrl(options.baseUrl);
  const browser = await chromium.launch();
  try {
    const authCookies = loadAuthCookies(options.baseUrl, options.authPath);
    const results: PageResult[] = [];

    for (const route of routes) {
      if (route.requiresAuth && authCookies.length === 0) {
        throw new Error(
          `Route ${route.id} requires auth, but no storage state was found. Pass --auth-path or run perf:auth first.`
        );
      }

      const resolvedPath = await resolvePathForRoute(
        route,
        options.baseUrl,
        authCookies
      );
      const url = resolveRouteUrl(options.baseUrl, resolvedPath);
      logInfo(`Checking ${route.id} -> ${resolvedPath}`, options);

      await warmRoute(browser, route, options.baseUrl, url, authCookies);

      const samples: GuardSample[] = [];
      for (let index = 0; index < options.runs; index += 1) {
        const sample = await measureRouteSample(
          browser,
          route,
          options.baseUrl,
          url,
          resolvedPath,
          authCookies,
          devMode
        );
        samples.push(sample);
        logInfo(
          `  sample ${index + 1}/${options.runs}: ${formatMetric(sample.timingValues[getPrimaryTimingMetricName(route)], 'ms')}`,
          options
        );
      }

      results.push(createPageResult(route, resolvedPath, samples, devMode));
    }

    return results;
  } finally {
    await browser.close();
  }
}

function printHumanSummary(summary: GuardSummary) {
  console.log(`Performance budgets: ${summary.status.toUpperCase()}`);

  for (const page of summary.pages) {
    console.log(
      `${page.id} (${page.resolvedPath}) primary=${page.primaryMetric}=${formatMetric(
        page.rawTimings[page.primaryMetric],
        page.primaryMetric === 'cumulative-layout-shift' ? '' : 'ms'
      )}`
    );

    for (const metric of [...page.timings, ...page.resourceSizes]) {
      const status = metric.passed ? 'PASS' : 'FAIL';
      console.log(
        `  ${status} ${metric.name}: ${formatMetric(metric.measured, metric.unit)} / ${formatMetric(metric.budget, metric.unit)}`
      );
    }
  }
}

export async function runPerformanceBudgetsGuard(
  options: GuardCliOptions
): Promise<GuardSummary> {
  const manifestRoutes = await loadGuardManifestRoutes(options.manifestPath);
  const selectedRoutes = selectGuardRoutes(manifestRoutes, options);
  const pages = await measureRoutesAgainstBudgets(selectedRoutes, options);
  const violationCount = pages.reduce(
    (total, page) => total + page.violations.length,
    0
  );

  return {
    baseUrl: options.baseUrl,
    checkedAt: new Date().toISOString(),
    pages,
    status: violationCount > 0 ? 'fail' : 'pass',
    violationCount,
  };
}

async function main() {
  const options = parseGuardCliArgs(process.argv.slice(2));
  const summary = await runPerformanceBudgetsGuard(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printHumanSummary(summary);
  }

  if (summary.status === 'fail') {
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(message);
    process.exit(1);
  });
}
