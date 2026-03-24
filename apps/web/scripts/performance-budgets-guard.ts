#!/usr/bin/env tsx
/**
 * Performance Budgets Guard
 *
 * Validates page performance against budgets defined in performance-budgets.config.js.
 * Runs against BASE_URL (defaults to http://localhost:3000).
 *
 * For authenticated routes (auth: true in config), reads Clerk session cookies
 * from CLERK_SESSION_COOKIE env var or falls back to apps/web/.auth/session.json.
 *
 * Flags:
 *   --json         Emit machine-readable JSON to stdout
 *   --path <path>  Restrict to one or more configured budget paths
 *   --auth-path     Override the Clerk storage state path for auth routes
 */

import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';
import { APP_ROUTES } from '../constants/routes';

const require = createRequire(import.meta.url);

type TimingMetricName =
  | 'first-contentful-paint'
  | 'largest-contentful-paint'
  | 'cumulative-layout-shift'
  | 'first-input-delay'
  | 'time-to-first-byte'
  | 'skeleton-to-content'
  | 'warm-shell-response';

type ResourceMetricName = 'script' | 'image' | 'font' | 'stylesheet' | 'total';

type TimingBudget = {
  metric: TimingMetricName;
  budget: number;
};

type ResourceBudget = {
  resourceType: ResourceMetricName;
  budget: number;
};

type BudgetEntry = {
  path: string;
  auth?: boolean;
  timings: TimingBudget[];
  resourceSizes: ResourceBudget[];
};

type BudgetConfig = {
  budgets: BudgetEntry[];
};

type PageMetrics = {
  timings: Record<TimingMetricName, number>;
  resourceSizes: Record<ResourceMetricName, number>;
};

type CliOptions = {
  authPath?: string;
  json: boolean;
  paths: string[];
};

type MetricResult = {
  name: string;
  measured: number;
  budget: number;
  unit: '' | 'ms' | 'KB';
  passed: boolean;
  overshootPct: number;
};

type ViolationResult = MetricResult & {
  kind: 'timing' | 'resource';
};

type PageResult = {
  configuredPath: string;
  resolvedPath: string;
  url: string;
  auth: boolean;
  timings: MetricResult[];
  resourceSizes: MetricResult[];
  rawTimings: Record<TimingMetricName, number>;
  rawResourceSizes: Record<ResourceMetricName, number>;
  violations: ViolationResult[];
};

type GuardSummary = {
  baseUrl: string;
  status: 'pass' | 'fail';
  checkedAt: string;
  violationCount: number;
  pages: PageResult[];
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_PARAMS: Record<string, string> = {
  username: process.env.PERF_BUDGET_USERNAME || 'tim',
};

const AUTH_STORAGE_PATH = resolve(
  import.meta.dirname ?? __dirname,
  '../.auth/session.json'
);
const DASHBOARD_WARM_SHELL_START_PATH = APP_ROUTES.DASHBOARD;
const DASHBOARD_RELEASES_PATHS = [
  APP_ROUTES.RELEASES,
  APP_ROUTES.DASHBOARD_RELEASES,
] as const;
const DASHBOARD_RELEASES_LINK_SELECTOR = DASHBOARD_RELEASES_PATHS.map(
  path => `a[href="${path}"]`
).join(', ');
const DASHBOARD_RELEASES_READY_SELECTOR =
  '[data-testid="releases-loading"], [data-testid="releases-matrix"]';

const config = require('../performance-budgets.config.js') as BudgetConfig;

const parseCliArgs = (args: string[]): CliOptions => {
  const options: CliOptions = { json: false, paths: [] };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --path');
      }
      options.paths.push(value);
      index += 1;
      continue;
    }

    if (arg === '--auth-path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --auth-path');
      }
      options.authPath = value;
      index += 1;
      continue;
    }

    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return options;
};

const CLI_OPTIONS = parseCliArgs(process.argv.slice(2));

const toKilobytes = (bytes: number) => bytes / 1024;

const writeStderr = (message: string) => {
  process.stderr.write(`${message}\n`);
};

const logInfo = (message: string) => {
  if (!CLI_OPTIONS.json) {
    console.log(message);
  }
};

const logWarning = (message: string) => {
  if (CLI_OPTIONS.json) {
    writeStderr(message);
    return;
  }
  console.warn(message);
};

const resolvePath = (path: string) =>
  path.replaceAll(/\[([^\]]+)\]/g, (_match, key: string) => {
    const normalizedKey = key.toLowerCase();
    const envKey = `PERF_BUDGET_${normalizedKey.toUpperCase()}`;
    const value = process.env[envKey] || DEFAULT_PARAMS[normalizedKey];
    if (!value) {
      throw new TypeError(
        `Missing route param value for [${key}]. Set ${envKey}.`
      );
    }
    return value;
  });

const formatMetric = (value: number, unit: string) =>
  `${value.toFixed(1)}${unit}`;

const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

const matchesDashboardReleasesPath = (pathname: string) =>
  DASHBOARD_RELEASES_PATHS.some(route => matchesRoute(pathname, route));

const calculateOvershootPct = (measured: number, budget: number) => {
  if (measured <= budget || budget === 0) {
    return 0;
  }
  return Number((((measured - budget) / budget) * 100).toFixed(2));
};

const formatMetricResult = (
  name: string,
  measured: number,
  budget: number,
  unit: '' | 'ms' | 'KB'
): MetricResult => ({
  name,
  measured,
  budget,
  unit,
  passed: measured <= budget,
  overshootPct: calculateOvershootPct(measured, budget),
});

const selectBudgetEntries = (
  budgets: BudgetEntry[],
  paths: string[]
): BudgetEntry[] => {
  if (paths.length === 0) {
    return budgets;
  }

  const selected = budgets.filter(entry => paths.includes(entry.path));
  if (selected.length === 0) {
    throw new TypeError(
      `No budget entries matched --path. Available paths: ${budgets
        .map(entry => entry.path)
        .join(', ')}`
    );
  }
  return selected;
};

/**
 * Load Clerk session cookies for authenticated routes.
 * Priority: CLERK_SESSION_COOKIE env -> .auth/session.json file.
 */
const loadAuthCookies = (
  baseUrl: string
): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
}> => {
  const authStoragePath =
    CLI_OPTIONS.authPath ||
    process.env.PERF_BUDGET_AUTH_PATH ||
    AUTH_STORAGE_PATH;
  const cookieValue = process.env.CLERK_SESSION_COOKIE;
  if (cookieValue) {
    const domain = new URL(baseUrl).hostname;
    // Only inject __session; __clerk_db_jwt is a separate JWT and cannot be derived
    // from the session cookie value. Use .auth/session.json for full cookie fidelity.
    return [{ name: '__session', value: cookieValue, domain, path: '/' }];
  }

  if (existsSync(authStoragePath)) {
    try {
      const raw = readFileSync(authStoragePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.cookies)) {
        return data.cookies;
      }
    } catch {
      logWarning('  ⚠ Could not parse auth session file, skipping auth');
    }
  }

  return [];
};

const shouldMeasureWarmShellResponse = (url: string, needsAuth: boolean) => {
  if (!needsAuth) {
    return false;
  }

  const pathname = new URL(url).pathname;
  return matchesDashboardReleasesPath(pathname);
};

/**
 * Measure in-app navigation time from a warm authenticated dashboard shell
 * to the first visible releases shell state.
 */
const measureWarmShellResponse = async (
  page: Awaited<
    ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>
  >,
  baseUrl: string
): Promise<number> => {
  const start = Date.now();
  const appRootUrl = `${baseUrl.replace(/\/$/, '')}${DASHBOARD_WARM_SHELL_START_PATH}`;

  try {
    await page.goto(appRootUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForSelector('nav[aria-label="Dashboard navigation"]', {
      state: 'visible',
      timeout: 15000,
    });

    const releasesLink = page.locator(DASHBOARD_RELEASES_LINK_SELECTOR).first();
    await releasesLink.waitFor({ state: 'visible', timeout: 15000 });
    await releasesLink.hover().catch(() => undefined);
    await page.waitForTimeout(250);

    await Promise.all([
      page.waitForURL(url => matchesDashboardReleasesPath(url.pathname), {
        timeout: 15000,
      }),
      releasesLink.click(),
    ]);
    await page.waitForSelector(DASHBOARD_RELEASES_READY_SELECTOR, {
      state: 'visible',
      timeout: 15000,
    });

    return Date.now() - start;
  } catch {
    logWarning(
      `  ⚠ Warm shell response measurement failed for ${appRootUrl}, continuing without it`
    );
    return 0;
  }
};

/**
 * Measure skeleton-to-content time.
 * Waits for [data-testid="releases-loading"] to disappear and real content to render.
 */
const measureSkeletonToContent = async (
  page: Awaited<
    ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>
  >
): Promise<number> => {
  const start = Date.now();

  try {
    await page.waitForSelector('[data-testid="releases-loading"]', {
      state: 'detached',
      timeout: 10000,
    });
    return Date.now() - start;
  } catch {
    try {
      await page.waitForSelector(
        'table tbody tr, [data-testid="releases-content"]',
        {
          state: 'visible',
          timeout: 5000,
        }
      );
      return Date.now() - start;
    } catch {
      return Date.now() - start;
    }
  }
};

const collectMetrics = async (
  url: string,
  needsAuth: boolean
): Promise<PageMetrics> => {
  const browser = await chromium.launch();
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let page: Awaited<ReturnType<typeof browser.newPage>> | null = null;

  try {
    const cookies = needsAuth ? loadAuthCookies(BASE_URL) : [];

    context = await browser.newContext();

    if (needsAuth) {
      if (cookies.length === 0) {
        throw new Error(
          `No auth cookies found for authenticated route. Set CLERK_SESSION_COOKIE or provide ${CLI_OPTIONS.authPath || process.env.PERF_BUDGET_AUTH_PATH || AUTH_STORAGE_PATH}.`
        );
      }
      await context.addCookies(cookies);
      logInfo(`  🔐 Injected ${cookies.length} auth cookies`);
    }

    let warmShellResponse = 0;
    if (shouldMeasureWarmShellResponse(url, needsAuth)) {
      const warmContext = await browser.newContext();
      let warmPage: Awaited<ReturnType<typeof browser.newPage>> | null = null;
      try {
        if (cookies.length > 0) {
          await warmContext.addCookies(cookies);
        }
        warmPage = await warmContext.newPage();
        warmShellResponse = await measureWarmShellResponse(warmPage, BASE_URL);
      } finally {
        await warmPage?.close().catch(() => undefined);
        await warmContext.close().catch(() => undefined);
      }
    }

    page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.addInitScript(() => {
      type LayoutShiftEntry = PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      };

      type FirstInputEntry = PerformanceEntry & {
        processingStart?: number;
        startTime: number;
      };

      const metrics = {
        lcp: 0,
        cls: 0,
        fid: 0,
      };

      new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last && last.startTime) {
          metrics.lcp = last.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) {
            metrics.cls += entry.value ?? 0;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });

      new PerformanceObserver(list => {
        const entry =
          (list.getEntries()[0] as FirstInputEntry | undefined) ?? null;
        if (entry) {
          metrics.fid = (entry.processingStart ?? 0) - entry.startTime;
        }
      }).observe({ type: 'first-input', buffered: true });

      (
        window as Window & { __perfBudgetMetrics?: typeof metrics }
      ).__perfBudgetMetrics = metrics;
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const skeletonToContentPromise = measureSkeletonToContent(page);

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      logWarning(
        `  ⚠ networkidle timeout for ${url}, continuing with load state`
      );
    });

    try {
      await page.mouse.click(8, 8);
    } catch {
      // Ignore input errors; FID will remain 0.
    }

    const skeletonToContent = await skeletonToContentPromise;

    await page.waitForTimeout(2000);

    const metrics = await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(
        entry => entry.name === 'first-contentful-paint'
      );
      const navEntry = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;
      const ttfb = navEntry ? navEntry.responseStart : 0;

      const resourceEntries = performance.getEntriesByType(
        'resource'
      ) as PerformanceResourceTiming[];

      const resourceTotals = {
        script: 0,
        image: 0,
        font: 0,
        stylesheet: 0,
        total: 0,
      };

      const fontExtensions = ['.woff2', '.woff', '.ttf', '.otf'];

      for (const entry of resourceEntries) {
        const size = entry.transferSize || entry.encodedBodySize || 0;
        const lowerName = entry.name.toLowerCase();
        const isFont =
          entry.initiatorType === 'font' ||
          fontExtensions.some(ext => lowerName.includes(ext));
        const isStylesheet =
          entry.initiatorType === 'css' ||
          (entry.initiatorType === 'link' && lowerName.includes('.css'));

        if (entry.initiatorType === 'script') {
          resourceTotals.script += size;
        }
        if (entry.initiatorType === 'img') {
          resourceTotals.image += size;
        }
        if (isFont) {
          resourceTotals.font += size;
        }
        if (isStylesheet) {
          resourceTotals.stylesheet += size;
        }

        resourceTotals.total += size;
      }

      const metrics = (
        window as Window & {
          __perfBudgetMetrics?: { lcp: number; cls: number; fid: number };
        }
      ).__perfBudgetMetrics;

      return {
        timings: {
          'first-contentful-paint': fcp?.startTime || 0,
          'largest-contentful-paint': metrics?.lcp || 0,
          'cumulative-layout-shift': metrics?.cls || 0,
          'first-input-delay': metrics?.fid || 0,
          'time-to-first-byte': ttfb,
        },
        resourceSizes: resourceTotals,
      };
    });

    return {
      timings: {
        'first-contentful-paint': metrics.timings['first-contentful-paint'],
        'largest-contentful-paint': metrics.timings['largest-contentful-paint'],
        'cumulative-layout-shift': metrics.timings['cumulative-layout-shift'],
        'first-input-delay': metrics.timings['first-input-delay'],
        'time-to-first-byte': metrics.timings['time-to-first-byte'],
        'skeleton-to-content': skeletonToContent,
        'warm-shell-response': warmShellResponse,
      },
      resourceSizes: {
        script: toKilobytes(metrics.resourceSizes.script),
        image: toKilobytes(metrics.resourceSizes.image),
        font: toKilobytes(metrics.resourceSizes.font),
        stylesheet: toKilobytes(metrics.resourceSizes.stylesheet),
        total: toKilobytes(metrics.resourceSizes.total),
      },
    };
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};

const buildPageResult = (
  budgetEntry: BudgetEntry,
  resolvedPath: string,
  url: string,
  metrics: PageMetrics
): PageResult => {
  const timingResults = budgetEntry.timings.map(timing =>
    formatMetricResult(
      timing.metric,
      metrics.timings[timing.metric],
      timing.budget,
      timing.metric === 'cumulative-layout-shift' ? '' : 'ms'
    )
  );

  const resourceResults = budgetEntry.resourceSizes.map(resource =>
    formatMetricResult(
      resource.resourceType,
      metrics.resourceSizes[resource.resourceType],
      resource.budget,
      'KB'
    )
  );

  return {
    configuredPath: budgetEntry.path,
    resolvedPath,
    url,
    auth: budgetEntry.auth === true,
    timings: timingResults,
    resourceSizes: resourceResults,
    rawTimings: metrics.timings,
    rawResourceSizes: metrics.resourceSizes,
    violations: [
      ...timingResults
        .filter(result => !result.passed)
        .map(result => ({ ...result, kind: 'timing' as const })),
      ...resourceResults
        .filter(result => !result.passed)
        .map(result => ({ ...result, kind: 'resource' as const })),
    ],
  };
};

const renderHumanReadablePage = (page: PageResult) => {
  logInfo(
    `\n🔎 Checking ${page.configuredPath} (${page.url})${page.auth ? ' [auth]' : ''}`
  );

  for (const result of page.timings) {
    const status = result.passed ? '✅' : '❌';
    logInfo(
      ` ${status} ${result.name}: ${formatMetric(result.measured, result.unit)} (budget ${formatMetric(result.budget, result.unit)})`
    );
  }

  for (const result of page.resourceSizes) {
    const status = result.passed ? '✅' : '❌';
    logInfo(
      ` ${status} ${result.name}: ${formatMetric(result.measured, result.unit)} (budget ${formatMetric(result.budget, result.unit)})`
    );
  }
};

const emitJson = (summary: GuardSummary) => {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

const runBudgetGuard = async (): Promise<GuardSummary> => {
  const pages: PageResult[] = [];
  const budgetEntries = selectBudgetEntries(config.budgets, CLI_OPTIONS.paths);

  logInfo('📊 Running performance budget guard...');
  logInfo(`Base URL: ${BASE_URL}`);

  for (const budgetEntry of budgetEntries) {
    const resolvedPath = resolvePath(budgetEntry.path);
    const url = `${BASE_URL.replace(/\/$/, '')}${resolvedPath}`;

    let metrics!: PageMetrics;
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        metrics = await collectMetrics(url, budgetEntry.auth === true);
        break;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        logWarning(`  ⚠ Attempt ${attempt} failed for ${url}, retrying...`);
        await new Promise(resolvePromise => setTimeout(resolvePromise, 2000));
      }
    }

    const pageResult = buildPageResult(budgetEntry, resolvedPath, url, metrics);
    pages.push(pageResult);
    renderHumanReadablePage(pageResult);
  }

  const violationCount = pages.reduce(
    (total, page) => total + page.violations.length,
    0
  );

  return {
    baseUrl: BASE_URL,
    status: violationCount > 0 ? 'fail' : 'pass',
    checkedAt: new Date().toISOString(),
    violationCount,
    pages,
  };
};

runBudgetGuard()
  .then(summary => {
    if (CLI_OPTIONS.json) {
      emitJson(summary);
    } else if (summary.violationCount > 0) {
      console.error('\n🚨 Performance budget violations detected:');
      for (const page of summary.pages) {
        for (const violation of page.violations) {
          console.error(
            ` - ${page.configuredPath} ${violation.name} ${violation.measured.toFixed(1)}${violation.unit} exceeds ${violation.budget}${violation.unit}`
          );
        }
      }
    } else {
      console.log('\n✅ All performance budgets are within limits.');
    }

    process.exit(summary.violationCount > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('❌ Performance budget guard failed:', error);
    process.exit(1);
  });
