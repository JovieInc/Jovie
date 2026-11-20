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
        .or(page.getByRole('heading', { name: 'Plan Your Next Release' }))
        .first()
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
      if (
        (await emptyState.getAttribute('data-home-setup-state')) === 'complete'
      ) {
        // JOV-12615: finished setup is a quiet chip, not an open checklist.
        await expect(emptyState.getByRole('progressbar')).toHaveCount(0);
        await expect(
          emptyState.getByRole('button', { name: 'Setup Complete' })
        ).toBeVisible();
      } else {
        await expect(emptyState.getByRole('progressbar')).toBeVisible();
        const setupLink = emptyState.getByRole('link', {
          name: /Complete Your Profile/,
        });
        await setupLink.focus();
        await expect(setupLink).toBeFocused();
      }
    } else if (await emptyState.isVisible()) {
      // A clear queue has nothing to annotate, so no stray Notes line.
      await expect(emptyState).toContainText('Your Inbox Is Clear');
      await expect(page.getByRole('button', { name: 'Add Notes' })).toHaveCount(
        0
      );
    }
    // App updates live in the shell corner pill, never in the inbox content.
    await expect(
      page
        .getByTestId('opportunity-inbox-content')
        .getByTestId('runtime-update-pill')
    ).toHaveCount(0);
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
