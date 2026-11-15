/**
 * E2E smoke: Opportunity Inbox home surface (JOV-3386).
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
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
      page
        .getByRole('button', { name: 'Needs You', exact: true })
        .or(page.getByRole('heading', { name: 'Make Jovie Yours' }))
    ).toBeVisible();

    const feed = page.getByTestId('opportunity-inbox-feed');
    const emptyState = page.getByTestId('opportunity-inbox-empty-state');
    await expect(
      feed
        .or(page.getByTestId('opportunity-card-stack'))
        .or(emptyState)
        .or(page.getByTestId('opportunity-inbox-availability'))
    ).toBeVisible();
    if ((await emptyState.getAttribute('data-home-setup')) === 'true') {
      await expect(
        page.getByRole('toolbar', { name: 'Inbox View' })
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add Notes' })).toHaveCount(
        0
      );
      await expect(
        emptyState.getByRole('link', { name: 'Start A Chat' })
      ).toHaveAttribute('href', APP_ROUTES.CHAT);
      await expect(emptyState.getByRole('progressbar')).toBeVisible();
      const setupLink = emptyState.getByRole('link', {
        name: /Complete Your Profile/,
      });
      await setupLink.focus();
      await expect(setupLink).toBeFocused();
    }
  });

  for (const persona of ['creator-ready', 'admin'] as const) {
    test(`${persona} stays in the creator inbox without rollout overrides`, async ({
      page,
    }) => {
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
