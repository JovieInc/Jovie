/**
 * E2E smoke: Opportunity Inbox home surface (JOV-3386).
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  fillControlledInputUntilEnabled,
  setTestAuthBypassSession,
} from '../helpers/clerk-auth';
import { installAppFlagOverrides } from './helpers/app-flag-overrides';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Opportunity Inbox', () => {
  test('authenticated home renders the inbox surface', async ({ page }) => {
    await setTestAuthBypassSession(page, 'creator-ready');
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('opportunity-inbox-page')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Inbox', exact: true })
    ).toBeVisible();

    const feed = page.getByTestId('opportunity-inbox-feed');
    const emptyState = page.getByTestId('opportunity-inbox-empty-state');
    await expect(feed.or(emptyState)).toBeVisible();
  });

  test('founder brain dump survives a reload as a durable receipt', async ({
    page,
  }) => {
    await installAppFlagOverrides(page, { INBOX_HOME: true });
    await setTestAuthBypassSession(page, 'creator-ready');
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: 'Start A Brain Dump' })
    ).toBeVisible({ timeout: 30_000 });

    const typedFallback = page.getByLabel('Typed fallback or refinement');
    const save = page.getByRole('button', { name: 'Save Brain Dump' });
    await fillControlledInputUntilEnabled(
      typedFallback,
      save,
      'Keep the thumbnail decision calm, legible, and source-bound.'
    );
    await save.click();

    const receipt = page.getByText(
      'Saved · Inbox Brain Dump · transcript only'
    );
    await expect(receipt).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(receipt).toBeVisible({ timeout: 30_000 });

    const screenshotPath = process.env.FOUNDER_REVIEW_QA_SCREENSHOT;
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
