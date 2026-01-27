import { Page, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  waitForHydration,
} from '../utils/smoke-test-utils';

/**
 * Chaos Click Testing - Nightly
 *
 * Clicks all interactive elements to find hidden React errors.
 * Non-blocking weekly/nightly job that surfaces issues without failing the build.
 */

const REACT_ERROR_PATTERNS = [
  'rendered more hooks than',
  'rendered fewer hooks',
  'invalid hook call',
  'rules of hooks',
  "can't perform a react state update on an unmounted",
  'cannot update a component while rendering',
  'maximum update depth exceeded',
  'too many re-renders',
  'hydration failed',
  'text content does not match',
  'minified react error',
];

interface ChaosError {
  page: string;
  element: string;
  error: string;
}

function isReactError(text: string): boolean {
  const lower = text.toLowerCase();
  return REACT_ERROR_PATTERNS.some(p => lower.includes(p));
}

async function findClickableElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      'button:not([disabled])',
      'a[href]:not([href^="mailto:"]):not([href^="tel:"])',
      '[role="button"]:not([disabled])',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="switch"]',
      'input[type="checkbox"]',
      'select',
    ];

    const seen = new Set<Element>();
    const results: string[] = [];

    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const testId = el.getAttribute('data-testid');
        if (testId) {
          results.push(`[data-testid="${testId}"]`);
        } else if (el.id) {
          results.push(`#${el.id}`);
        } else {
          const label = el.getAttribute('aria-label');
          if (label) results.push(`[aria-label="${label}"]`);
        }
      }
    }
    return results;
  });
}

async function chaosTestPage(
  page: Page,
  url: string,
  errors: ChaosError[]
): Promise<number> {
  const { getContext, cleanup } = setupPageMonitoring(page);
  let clicked = 0;

  try {
    await smokeNavigate(page, url, { timeout: SMOKE_TIMEOUTS.NAVIGATION });
    await waitForHydration(page);

    const elements = await findClickableElements(page);
    console.log(`  Found ${elements.length} elements on ${url}`);

    for (const selector of elements) {
      const errorsBefore = [...getContext().consoleErrors];

      try {
        const locator = page.locator(selector).first();
        if (!(await locator.isVisible().catch(() => false))) continue;

        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(300);
        clicked++;

        const newErrors = getContext().consoleErrors.filter(
          e => !errorsBefore.includes(e) && isReactError(e)
        );

        if (newErrors.length > 0) {
          errors.push({ page: url, element: selector, error: newErrors[0] });
          console.log(`  ❌ ${selector}: ${newErrors[0].slice(0, 80)}`);
        }

        // Navigate back if we left the page
        if (!page.url().includes(url.split('/')[1] || '/')) {
          await smokeNavigate(page, url);
          await waitForHydration(page);
        }
      } catch {
        // Ignore click failures (navigation, detached elements, etc.)
      }
    }
  } finally {
    cleanup();
  }

  return clicked;
}

async function runChaosTest(
  page: Page,
  urls: string[],
  testInfo: { attach: (name: string, options: object) => Promise<void> }
) {
  const errors: ChaosError[] = [];
  const startTime = Date.now();
  let totalClicked = 0;

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    totalClicked += await chaosTestPage(page, url, errors);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const report = [
    `\n${'═'.repeat(60)}`,
    `CHAOS TEST: ${urls.length} pages, ${totalClicked} clicks, ${errors.length} errors, ${duration}s`,
    `${'═'.repeat(60)}`,
    ...errors.map(e => `\n${e.page}\n  ${e.element}\n  ${e.error}`),
    errors.length === 0 ? '\n✅ No React errors found!' : '',
  ].join('\n');

  console.log(report);
  await testInfo.attach('chaos-report', {
    body: report,
    contentType: 'text/plain',
  });
  await testInfo.attach('chaos-errors', {
    body: JSON.stringify(errors, null, 2),
    contentType: 'application/json',
  });
}

test.describe('Chaos Click Testing @nightly @chaos', () => {
  test.setTimeout(300_000);

  test('public pages', async ({ page }, testInfo) => {
    await runChaosTest(
      page,
      ['/', '/pricing', '/signin', '/signup', '/legal/terms', '/legal/privacy'],
      testInfo
    );
  });

  test('profile pages', async ({ page }, testInfo) => {
    await runChaosTest(page, ['/dualipa', '/taylorswift'], testInfo);
  });
});

test.describe('Extended Chaos Testing @chaos-extended', () => {
  test.skip(!process.env.CHAOS_EXTENDED, 'Set CHAOS_EXTENDED=1 to run');
  test.setTimeout(600_000);

  test('full site crawl', async ({ page }, testInfo) => {
    const errors: ChaosError[] = [];
    const startTime = Date.now();
    const visited = new Set<string>();
    const toVisit = ['/'];
    let totalClicked = 0;

    while (toVisit.length > 0 && visited.size < 50) {
      const url = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      console.log(`\nTesting: ${url} (${visited.size}/50)`);
      totalClicked += await chaosTestPage(page, url, errors);

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href'))
          .filter(
            (h): h is string =>
              !!h &&
              !h.startsWith('mailto:') &&
              !h.startsWith('tel:') &&
              (!h.startsWith('http') || h.includes('localhost'))
          )
          .map(h =>
            h.startsWith('/') ? h : new URL(h, location.origin).pathname
          )
      );

      for (const link of links) {
        if (!visited.has(link) && !toVisit.includes(link)) toVisit.push(link);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const report = [
      `\n${'═'.repeat(60)}`,
      `CRAWL: ${visited.size} pages, ${totalClicked} clicks, ${errors.length} errors, ${duration}s`,
      `${'═'.repeat(60)}`,
      ...errors.map(e => `\n${e.page}\n  ${e.element}\n  ${e.error}`),
      errors.length === 0 ? '\n✅ No React errors found!' : '',
    ].join('\n');

    console.log(report);
    await testInfo.attach('chaos-report', {
      body: report,
      contentType: 'text/plain',
    });
    await testInfo.attach('chaos-errors', {
      body: JSON.stringify(errors, null, 2),
      contentType: 'application/json',
    });
  });
});
