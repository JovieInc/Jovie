import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  type Browser,
  chromium,
  type Locator,
  type Page,
} from '@playwright/test';
import { PAC_TAB_BAR_RETURN_VISIT_KEY } from '../lib/profile/pac-tab-bar-experiment';
import {
  assertResolvedPerfRoutePath,
  assertValidPerfRouteManifest,
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

export interface GuardSample {
  readonly finalUrl: string;
  readonly resolvedPath: string;
  readonly timingValues: Record<PerfTimingMetricName, number>;
  readonly resourceValues: Record<PerfResourceMetricName, number>;
}

export interface MetricResult {
  readonly name: string;
  readonly measured: number;
  readonly budget: number;
  readonly unit: '' | 'ms' | 'KB';
  readonly passed: boolean;
  readonly overshootPct: number;
}

export interface ViolationResult extends MetricResult {
  readonly kind: 'timing' | 'resource';
  readonly routeId: string;
}

export type TimingConfirmationReason =
  | 'clean-confirmation'
  | 'persistent-timing-violation'
  | 'resource-violation';

export interface TimingConfirmation {
  readonly confirmation: MetricResult;
  readonly initial: ViolationResult;
  readonly reason: TimingConfirmationReason;
  readonly routeId: string;
  readonly samples: readonly GuardSample[];
  readonly terminalStatus: 'fail' | 'pass';
}

export interface PageMeasurement {
  readonly rawResourceSizes: Record<PerfResourceMetricName, number>;
  readonly rawTimings: Record<PerfTimingMetricName, number>;
  readonly resourceSizes: readonly MetricResult[];
  readonly samples: readonly GuardSample[];
  readonly timings: readonly MetricResult[];
  readonly url: string;
}

export interface PageResult extends PageMeasurement {
  readonly auth: boolean;
  readonly configuredPath: string;
  readonly group: string;
  readonly id: string;
  readonly initialMeasurement?: PageMeasurement;
  readonly initialViolations: readonly ViolationResult[];
  readonly primaryMetric: PerfTimingMetricName;
  readonly resolvedPath: string;
  readonly routeSurface: string;
  readonly timingConfirmations: readonly TimingConfirmation[];
  readonly terminalStatus: 'fail' | 'pass';
  readonly violations: readonly ViolationResult[];
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
const TIMING_CONFIRMATION_RUNS = 3;
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

function loadAuthCookies(_baseUrl: string, authPath?: string) {
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

export function resolveWarmNavigationStartPath(
  route: PerfRouteDefinition,
  resolvedPath: string
) {
  const startPath = route.warmNavigationStartPath;
  if (!startPath) {
    throw new TypeError(
      `Warm-navigation route "${route.id}" is missing warmNavigationStartPath.`
    );
  }

  const resolvedStartPath = resolveExpectedDynamicPath(startPath, resolvedPath);
  assertResolvedPerfRoutePath(route, resolvedStartPath);
  return resolvedStartPath;
}

function expectedRoutePaths(route: PerfRouteDefinition, resolvedPath: string) {
  const redirectDestinations = (
    (route.readySelectors.redirectDestinations ?? []) as readonly string[]
  ).map(expectedPath => resolveExpectedDynamicPath(expectedPath, resolvedPath));
  const expected = new Set<string>(
    route.measureMode === 'redirect'
      ? redirectDestinations
      : [resolvedPath, ...redirectDestinations]
  );
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

export async function waitForExpectedUrl(
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
    { timeout: timeoutMs, waitUntil: 'domcontentloaded' }
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
  usePageWarmStart = false,
  timeoutMs = READY_TIMEOUT_MS
) {
  const loadingSelectors = route.readySelectors.loading;
  const contentSelectors = route.readySelectors.content;

  if (loadingSelectors?.length) {
    await waitForAnyVisible(
      page,
      [...loadingSelectors, ...(contentSelectors ?? [])],
      timeoutMs
    ).catch(() => null);
    await waitForAllHidden(page, loadingSelectors, timeoutMs).catch(
      () => undefined
    );
  }

  await waitForAnyVisible(page, contentSelectors, timeoutMs);
  if (usePageWarmStart) {
    return await readWarmNavigationElapsed(page);
  }
  return Date.now() - startedAt;
}

/**
 * Warm navigation is ready only when destination-owned content is usable.
 * Persistent source-shell and loading selectors are deliberately insufficient:
 * they can remain visible while the destination is stalled or broken.
 */
export async function waitForWarmDestinationReady(
  page: Page,
  route: PerfRouteDefinition,
  startedAt: number,
  usePageWarmStart = false,
  timeoutMs = READY_TIMEOUT_MS
) {
  return waitForContentReady(
    page,
    route,
    startedAt,
    usePageWarmStart,
    timeoutMs
  );
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

export async function measureWarmNavigationRoute(
  page: Page,
  route: PerfRouteDefinition,
  baseUrl: string,
  url: string
) {
  const parsedUrl = new URL(url);
  const resolvedDestinationPath = `${parsedUrl.pathname}${parsedUrl.search}`;
  const startPath = resolveWarmNavigationStartPath(
    route,
    resolvedDestinationPath
  );

  if (route.measureMode === 'profile-warm-transition') {
    // The profile tab-bar experiment intentionally hides navigation for some
    // first-time visitors. This contract measures the warmed/returning state
    // named in JOV-4780, where the real visible controls are available.
    await page.addInitScript(storageKey => {
      globalThis.localStorage.setItem(storageKey, '1');
    }, PAC_TAB_BAR_RETURN_VISIT_KEY);
  }

  await page.goto(resolveRouteUrl(baseUrl, startPath), {
    timeout: NAVIGATION_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  });
  await page
    .waitForLoadState('networkidle', { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
  const navTriggerSelectors = route.readySelectors.navTrigger ?? [];
  const visibleTrigger = await waitForVisibleTrigger(page, navTriggerSelectors);
  if (!visibleTrigger) {
    throw new Error(
      `Warm-navigation route "${route.id}" could not find a visible nav trigger from "${startPath}". Selectors: ${navTriggerSelectors.join(', ')}.`
    );
  }

  const startedAt = Date.now();
  const expectedPaths = expectedRoutePaths(route, resolvedDestinationPath);
  await armWarmNavigationStart(visibleTrigger);
  const routeReadyPromise = waitForExpectedUrl(page, expectedPaths);
  await visibleTrigger.click({ noWaitAfter: true });

  await routeReadyPromise;
  const warmShellResponse = await readWarmNavigationElapsed(page);
  const shouldMeasureDestinationContent =
    hasTimingBudget(route, 'skeleton-to-content') ||
    (route.measureMode === 'profile-warm-transition' &&
      hasTimingBudget(route, 'interactive-shell-ready'));
  const skeletonToContent = shouldMeasureDestinationContent
    ? await waitForContentReady(page, route, startedAt, true)
    : 0;

  return {
    skeletonToContent,
    warmShellResponse,
  };
}

export async function measureSameRouteInteraction(
  page: Page,
  route: PerfRouteDefinition,
  baseUrl: string
) {
  const startPath = route.interactionStartPath;
  if (!startPath) {
    throw new TypeError(
      `Same-route interaction "${route.id}" is missing interactionStartPath.`
    );
  }

  await page.goto(resolveRouteUrl(baseUrl, startPath), {
    timeout: NAVIGATION_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  });
  await page
    .waitForLoadState('networkidle', { timeout: 5_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);

  const triggerSelectors = route.readySelectors.navTrigger ?? [];
  const visibleTrigger = await waitForVisibleTrigger(page, triggerSelectors);
  if (!visibleTrigger) {
    throw new Error(
      `Same-route interaction "${route.id}" could not find a visible trigger on "${startPath}". Selectors: ${triggerSelectors.join(', ')}.`
    );
  }

  const startedAt = Date.now();
  await armWarmNavigationStart(visibleTrigger);
  await visibleTrigger.click({ noWaitAfter: true });
  await waitForAnyVisible(page, route.readySelectors.shell);
  const warmShellResponse = await readWarmNavigationElapsed(page);

  const currentUrl = new URL(page.url());
  if (!matchesExpectedPath(currentUrl, route.path)) {
    throw new Error(
      `Same-route interaction "${route.id}" navigated to "${currentUrl.pathname}${currentUrl.search}" instead of remaining on "${route.path}".`
    );
  }

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
    viewport: route.viewport,
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

export function applyProfileWarmTransitionTimings(
  timingValues: Record<PerfTimingMetricName, number>,
  interaction: {
    readonly skeletonToContent: number;
    readonly warmShellResponse: number;
  }
) {
  timingValues['warm-shell-response'] = interaction.warmShellResponse;
  timingValues['interactive-shell-ready'] = interaction.skeletonToContent;
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
      const measureAuthenticatedShell =
        route.measureMode === 'same-route-interaction'
          ? measureSameRouteInteraction(page, route, baseUrl)
          : measureWarmNavigationRoute(page, route, baseUrl, url);
      await measureAuthenticatedShell.catch(async () => {
        await page.goto(url, {
          timeout: NAVIGATION_TIMEOUT_MS,
          waitUntil: 'domcontentloaded',
        });
        await waitForAnyVisible(page, route.readySelectors.content).catch(
          () => undefined
        );
      });
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
    let browserMetrics:
      | Awaited<ReturnType<typeof collectBrowserMetrics>>
      | undefined;

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

    if (route.measureMode === 'profile-warm-transition') {
      // Keep cold target-load evidence independent from the warmed user
      // action. The first leg owns FCP/LCP/CLS/FID/TTFB and resources; the
      // second leg starts from a real profile state and clicks a visible tab.
      await page.goto(url, {
        timeout: NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      await waitForAnyVisible(page, route.readySelectors.content);
      browserMetrics = await collectBrowserMetrics(page, devMode);

      const interactionPage = await context.newPage();
      try {
        await interactionPage.addInitScript(PERF_INIT_SCRIPT);
        const interaction = await measureWarmNavigationRoute(
          interactionPage,
          route,
          baseUrl,
          url
        );
        applyProfileWarmTransitionTimings(timingValues, interaction);
      } finally {
        await interactionPage.close();
      }
    } else if (
      route.measureMode === 'warm-navigation' ||
      route.measureMode === 'same-route-interaction'
    ) {
      const interaction =
        route.measureMode === 'warm-navigation'
          ? await measureWarmNavigationRoute(page, route, baseUrl, url)
          : await measureSameRouteInteraction(page, route, baseUrl);
      timingValues['warm-shell-response'] = interaction.warmShellResponse;
      timingValues['skeleton-to-content'] = interaction.skeletonToContent;
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
        try {
          await waitForAnyVisible(page, route.readySelectors.content);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Route ${route.id} content selectors never became visible at ${page.url()} (expected ${resolvedPath}). Selectors: ${route.readySelectors.content.join(', ')}. Underlying: ${reason}`
          );
        }
      }

      if (hasTimingBudget(route, 'skeleton-to-content')) {
        timingValues['skeleton-to-content'] = await waitForContentReady(
          page,
          route,
          startedAt
        );
      }
    }

    browserMetrics ??= await collectBrowserMetrics(page, devMode);
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
      .map(metric => ({
        ...metric,
        kind: 'timing' as const,
        routeId: route.id,
      })),
    ...resourceSizes
      .filter(metric => !metric.passed)
      .map(metric => ({
        ...metric,
        kind: 'resource' as const,
        routeId: route.id,
      })),
  ];

  return {
    auth: route.requiresAuth,
    configuredPath: route.path,
    group: route.group,
    id: route.id,
    initialViolations: violations,
    primaryMetric,
    rawResourceSizes,
    rawTimings,
    resolvedPath,
    resourceSizes,
    routeSurface: route.surface,
    samples,
    timings,
    timingConfirmations: [],
    terminalStatus: violations.length > 0 ? 'fail' : 'pass',
    url: medianSample.finalUrl,
    violations,
  };
}

type TimingConfirmationPage = Pick<
  PageResult,
  'id' | 'resourceSizes' | 'samples' | 'timings'
>;

export function evaluateTimingConfirmation(
  initialViolation: ViolationResult,
  confirmationPage: TimingConfirmationPage
): TimingConfirmation {
  if (initialViolation.kind !== 'timing') {
    throw new TypeError(
      `Only timing violations may be confirmed; ${initialViolation.name} is ${initialViolation.kind}.`
    );
  }

  if (confirmationPage.id !== initialViolation.routeId) {
    throw new Error(
      `Timing confirmation route mismatch: expected ${initialViolation.routeId}, received ${confirmationPage.id}.`
    );
  }

  const confirmation = confirmationPage.timings.find(
    metric => metric.name === initialViolation.name
  );
  if (!confirmation) {
    throw new Error(
      `Timing confirmation metric mismatch for ${initialViolation.routeId}: expected ${initialViolation.name}.`
    );
  }

  const resourceViolations = confirmationPage.resourceSizes.filter(
    metric => !metric.passed
  );
  const reason: TimingConfirmationReason =
    resourceViolations.length > 0
      ? 'resource-violation'
      : confirmation.passed
        ? 'clean-confirmation'
        : 'persistent-timing-violation';

  return {
    confirmation,
    initial: initialViolation,
    reason,
    routeId: initialViolation.routeId,
    samples: confirmationPage.samples,
    terminalStatus: reason === 'clean-confirmation' ? 'pass' : 'fail',
  };
}

function pageMeasurement(page: PageResult): PageMeasurement {
  return {
    rawResourceSizes: page.rawResourceSizes,
    rawTimings: page.rawTimings,
    resourceSizes: page.resourceSizes,
    samples: page.samples,
    timings: page.timings,
    url: page.url,
  };
}

export function buildConfirmedPageResult(
  initialPage: PageResult,
  confirmationPage: PageResult,
  timingConfirmations: readonly TimingConfirmation[]
): PageResult {
  return {
    ...confirmationPage,
    initialMeasurement: pageMeasurement(initialPage),
    initialViolations: initialPage.initialViolations,
    terminalStatus: confirmationPage.violations.length > 0 ? 'fail' : 'pass',
    timingConfirmations,
  };
}

export async function confirmTimingViolations(options: {
  readonly initialViolations: readonly ViolationResult[];
  readonly measureConfirmation: () => Promise<TimingConfirmationPage>;
}) {
  if (options.initialViolations.length === 0) {
    throw new TypeError('Timing confirmation requires at least one violation.');
  }

  if (
    options.initialViolations.some(violation => violation.kind !== 'timing')
  ) {
    throw new TypeError(
      'Timing confirmation cannot launder resource violations or other terminal failures.'
    );
  }

  const confirmationPage = await options.measureConfirmation();
  return options.initialViolations.map(initialViolation =>
    evaluateTimingConfirmation(initialViolation, confirmationPage)
  );
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
    const routes = END_USER_PERF_ROUTE_MANIFEST.map(route =>
      normalizeLoadedRoute(route)
    );
    assertValidPerfRouteManifest(routes);
    return routes;
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

  const routes = loadedManifest.map(route => normalizeLoadedRoute(route));
  assertValidPerfRouteManifest(routes);
  return routes;
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
      assertResolvedPerfRoutePath(route, resolvedPath);
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

      const initialPage = createPageResult(
        route,
        resolvedPath,
        samples,
        devMode
      );
      const initialTimingViolations = initialPage.violations.filter(
        violation => violation.kind === 'timing'
      );
      const hasResourceViolation = initialPage.violations.some(
        violation => violation.kind === 'resource'
      );

      if (initialTimingViolations.length === 0 || hasResourceViolation) {
        results.push(initialPage);
        continue;
      }

      logInfo(
        `  timing violation on ${route.id}; running ${TIMING_CONFIRMATION_RUNS}-sample same-route confirmation`,
        options
      );
      const confirmationSamples: GuardSample[] = [];
      for (let index = 0; index < TIMING_CONFIRMATION_RUNS; index += 1) {
        const sample = await measureRouteSample(
          browser,
          route,
          options.baseUrl,
          url,
          resolvedPath,
          authCookies,
          devMode
        );
        confirmationSamples.push(sample);
        logInfo(
          `  confirmation ${index + 1}/${TIMING_CONFIRMATION_RUNS}: ${formatMetric(sample.timingValues[getPrimaryTimingMetricName(route)], 'ms')}`,
          options
        );
      }

      const confirmationPage = createPageResult(
        route,
        resolvedPath,
        confirmationSamples,
        devMode
      );
      const timingConfirmations = await confirmTimingViolations({
        initialViolations: initialTimingViolations,
        measureConfirmation: async () => confirmationPage,
      });

      results.push(
        buildConfirmedPageResult(
          initialPage,
          confirmationPage,
          timingConfirmations
        )
      );
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
      )}${page.timingConfirmations.length > 0 ? ' (confirmation evidence)' : ''}`
    );

    for (const metric of [...page.timings, ...page.resourceSizes]) {
      const confirmation = page.timingConfirmations.find(
        candidate => candidate.confirmation.name === metric.name
      );
      const status = metric.passed
        ? 'PASS'
        : confirmation?.terminalStatus === 'pass'
          ? 'CONFIRMED'
          : 'FAIL';
      console.log(
        `  ${status} ${metric.name}: ${formatMetric(metric.measured, metric.unit)} / ${formatMetric(metric.budget, metric.unit)}`
      );
    }

    for (const confirmation of page.timingConfirmations) {
      console.log(
        `  ${confirmation.terminalStatus.toUpperCase()} confirmation ${confirmation.routeId}/${confirmation.confirmation.name}: ${formatMetric(confirmation.confirmation.measured, confirmation.confirmation.unit)} / ${formatMetric(confirmation.confirmation.budget, confirmation.confirmation.unit)} (${confirmation.reason})`
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
