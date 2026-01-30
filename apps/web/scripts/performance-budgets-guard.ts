#!/usr/bin/env tsx
/**
 * Performance Budgets Guard
 *
 * Validates page performance against budgets defined in performance-budgets.config.js.
 * Runs against BASE_URL (defaults to http://localhost:3000).
 */

import { chromium } from '@playwright/test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

type TimingBudget = {
  metric:
    | 'first-contentful-paint'
    | 'largest-contentful-paint'
    | 'cumulative-layout-shift'
    | 'first-input-delay'
    | 'time-to-first-byte';
  budget: number;
};

type ResourceBudget = {
  resourceType: 'script' | 'image' | 'font' | 'stylesheet' | 'total';
  budget: number;
};

type BudgetEntry = {
  path: string;
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

const collectMetrics = async (url: string): Promise<PageMetrics> => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

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

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle');

  try {
    await page.mouse.click(8, 8);
  } catch {
    // Ignore input errors; FID will remain 0.
  }

  await page.waitForTimeout(1000);

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

  await page.close();
  await browser.close();

  return {
    timings: {
      'first-contentful-paint': metrics.timings['first-contentful-paint'],
      'largest-contentful-paint': metrics.timings['largest-contentful-paint'],
      'cumulative-layout-shift': metrics.timings['cumulative-layout-shift'],
      'first-input-delay': metrics.timings['first-input-delay'],
      'time-to-first-byte': metrics.timings['time-to-first-byte'],
    },
    resourceSizes: {
      script: toKilobytes(metrics.resourceSizes.script),
      image: toKilobytes(metrics.resourceSizes.image),
      font: toKilobytes(metrics.resourceSizes.font),
      stylesheet: toKilobytes(metrics.resourceSizes.stylesheet),
      total: toKilobytes(metrics.resourceSizes.total),
    },
  };
};

const runBudgetGuard = async () => {
  const violations: string[] = [];
  console.log('📊 Running performance budget guard...');
  console.log(`Base URL: ${BASE_URL}`);

  for (const budgetEntry of config.budgets) {
    const resolvedPath = resolvePath(budgetEntry.path);
    const url = `${BASE_URL.replace(/\/$/, '')}${resolvedPath}`;

    console.log(`\n🔎 Checking ${budgetEntry.path} (${url})`);

    const metrics = await collectMetrics(url);

    for (const timing of budgetEntry.timings) {
      const measured = metrics.timings[timing.metric];
      const maxAllowed = timing.budget;
      const status = measured <= maxAllowed ? '✅' : '❌';
      console.log(
        ` ${status} ${timing.metric}: ${formatMetric(measured, 'ms')} (budget ${formatMetric(maxAllowed, 'ms')})`
      );
      if (measured > maxAllowed) {
        violations.push(
          `${budgetEntry.path} ${timing.metric} ${measured.toFixed(1)}ms exceeds ${maxAllowed}ms`
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
