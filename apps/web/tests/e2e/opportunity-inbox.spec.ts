/**
 * E2E smoke: Opportunity Inbox home surface (JOV-3386).
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { installAppFlagOverrides } from './helpers/app-flag-overrides';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Opportunity Inbox', () => {
  test('authenticated home renders the opportunity queue', async ({ page }) => {
    await setTestAuthBypassSession(page, 'creator-ready');
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('opportunity-inbox-page')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('button', { name: 'Needs You', exact: true })
    ).toBeVisible();

    const feed = page.getByTestId('opportunity-inbox-feed');
    const emptyState = page.getByTestId('opportunity-inbox-empty-state');
    await expect(
      feed
        .or(page.getByTestId('opportunity-card-stack'))
        .or(emptyState)
        .or(page.getByTestId('opportunity-inbox-availability'))
    ).toBeVisible();
  });

  for (const persona of ['creator-ready', 'admin'] as const) {
    test(`${persona} stays in the creator inbox with Inbox Home enabled`, async ({
      page,
    }) => {
      await installAppFlagOverrides(page, { INBOX_HOME: true });
      await setTestAuthBypassSession(page, persona);
      await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByTestId('opportunity-inbox-page')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('founder-review-stack')).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Start A Brain Dump' })
      ).toHaveCount(0);
      await expect(page.getByLabel('Typed fallback or refinement')).toHaveCount(
        0
      );
      await expect(
        page
          .getByTestId('opportunity-card-stack')
          .or(page.getByTestId('opportunity-inbox-empty-state'))
          .or(page.getByTestId('opportunity-inbox-availability'))
      ).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('opportunity-inbox-page')).toBeVisible();
      await expect(page.getByTestId('founder-review-stack')).toHaveCount(0);
      await expect(page.getByLabel('Typed fallback or refinement')).toHaveCount(
        0
      );
    });
  }
});
