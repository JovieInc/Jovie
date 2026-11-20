import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { assertExactNavigationUrl } from '../../helpers/vercel-preview';
import { SMOKE_TIMEOUTS, waitForHydration } from './smoke-test-utils';

/**
 * Shared production-certification assertion for `/onboarding/checkout` entry
 * (used by both the returning-creator canary `checkout-entry-renders` and the
 * fresh synthetic OTP user `fresh-user-checkout-entry`).
 *
 * Uses `source=intent&plan=pro&interval=month` so organic-offer once-per-artist
 * and live-profile gates do not redirect away, asserts landing on the exact
 * registered `/onboarding/checkout` screen, verifies the registry-derived plan
 * display name and monthly price render without error copy, and stops before
 * creating a Stripe Checkout session.
 */
export async function assertProdCertCheckoutEntry(
  page: Page,
  expectedOrigin: string
): Promise<void> {
  await page.goto(
    `${expectedOrigin}/onboarding/checkout?source=intent&plan=pro&interval=month`,
    {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    }
  );
  assertExactNavigationUrl(
    page.url(),
    expectedOrigin,
    'Onboarding checkout navigation'
  );
  expect(
    new URL(page.url()).pathname,
    'the checkout cert must land on the registered /onboarding/checkout screen'
  ).toBe(APP_ROUTES.ONBOARDING_CHECKOUT);
  await waitForHydration(page);
  await expect(
    page.getByRole('heading', { name: /upgrade to/i }).first()
  ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

  const planDisplayName = getPlanDisplayName('pro');
  const upgradeButton = page.getByRole('button', {
    name: `Upgrade to ${planDisplayName}`,
  });
  await expect(upgradeButton).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await expect(upgradeButton).toBeEnabled();

  const checkoutText = (
    await page.locator('main').first().innerText()
  ).toLowerCase();
  expect(checkoutText).not.toMatch(/application error|something went wrong/);
  expect(checkoutText).toContain(planDisplayName.toLowerCase());
  expect(checkoutText).toMatch(/\/mo/);
}
