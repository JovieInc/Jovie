/**
 * Responsive acceptance proof for the founder-approved canonical customer IA.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/canonical-customer-shell-navigation.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Locator, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
  'Requires E2E_USE_TEST_AUTH_BYPASS=1'
);

const CANONICAL_LABELS = [
  'Inbox',
  'Chat',
  'Library',
  'Contacts',
  'Calendar',
  'Tasks',
] as const;

const CANONICAL_HREFS = [
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.CHAT,
  APP_ROUTES.LIBRARY,
  APP_ROUTES.CONTACTS,
  APP_ROUTES.CALENDAR,
  APP_ROUTES.TASKS,
] as const;

const FORBIDDEN_LABELS = [
  'Search',
  'Touring',
  'Audience',
  'Profiles',
  'Releases',
] as const;

async function installStableShell(page: Page) {
  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
  });
  await page.addInitScript(
    ({ cookieName, key, value }) => {
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      window.__JOVIE_CANONICAL_NAV_CLS__ = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as LayoutShift;
          if (!shift.hadRecentInput) {
            window.__JOVIE_CANONICAL_NAV_CLS__ += shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      value: overrides,
    }
  );
}

async function linkContract(links: Locator) {
  return links.evaluateAll(nodes =>
    nodes.map(node => ({
      label: node.textContent?.trim(),
      href: node.getAttribute('href'),
    }))
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('canonical six are stable at 375, 768, and 1440', async ({ page }) => {
  test.setTimeout(180_000);
  await installStableShell(page);
  await setTestAuthBypassSession(page, 'creator-ready');
  const chatWithProfileRail = `${APP_ROUTES.CHAT}?panel=profile`;
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(chatWithProfileRail)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    window.__JOVIE_CANONICAL_NAV_CLS__ = 0;
  });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const tabs = page.getByRole('navigation', { name: 'Dashboard Tabs' });
    await expect(tabs).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Dashboard Navigation' })
    ).toBeHidden();

    const directLinks = tabs.getByRole('link');
    await expect(directLinks).toHaveCount(3);
    expect(await linkContract(directLinks)).toEqual(
      CANONICAL_LABELS.slice(0, 3).map((label, index) => ({
        label,
        href: CANONICAL_HREFS[index],
      }))
    );

    const before = await tabs.boundingBox();
    const more = tabs.getByRole('button', { name: 'More options' });
    await more.focus();
    await page.keyboard.press('Enter');
    const expanded = page.getByRole('navigation', {
      name: 'Expanded Navigation Menu',
    });
    await expect(expanded).toBeVisible();
    const expandedLinks = expanded.getByRole('link');
    await expect(expandedLinks).toHaveCount(7);
    expect(await linkContract(expandedLinks)).toEqual([
      ...CANONICAL_LABELS.map((label, index) => ({
        label,
        href: CANONICAL_HREFS[index],
      })),
      { label: 'Settings', href: APP_ROUTES.SETTINGS },
    ]);
    for (const label of FORBIDDEN_LABELS) {
      await expect(expanded.getByRole('link', { name: label })).toHaveCount(0);
    }

    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(await tabs.boundingBox()).toEqual(before);
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopNav = page.getByRole('navigation', {
    name: 'Dashboard Navigation',
  });
  await expect(desktopNav).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Dashboard Tabs' })
  ).toBeHidden();

  const primarySection = desktopNav.locator('[data-nav-section]').first();
  expect(await linkContract(primarySection.getByRole('link'))).toEqual(
    CANONICAL_LABELS.map((label, index) => ({
      label,
      href: CANONICAL_HREFS[index],
    }))
  );
  for (const label of FORBIDDEN_LABELS) {
    await expect(primarySection.getByRole('link', { name: label })).toHaveCount(
      0
    );
  }

  const navBeforeRail = await desktopNav.boundingBox();
  const artistRow = desktopNav.getByRole('button', {
    name: /^Open .+ profile$/,
  });
  await artistRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('app-shell-right-rail')).toBeVisible();
  expect(await desktopNav.boundingBox()).toEqual(navBeforeRail);
  await expectNoHorizontalOverflow(page);

  const cls = await page.evaluate(
    () => window.__JOVIE_CANONICAL_NAV_CLS__ ?? Number.POSITIVE_INFINITY
  );
  expect(cls).toBeLessThanOrEqual(0.01);

  await page.goto(APP_ROUTES.CONTACTS, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.CONTACTS}$`));
  await expect(page.getByTestId('contacts-table')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/failed to load contacts/i)).toHaveCount(0);
});

declare global {
  interface LayoutShift extends PerformanceEntry {
    readonly hadRecentInput: boolean;
    readonly value: number;
  }

  interface Window {
    __JOVIE_CANONICAL_NAV_CLS__?: number;
  }
}
