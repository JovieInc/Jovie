/** Blocking anonymous render gate required before marketing migration/import. */

import type { Page } from '@playwright/test';
import {
  MARKETING_ROUTE_HEALTH_TARGETS,
  type MarketingRouteHealthTarget,
} from '@/data/marketing';
import { expect, test } from './setup';
import { installPublicRouteMocks } from './utils/public-surface-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

const NAVIGATION_TIMEOUT = 300_000;
const BOUNDARY_SELECTORS = [
  '[data-testid="not-found"]',
  '[data-testid="error-boundary"]',
  '[data-testid="error-page"]',
  'next-error-h1',
].join(', ');
const ERROR_TEXT = [
  /application error/i,
  /internal server error/i,
  /unhandled runtime error/i,
  /something went wrong/i,
  /a server-side exception has occurred/i,
  /this page could not be found/i,
  /page not found/i,
];
const AUTH_PATH = /\/(?:auth|login|signin|sign-in|signup|sign-up)(?:\/|$)/i;
const AUTH_SELECTORS =
  '[data-auth-shell], [data-clerk-component], [data-testid="auth-clerk-unavailable"]';

const pathname = (value: string) => new URL(value, 'http://localhost').pathname;

async function assertNoDevChrome(page: Page) {
  await expect(page.locator('html')).toHaveAttribute(
    'data-dev-chrome-disabled',
    '1'
  );
  for (const selector of [
    '[data-testid="dev-toolbar"]',
    '[data-testid="dev-toolbar-flag-drawer"]',
    '[data-vercel-toolbar]',
    '[data-nextjs-dev-tools-button]',
  ]) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
}

async function assertPageHealth(
  page: Page,
  target: MarketingRouteHealthTarget,
  consoleErrors: readonly string[],
  pageErrors: readonly string[],
  failedResponses: readonly string[],
  failedRequests: readonly string[]
) {
  const finalPath = pathname(page.url());
  expect(
    target.expected === 'page'
      ? finalPath
      : target.allowedFinalPaths.map(pathname),
    `${target.glob} did not settle on the declared path`
  ).toEqual(
    target.expected === 'page'
      ? pathname(target.path)
      : expect.arrayContaining([finalPath])
  );
  expect(failedResponses, `${target.glob} has same-origin 4xx/5xx`).toEqual([]);
  expect(failedRequests, `${target.glob} has failed requests`).toEqual([]);
  expect(consoleErrors, `${target.glob} emitted console errors`).toEqual([]);
  expect(pageErrors, `${target.glob} threw runtime exceptions`).toEqual([]);
  if (target.expected === 'redirect') return;

  await assertNoDevChrome(page);
  await expect(page.locator('main').first()).toBeVisible();
  const body = (await page.locator('body').innerText())
    .replace(/\s+/g, ' ')
    .trim();
  expect(
    body.length,
    `${target.glob} rendered no meaningful body`
  ).toBeGreaterThan(20);
  for (const pattern of ERROR_TEXT) {
    expect(body, `${target.glob} rendered an error signal`).not.toMatch(
      pattern
    );
  }
  await expect(page.locator(BOUNDARY_SELECTORS)).toHaveCount(0);
  await expect(page.locator(AUTH_SELECTORS)).toHaveCount(0);
  expect(AUTH_PATH.test(finalPath), `${target.glob} ended on auth path`).toBe(
    false
  );
  if (target.requiresSharedChrome) {
    await expect(page.locator('[data-testid="header-nav"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="marketing-footer"]')).toHaveCount(
      1
    );
  }
}

async function checkTarget(page: Page, target: MarketingRouteHealthTarget) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  const failedRequests: string[] = [];
  const origin = new URL(
    process.env.BASE_URL?.trim() || 'http://localhost:3100'
  ).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) {
      failedRequests.push(
        `${request.url()} ${request.failure()?.errorText ?? 'unknown failure'}`
      );
    }
  });

  await installPublicRouteMocks(page);
  const response = await page.goto(target.path, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT,
  });
  expect(
    response?.status() ?? 0,
    `${target.glob} has no document response`
  ).toBeLessThan(400);
  await page.waitForTimeout(750);
  await assertPageHealth(
    page,
    target,
    consoleErrors,
    pageErrors,
    failedResponses,
    failedRequests
  );
}

test.describe('canonical marketing route health gate', () => {
  test.setTimeout(NAVIGATION_TIMEOUT + 60_000);
  for (const target of MARKETING_ROUTE_HEALTH_TARGETS) {
    test(`${target.glob} → ${target.path}`, async ({ page }) => {
      await checkTarget(page, target);
    });
  }
});
