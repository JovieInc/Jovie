// Browser capture for the funnel conversion judge (JOV-7753): screenshots at
// desktop 1440 and mobile 390, plus LCP, CLS, interactivity, time-to-value,
// visible fields and axe accessibility blockers per step.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { MOBILE_THROTTLE, VIEWPORTS } from './steps.mjs';

const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);

function loadAxeSource() {
  return readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
}

// Runs in the page before any app script: buffers LCP and layout shifts.
const PERF_OBSERVER_SCRIPT = `
  window.__funnelPerf = { lcp: null, cls: 0, shifts: [] };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__funnelPerf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__funnelPerf.cls += entry.value;
        window.__funnelPerf.shifts.push(Math.round(entry.startTime));
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
`;

// Reads the buffered metrics plus navigation timing and visible field count.
const READ_PERF_SCRIPT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const buffered = window.__funnelPerf ?? { lcp: null, cls: 0, shifts: [] };
  const fields = [...document.querySelectorAll('input, textarea, select')].filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && element.getAttribute('type') !== 'hidden';
  }).length;
  return {
    lcpMs: buffered.lcp == null ? null : Math.round(buffered.lcp),
    cls: Math.round(buffered.cls * 1000) / 1000,
    shiftsAtMs: buffered.shifts,
    interactiveMs: nav ? Math.round(nav.domInteractive) : null,
    fields,
    finalPath: location.pathname + location.search,
  };
})()`;

async function applyMobileThrottle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: MOBILE_THROTTLE.cpuRate,
  });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: MOBILE_THROTTLE.latencyMs,
    downloadThroughput: MOBILE_THROTTLE.downloadBps,
    uploadThroughput: MOBILE_THROTTLE.uploadBps,
  });
}

async function measureTimeToValue(page, selector, timeoutMs) {
  if (!selector) return null;
  try {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs });
    return Math.round(await page.evaluate(() => performance.now()));
  } catch {
    return null;
  }
}

async function runAxe(page, axeSource) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-ignore axe is injected above
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    const pick = impact =>
      result.violations
        .filter(violation => violation.impact === impact)
        .map(violation => `${violation.id} (${violation.nodes.length})`);
    return { critical: pick('critical'), serious: pick('serious') };
  });
}

/**
 * @param {import('playwright').Page} page
 * @param {{ step: import('./steps.mjs').FunnelStep, url: string, outFile: string, settleMs: number, axeSource: string }} args
 */
async function capturePage(page, { step, url, outFile, settleMs, axeSource }) {
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message.split('\n')[0]));
  page.on('console', message => {
    if (message.type() === 'error')
      pageErrors.push(message.text().slice(0, 240));
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  const timeToValueMs = await measureTimeToValue(
    page,
    step.valueSelector,
    settleMs + 8_000
  );
  await page.waitForTimeout(settleMs);
  /** @type {Record<string, any>} */
  const perf = await page.evaluate(READ_PERF_SCRIPT);
  await page.screenshot({ path: outFile });
  const axe = await runAxe(page, axeSource);
  return {
    ...perf,
    pageErrors,
    timeToValueMs,
    taps: step.taps ?? null,
    a11yBlockers: axe.critical.length,
    a11yCritical: axe.critical,
    a11ySerious: axe.serious,
  };
}

async function captureOgCard(page, { url, outFile }) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .first()
    .getAttribute('content')
    .catch(() => null);
  const ogTitle = await page
    .locator('meta[property="og:title"]')
    .first()
    .getAttribute('content')
    .catch(() => null);
  if (!ogImage) return { uncaptured: 'page has no og:image', ogTitle };
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(ogImage, { waitUntil: 'load', timeout: 60_000 });
  await page.screenshot({ path: outFile });
  return {
    ogImage,
    ogTitle,
    lcpMs: null,
    cls: 0,
    a11yBlockers: 0,
    taps: 1,
    fields: 0,
  };
}

/**
 * Capture every capturable step at both viewports.
 *
 * @param {{ baseUrl: string, handle: string, steps: import('./steps.mjs').FunnelStep[], outDir: string, settleMs?: number, throttleMobile?: boolean }} options
 */
export async function captureFunnel({
  baseUrl,
  handle,
  steps,
  outDir,
  settleMs = 2500,
  throttleMobile = true,
}) {
  const axeSource = loadAxeSource();
  const browser = await chromium.launch();
  /** @type {Array<Record<string, any>>} */
  const captures = [];
  try {
    for (const step of steps) {
      if (step.kind === 'interactive') {
        for (const viewport of Object.keys(VIEWPORTS)) {
          captures.push({
            stepId: step.id,
            viewport,
            uncaptured: step.requires,
          });
        }
        continue;
      }
      const url = new URL(step.path(handle), baseUrl).toString();
      const viewports =
        step.kind === 'og-card' ? ['desktop'] : Object.keys(VIEWPORTS);
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: {
            width: VIEWPORTS[viewport].width,
            height: VIEWPORTS[viewport].height,
          },
          deviceScaleFactor: VIEWPORTS[viewport].deviceScaleFactor,
          isMobile: VIEWPORTS[viewport].isMobile,
          hasTouch: VIEWPORTS[viewport].hasTouch,
          colorScheme: 'dark',
          // axe is injected as an inline script; CSP nonces would block it.
          bypassCSP: true,
        });
        await context.addInitScript(PERF_OBSERVER_SCRIPT);
        const page = await context.newPage();
        if (viewport === 'mobile' && throttleMobile)
          await applyMobileThrottle(page);
        const outFile = join(outDir, `${step.id}-${viewport}.png`);
        try {
          /** @type {Record<string, any>} */
          const metrics =
            step.kind === 'og-card'
              ? await captureOgCard(page, { url, outFile })
              : await capturePage(page, {
                  step,
                  url,
                  outFile,
                  settleMs,
                  axeSource,
                });
          captures.push({
            stepId: step.id,
            viewport,
            url,
            image: metrics.uncaptured ? null : outFile,
            ...metrics,
          });
        } catch (error) {
          captures.push({
            stepId: step.id,
            viewport,
            url,
            uncaptured: `capture error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return captures;
}
