import { Page, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  SmokeTestContext,
  setupPageMonitoring,
  smokeNavigate,
  waitForHydration,
} from '../utils/smoke-test-utils';

/**
 * Chaos Click Testing - Nightly
 *
 * This test suite automatically discovers and clicks all interactive elements
 * to find hidden React errors (hooks violations, rendering issues, state bugs).
 *
 * It's designed to run as a non-blocking weekly/nightly job that surfaces
 * issues without failing the build.
 *
 * @nightly
 */

// React-specific error patterns we want to catch
const REACT_ERROR_PATTERNS = [
  // Hook violations
  'rendered more hooks than during the previous render',
  'rendered fewer hooks than expected',
  'hooks can only be called inside',
  'invalid hook call',
  'rules of hooks',
  // State/render errors
  "can't perform a react state update on an unmounted component",
  'cannot update a component while rendering',
  'maximum update depth exceeded',
  'too many re-renders',
  // Context errors
  'cannot read properties of null',
  'cannot read properties of undefined',
  "cannot read property 'provider'",
  // Suspense/concurrent mode
  'suspense boundary',
  'hydration failed',
  'text content does not match',
  // General React errors
  'unhandled runtime error',
  'error boundary',
  'minified react error',
  'invariant violation',
  // Component errors
  'is not a function',
  'is not defined',
  'cannot destructure property',
];

interface ClickableElement {
  selector: string;
  tagName: string;
  text: string;
  testId?: string;
  ariaLabel?: string;
}

interface ChaosError {
  page: string;
  element: ClickableElement;
  error: string;
  timestamp: string;
}

interface ChaosReport {
  totalPagesVisited: number;
  totalElementsClicked: number;
  totalErrorsFound: number;
  errors: ChaosError[];
  duration: number;
}

/**
 * Check if an error message matches React-specific patterns
 */
function isReactError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return REACT_ERROR_PATTERNS.some(pattern =>
    lower.includes(pattern.toLowerCase())
  );
}

/**
 * Find all clickable elements on the page
 */
async function findClickableElements(page: Page): Promise<ClickableElement[]> {
  return page.evaluate(() => {
    const elements: ClickableElement[] = [];
    const seen = new Set<Element>();

    // Selectors for interactive elements
    const selectors = [
      'button:not([disabled])',
      'a[href]:not([href^="mailto:"]):not([href^="tel:"])',
      '[role="button"]:not([disabled])',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'select',
      '[onclick]',
      '[data-clickable="true"]',
      // Common component patterns
      '[class*="clickable"]',
      '[class*="Clickable"]',
    ];

    for (const selector of selectors) {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        // Skip elements outside viewport
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const tagName = el.tagName.toLowerCase();
        const text = (el.textContent || '').trim().slice(0, 50);
        const testId = el.getAttribute('data-testid') || undefined;
        const ariaLabel = el.getAttribute('aria-label') || undefined;

        // Build a unique selector
        let uniqueSelector = '';
        if (testId) {
          uniqueSelector = `[data-testid="${testId}"]`;
        } else if (el.id) {
          uniqueSelector = `#${el.id}`;
        } else if (ariaLabel) {
          uniqueSelector = `[aria-label="${ariaLabel}"]`;
        } else {
          // Use nth-child as fallback
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              c => c.tagName === el.tagName
            );
            const index = siblings.indexOf(el as Element);
            uniqueSelector = `${tagName}:nth-of-type(${index + 1})`;
          } else {
            uniqueSelector = tagName;
          }
        }

        elements.push({
          selector: uniqueSelector,
          tagName,
          text,
          testId,
          ariaLabel,
        });
      }
    }

    return elements;
  });
}

/**
 * Safely click an element and capture any errors
 */
async function safeClick(
  page: Page,
  element: ClickableElement,
  context: SmokeTestContext
): Promise<string | null> {
  const errorsBefore = [...context.consoleErrors];

  try {
    // Try to find the element
    const locator = page.locator(element.selector).first();

    // Check if element is still visible
    const isVisible = await locator.isVisible().catch(() => false);
    if (!isVisible) return null;

    // Click with a timeout
    await locator.click({
      timeout: 3000,
      force: false, // Don't force - we want to catch real issues
    });

    // Wait for any React re-renders
    await page.waitForTimeout(500);

    // Check for new errors
    const newErrors = context.consoleErrors.filter(
      e => !errorsBefore.includes(e)
    );
    const reactErrors = newErrors.filter(isReactError);

    if (reactErrors.length > 0) {
      return reactErrors.join('\n');
    }

    return null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Ignore expected click failures
    if (
      errorMessage.includes('element is not visible') ||
      errorMessage.includes('element is detached') ||
      errorMessage.includes('element is outside of the viewport') ||
      errorMessage.includes('intercepts pointer events') ||
      errorMessage.includes('navigation')
    ) {
      return null;
    }

    // Check if this is a React error
    if (isReactError(errorMessage)) {
      return errorMessage;
    }

    return null;
  }
}

/**
 * Chaos test a single page
 */
async function chaosTestPage(
  page: Page,
  url: string,
  report: ChaosReport
): Promise<void> {
  const { getContext, cleanup } = setupPageMonitoring(page);

  try {
    await smokeNavigate(page, url, { timeout: SMOKE_TIMEOUTS.NAVIGATION });
    await waitForHydration(page);

    report.totalPagesVisited++;

    const elements = await findClickableElements(page);
    console.log(`  Found ${elements.length} clickable elements on ${url}`);

    for (const element of elements) {
      const context = getContext();
      const error = await safeClick(page, element, context);

      report.totalElementsClicked++;

      if (error) {
        report.totalErrorsFound++;
        report.errors.push({
          page: url,
          element,
          error,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `  ❌ Error on ${element.selector}: ${error.slice(0, 100)}`
        );
      }

      // Navigate back if we left the page
      const currentUrl = page.url();
      if (!currentUrl.includes(url) && !currentUrl.includes('localhost')) {
        await smokeNavigate(page, url);
        await waitForHydration(page);
      }
    }
  } finally {
    cleanup();
  }
}

/**
 * Generate a formatted report
 */
function formatReport(report: ChaosReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    CHAOS CLICK TEST REPORT                     ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Duration: ${(report.duration / 1000).toFixed(1)}s`,
    `Pages Visited: ${report.totalPagesVisited}`,
    `Elements Clicked: ${report.totalElementsClicked}`,
    `Errors Found: ${report.totalErrorsFound}`,
    '',
  ];

  if (report.errors.length > 0) {
    lines.push(
      '───────────────────────────────────────────────────────────────'
    );
    lines.push(
      '                         ERRORS                                '
    );
    lines.push(
      '───────────────────────────────────────────────────────────────'
    );

    for (const error of report.errors) {
      lines.push('');
      lines.push(`Page: ${error.page}`);
      lines.push(
        `Element: ${error.element.testId || error.element.ariaLabel || error.element.selector}`
      );
      lines.push(`Text: "${error.element.text}"`);
      lines.push(`Error: ${error.error}`);
      lines.push(`Time: ${error.timestamp}`);
    }
  } else {
    lines.push('✅ No React errors found during chaos testing!');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe('Chaos Click Testing @nightly @chaos', () => {
  test.setTimeout(300_000); // 5 minutes max

  test('public pages - click all interactive elements', async ({
    page,
  }, testInfo) => {
    const report: ChaosReport = {
      totalPagesVisited: 0,
      totalElementsClicked: 0,
      totalErrorsFound: 0,
      errors: [],
      duration: 0,
    };

    const startTime = Date.now();

    // Public pages to test
    const publicPages = [
      '/',
      '/pricing',
      '/signin',
      '/signup',
      '/legal/terms',
      '/legal/privacy',
    ];

    console.log('\n🔥 Starting Chaos Click Test - Public Pages\n');

    for (const pageUrl of publicPages) {
      console.log(`\nTesting: ${pageUrl}`);
      await chaosTestPage(page, pageUrl, report);
    }

    report.duration = Date.now() - startTime;

    // Generate and attach report
    const reportText = formatReport(report);
    console.log('\n' + reportText);

    await testInfo.attach('chaos-report', {
      body: reportText,
      contentType: 'text/plain',
    });

    await testInfo.attach('chaos-report-json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    // Don't fail the test - just report
    // Uncomment to make it fail on errors:
    // expect(report.totalErrorsFound, 'React errors found during chaos testing').toBe(0);
  });

  test('test profile pages - click all interactive elements', async ({
    page,
  }, testInfo) => {
    const report: ChaosReport = {
      totalPagesVisited: 0,
      totalElementsClicked: 0,
      totalErrorsFound: 0,
      errors: [],
      duration: 0,
    };

    const startTime = Date.now();

    // Test profile pages (seeded in global-setup)
    const profilePages = ['/dualipa', '/taylorswift'];

    console.log('\n🔥 Starting Chaos Click Test - Profile Pages\n');

    for (const pageUrl of profilePages) {
      console.log(`\nTesting: ${pageUrl}`);
      await chaosTestPage(page, pageUrl, report);
    }

    report.duration = Date.now() - startTime;

    const reportText = formatReport(report);
    console.log('\n' + reportText);

    await testInfo.attach('chaos-report', {
      body: reportText,
      contentType: 'text/plain',
    });

    await testInfo.attach('chaos-report-json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });
});

/**
 * Extended chaos test that can be run separately with more pages
 * Run with: pnpm exec playwright test chaos-click-testing.spec.ts -g "extended"
 */
test.describe('Extended Chaos Testing @chaos-extended', () => {
  test.skip(
    !process.env.CHAOS_EXTENDED,
    'Set CHAOS_EXTENDED=1 to run extended chaos tests'
  );
  test.setTimeout(600_000); // 10 minutes max

  test('full site crawl with click testing', async ({ page }, testInfo) => {
    const report: ChaosReport = {
      totalPagesVisited: 0,
      totalElementsClicked: 0,
      totalErrorsFound: 0,
      errors: [],
      duration: 0,
    };

    const startTime = Date.now();
    const visited = new Set<string>();
    const toVisit: string[] = ['/'];

    console.log('\n🔥 Starting Extended Chaos Crawl\n');

    while (toVisit.length > 0 && visited.size < 50) {
      const url = toVisit.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      console.log(`\nTesting: ${url} (${visited.size} pages visited)`);
      await chaosTestPage(page, url, report);

      // Find internal links to add to queue
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href'))
          .filter((href): href is string => {
            if (!href) return false;
            if (href.startsWith('mailto:') || href.startsWith('tel:'))
              return false;
            if (href.startsWith('http') && !href.includes('localhost'))
              return false;
            return true;
          })
          .map(href => {
            if (href.startsWith('/')) return href;
            return new URL(href, window.location.origin).pathname;
          });
      });

      for (const link of links) {
        if (!visited.has(link) && !toVisit.includes(link)) {
          toVisit.push(link);
        }
      }
    }

    report.duration = Date.now() - startTime;

    const reportText = formatReport(report);
    console.log('\n' + reportText);

    await testInfo.attach('chaos-report', {
      body: reportText,
      contentType: 'text/plain',
    });

    await testInfo.attach('chaos-report-json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });
});
