/**
 * Synthetic lane for time to fully loaded first dashboard
 * (first-dashboard-ready/v1).
 *
 * Hard-loads the signed-in Home dashboard (`/app`) on a seeded test account
 * and reads the same sample real users report, from the probe the shell
 * mounts (`window.__jovieFirstDashboardReady`). The first load runs on an
 * empty browser cache, the rest on a warm one, which is what a returning
 * user sees.
 *
 * Warn-only for now (2026-10-21 rule: new perf budgets ship warn-only first).
 * It writes a receipt to test-results/first-dashboard-ready/receipt.json and
 * prints one FIRST_DASHBOARD_READY_RECEIPT line so the baseline can be read
 * from the job log. It fails only when the instrumentation itself is broken:
 * no sample, or a sample that claims "settled" while a loading region is
 * still visible.
 *
 * @smoke
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  FIRST_DASHBOARD_LOADING_SELECTOR,
  FIRST_DASHBOARD_READY_BUDGET_MS,
  FIRST_DASHBOARD_READY_CONTRACT,
  FIRST_DASHBOARD_READY_MEASURE,
  type FirstDashboardReadySample,
} from '@/lib/monitoring/first-dashboard-ready';
import { setTestAuthBypassSession } from '../helpers/auth';

const LOADS = 5;
const SAMPLE_TIMEOUT_MS = 45_000;

test.use({ storageState: { cookies: [], origins: [] } });

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}

async function hardLoad(page: Page) {
  await page.goto('/app', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => globalThis.__jovieFirstDashboardReady !== undefined,
    undefined,
    { timeout: SAMPLE_TIMEOUT_MS, polling: 100 }
  );
  return page.evaluate(
    ({ measure, selector }) => {
      const sample = globalThis.__jovieFirstDashboardReady;
      const measured = performance
        .getEntriesByName(measure, 'measure')
        .at(-1)?.duration;
      const stillLoading = [...document.querySelectorAll(selector)].filter(
        element => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          );
        }
      ).length;
      return {
        sample,
        measured: measured ?? null,
        // Visible loading regions at the moment the probe fired would mean a
        // false "settled"; regions that appear later are not this metric.
        stillLoading,
        path: location.pathname,
      };
    },
    {
      measure: FIRST_DASHBOARD_READY_MEASURE,
      selector: FIRST_DASHBOARD_LOADING_SELECTOR,
    }
  );
}

test('first dashboard reaches its fully loaded state', async ({
  page,
}, testInfo) => {
  test.setTimeout(LOADS * SAMPLE_TIMEOUT_MS + 60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-first-dashboard');

  const samples: FirstDashboardReadySample[] = [];
  const paths: string[] = [];
  for (let load = 0; load < LOADS; load += 1) {
    const result = await hardLoad(page);
    const sample = result.sample as FirstDashboardReadySample;
    expect(sample.contract).toBe(FIRST_DASHBOARD_READY_CONTRACT);
    if (sample.outcome === 'reached') {
      expect(
        result.stillLoading,
        'probe reported settled with a loading region on screen'
      ).toBe(0);
      expect(result.measured).not.toBeNull();
    }
    samples.push(sample);
    paths.push(result.path);
  }

  const reached = samples.filter(sample => sample.outcome === 'reached');
  const durations = reached.map(sample => sample.durationMs);
  const phaseP50 = (key: keyof FirstDashboardReadySample) =>
    percentile(
      reached.map(sample => Number(sample[key])),
      0.5
    );
  const receipt = {
    contract: FIRST_DASHBOARD_READY_CONTRACT,
    mode: 'warn-only',
    route: '/app',
    landedOn: [...new Set(paths)],
    loads: samples.length,
    reached: reached.length,
    budgetMs: FIRST_DASHBOARD_READY_BUDGET_MS,
    coldMs: samples[0]?.outcome === 'reached' ? samples[0].durationMs : null,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    phasesP50Ms: {
      server: phaseP50('serverMs'),
      document: phaseP50('documentMs'),
      boot: phaseP50('bootMs'),
      settle: phaseP50('settleMs'),
    },
    samples: samples.map(sample => ({
      durationMs: sample.durationMs,
      outcome: sample.outcome,
      serverMs: sample.serverMs,
      documentMs: sample.documentMs,
      bootMs: sample.bootMs,
      settleMs: sample.settleMs,
    })),
    commit: process.env.GITHUB_SHA ?? null,
    recordedAt: new Date().toISOString(),
  };

  const directory = resolve(
    process.cwd(),
    'test-results/first-dashboard-ready'
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  await testInfo.attach('first-dashboard-ready-receipt', {
    body: JSON.stringify(receipt, null, 2),
    contentType: 'application/json',
  });
  console.log(`FIRST_DASHBOARD_READY_RECEIPT ${JSON.stringify(receipt)}`);

  if (receipt.p50Ms > FIRST_DASHBOARD_READY_BUDGET_MS) {
    testInfo.annotations.push({
      type: 'warning',
      description: `first dashboard p50 ${receipt.p50Ms}ms is over the ${FIRST_DASHBOARD_READY_BUDGET_MS}ms budget (warn-only)`,
    });
  }
});
