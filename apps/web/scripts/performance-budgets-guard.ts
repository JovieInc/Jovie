#!/usr/bin/env tsx
/**
 * Performance Budgets Guard
 *
 * Validates page performance against budgets defined in performance-budgets.config.js.
 * Runs against BASE_URL (defaults to http://localhost:3000).
 *
 * For authenticated routes (auth: true in config), reads Clerk session cookies
 * from CLERK_SESSION_COOKIE env var or falls back to browser context stored at
 * apps/web/.auth/session.json (created by `doppler run -- pnpm perf:auth`).
 */

import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

type TimingBudget = {
  metric:
    | 'first-contentful-paint'
    | 'largest-contentful-paint'
    | 'cumulative-layout-shift'
    | 'first-input-delay'
    | 'time-to-first-byte'
    | 'skeleton-to-content';
  budget: number;
};

type ResourceBudget = {
  resourceType: 'script' | 'image' | 'font' | 'stylesheet' | 'total';
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
  timings: {
    'first-contentful-paint': number;
    'largest-contentful-paint': number;
    'cumulative-layout-shift': number;
    'first-input-delay': number;
    'time-to-first-byte': number;
    'skeleton-to-content': number;
  };
  resourceSizes: {
    script: number;
    image: number;
    font: number;
    stylesheet: number;
    total: number;
  };
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_PARAMS: Record<string, string> = {
  username: process.env.PERF_BUDGET_USERNAME || 'tim',
};

const AUTH_STORAGE_PATH = resolve(
  import.meta.dirname ?? __dirname,
  '../.auth/session.json'
);

const config = require('../performance-budgets.config.js') as BudgetConfig;

const toKilobytes = (bytes: number) => bytes / 1024;

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

/**
 * Load Clerk session cookies for authenticated routes.
 * Priority: CLERK_SESSION_COOKIE env → .auth/session.json file.
 */
const loadAuthCookies = (
  baseUrl: string
): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
}> => {
  const cookieValue = process.env.CLERK_SESSION_COOKIE;
  if (cookieValue) {
    const domain = new URL(baseUrl).hostname;
    return [
      { name: '__session', value: cookieValue, domain, path: '/' },
      { name: '__clerk_db_jwt', value: cookieValue, domain, path: '/' },
    ];
  }

  if (existsSync(AUTH_STORAGE_PATH)) {
    try {
      const raw = readFileSync(AUTH_STORAGE_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.cookies)) {
        return data.cookies;
      }
    } catch {
      console.warn('  ⚠ Could not parse auth session file, skipping auth');
    }
  }

  return [];
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
    // Wait for skeleton to disappear (it has data-testid="releases-loading")
    await page.waitForSelector('[data-testid="releases-loading"]', {
      state: 'detached',
      timeout: 10000,
    });
    return Date.now() - start;
  } catch {
    // If skeleton was never present or didn't disappear, check if content loaded directly
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
  let page: Awaited<ReturnType<typeof browser.newPage>> | null = null;

  try {
    const context = await browser.newContext();

    // Inject auth cookies for authenticated routes
    if (needsAuth) {
      const cookies = loadAuthCookies(BASE_URL);
      if (cookies.length === 0) {
        console.warn(
          '  ⚠ No auth cookies found. Set CLERK_SESSION_COOKIE or run: doppler run -- pnpm perf:auth'
        );
      } else {
        await context.addCookies(cookies);
        console.log(`  🔐 Injected ${cookies.length} auth cookies`);
      }
    }

    page = await context.newPage();

    // Warm up the browser + server connection — first navigation includes
    // browser launch overhead + TCP/TLS setup which inflates TTFB/FCP by ~5-8s.
    // Hit the actual server first so the real measurement reflects app performance.
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
          // Only count layout shifts without recent input.
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

    // Start skeleton-to-content measurement from navigation
    const skeletonToContentPromise = measureSkeletonToContent(page);

    // Best-effort networkidle wait; fall back gracefully for dynamic pages
    // where third-party scripts or long-polling prevent idle state.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.warn(
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
    await browser.close().catch(() => undefined);
  }
};

const runBudgetGuard = async () => {
  const violations: string[] = [];
  console.log('📊 Running performance budget guard...');
  console.log(`Base URL: ${BASE_URL}`);

  for (const budgetEntry of config.budgets) {
    const resolvedPath = resolvePath(budgetEntry.path);
    const url = `${BASE_URL.replace(/\/$/, '')}${resolvedPath}`;
    const needsAuth = budgetEntry.auth === true;

    console.log(
      `\n🔎 Checking ${budgetEntry.path} (${url})${needsAuth ? ' [auth]' : ''}`
    );

    let metrics!: PageMetrics;
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        metrics = await collectMetrics(url, needsAuth);
        break;
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        console.warn(`  ⚠ Attempt ${attempt} failed for ${url}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    for (const timing of budgetEntry.timings) {
      const measured = metrics.timings[timing.metric];
      const maxAllowed = timing.budget;
      const unit = timing.metric === 'cumulative-layout-shift' ? '' : 'ms';
      const status = measured <= maxAllowed ? '✅' : '❌';
      console.log(
        ` ${status} ${timing.metric}: ${formatMetric(measured, unit)} (budget ${formatMetric(maxAllowed, unit)})`
      );
      if (measured > maxAllowed) {
        violations.push(
          `${budgetEntry.path} ${timing.metric} ${measured.toFixed(1)}${unit} exceeds ${maxAllowed}${unit}`
        );
      }
    }

    for (const resource of budgetEntry.resourceSizes) {
      const measured = metrics.resourceSizes[resource.resourceType];
      const maxAllowed = resource.budget;
      const status = measured <= maxAllowed ? '✅' : '❌';
      console.log(
        ` ${status} ${resource.resourceType}: ${formatMetric(measured, 'KB')} (budget ${formatMetric(maxAllowed, 'KB')})`
      );
      if (measured > maxAllowed) {
        violations.push(
          `${budgetEntry.path} ${resource.resourceType} ${measured.toFixed(1)}KB exceeds ${maxAllowed}KB`
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n🚨 Performance budget violations detected:');
    for (const violation of violations) {
      console.error(` - ${violation}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All performance budgets are within limits.');
};

runBudgetGuard().catch(error => {
  console.error('❌ Performance budget guard failed:', error);
  process.exit(1);
});
